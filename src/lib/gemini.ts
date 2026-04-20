import { GoogleGenAI, Type } from "@google/genai";

export interface ExtractedTicket {
  title: string;
  summary: string;
  /**
   * 本文中に「○○さんお願いします」「○○担当」など担当者を示唆する記述が
   * あれば、その人物の名前。報告者ではないことに注意。
   * 既存ユーザー名と照合して assigneeId をセットするのに使う。
   */
  assigneeHint?: string;
  suggestedPriority: "LOW" | "MEDIUM" | "HIGH";
  suggestedDueDate?: string; // ISO yyyy-mm-dd
  originalText: string;
  /**
   * 配列内でこのチケットの親を表すインデックス (0-based, 自分より前の要素)。
   * null / undefined ならルート。サーバー側で parentId に解決される。
   */
  parentIndex?: number | null;
}

const TICKET_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tickets: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "不具合の内容を一言で表す簡潔なタイトル(40文字以内)",
          },
          summary: {
            type: Type.STRING,
            description: "不具合の状況・再現手順・期待動作などを整理した要約(日本語、3〜6行)",
          },
          assigneeHint: {
            type: Type.STRING,
            description:
              "本文中に『○○さんお願いします』『○○さん対応してください』『担当: ○○』など、特定の人物に対応を依頼する記述がある場合のみ、その人物名を抽出する。報告者の名前ではないことに注意。読み取れない場合は空文字。",
            nullable: true,
          },
          suggestedPriority: {
            type: Type.STRING,
            enum: ["LOW", "MEDIUM", "HIGH"],
            description:
              "影響範囲や緊急性から推定される優先度。判断が難しければMEDIUM。",
          },
          suggestedDueDate: {
            type: Type.STRING,
            description:
              "本文中に期日や納期の記述があればYYYY-MM-DDで返す。無ければ空文字。",
            nullable: true,
          },
          originalText: {
            type: Type.STRING,
            description:
              "このチケットの根拠となる原文の該当部分。複数報告がある場合は該当ブロックのみ。",
          },
          parentIndex: {
            type: Type.INTEGER,
            description:
              "親チケットが配列内に存在する場合、その添字 (0始まり、自分より前の要素)。ルートチケット (親なし) の場合は省略または null。複数の関連サブタスクを親の下にぶら下げるのに使う。",
            nullable: true,
          },
        },
        required: [
          "title",
          "summary",
          "suggestedPriority",
          "originalText",
        ],
        propertyOrdering: [
          "title",
          "summary",
          "assigneeHint",
          "suggestedPriority",
          "suggestedDueDate",
          "originalText",
          "parentIndex",
        ],
      },
    },
  },
  required: ["tickets"],
};

/**
 * Retry wrapper for transient Gemini errors (503 UNAVAILABLE, 429 RESOURCE_EXHAUSTED,
 * 500/502 INTERNAL, および稀に発生する 401 の一時ゆらぎ).
 * Non-transient errors (e.g. 400 invalid request) are thrown immediately.
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = extractErrorCode(err);
      // 401 はクォータ逼迫時などに Google 側が一時的に返すことがあるので
      // 再試行対象に含める (本当にキー無効なら4回やっても落ちる)。
      const retryable =
        code === 401 ||
        code === 429 ||
        code === 500 ||
        code === 502 ||
        code === 503;
      if (!retryable || attempt === maxAttempts) {
        throw err;
      }
      // exponential backoff: 800ms, 1600ms, 3200ms (+ jitter)
      const delay = 800 * 2 ** (attempt - 1) + Math.random() * 300;
      console.warn(
        `[gemini] ${code} error, retrying (${attempt}/${maxAttempts - 1}) in ${Math.round(delay)}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function extractErrorCode(err: unknown): number | null {
  if (!err) return null;
  // @google/genai throws ApiError with .status / numeric code, sometimes nested in message JSON
  const anyErr = err as { status?: number; code?: number; message?: string };
  if (typeof anyErr.status === "number") return anyErr.status;
  if (typeof anyErr.code === "number") return anyErr.code;
  const msg = anyErr.message ?? "";
  const match = msg.match(/"code"\s*:\s*(\d+)/);
  if (match) return Number(match[1]);
  return null;
}

const SYSTEM_INSTRUCTION = `あなたはソフトウェアの不具合報告を構造化するアシスタントです。
ユーザーから渡される自由記述テキスト（Chatworkの不具合報告スレからのコピペ等）を読み、
不具合チケットとして管理しやすい形に分解してください。

【最重要: 入力テキストの完全性】
- 入力テキストは末尾まで必ず最後まで読み切ること。途中で読み飛ばさない。
- 改行は単なる視覚的な区切りであり、必ずしも別チケットの境界ではない。
  特に同じ報告者の発言が改行で続いている場合や、説明・再現手順が複数段落に
  分かれている場合は、ひとつのチケットとしてまとめること。
- 連続した空行 (\\n\\n) があっても、文脈として同じ話題が続いていれば
  分割せず1つのチケットにする。
- 短い発言（"はい""了解""確認します"等）は雑談として除外して良いが、
  本題に該当する内容は短くても必ずチケット化する。

【チケット分割とグルーピングの判定】
- 1つのテキストに**明らかに別件の不具合・タスク**が複数含まれている場合、
  それぞれを独立したチケットとして配列で返す。
- 「別の不具合」と判定する基準:
  - 異なる発言者・タイムスタンプによる別件報告
  - 明確に話題が切り替わる（"次に"、"別件で"、"---" 等の区切り）
  - 不具合の対象画面・機能が異なる
- 迷ったら分割せずまとめる方が望ましい。後で手動で分割できる。

【親子チケットとしてまとめる】
- 1つの話題の中に、明らかに複数の独立サブタスクが含まれる場合、
  親チケット1つの配下に子チケットとして並べる。
  - 親: 全体を表す要約 (例: 「機能Xの不具合調査」)
  - 子: 実際の作業単位 (例: 「フロント描画ロジック確認」「API応答確認」「テスト」)
- 出力は flat 配列。子の parentIndex に親の添字 (0始まり) を入れる。
  ルート (親) は parentIndex を省略 or null。
  親は必ず自分より前 (小さい添字) に並べる。
- 例:
  入力: 「管理画面の売上グラフが表示されない。フロント側の描画ロジックと
        バックエンド API の確認が必要。納期: 今週中。」
  出力:
    [0] 管理画面の売上グラフが表示されない (親, parentIndex=null)
    [1] フロント側の描画ロジック確認 (parentIndex=0)
    [2] バックエンドAPI応答確認 (parentIndex=0)
- 判断に迷う場合は親子化せずフラットで出す (手動で後から階層化できる)。

【担当者の自動推定】
- 本文中に「○○さんお願いします」「○○さん対応してください」「担当: ○○」
  等の記述があれば、その人物名を assigneeHint に入れる。
- これは報告者ではなく、対応を依頼された人物の名前。

【その他】
- 期日（"○月○日まで" "今週中" 等）が明示されていれば、今日の日付を基準に
  YYYY-MM-DD で suggestedDueDate に入れる。「今週中」など曖昧なら空文字。
- 優先度は本文の緊急度・影響範囲から判断
  ("緊急""至急""本番障害"→HIGH、"軽微""見栄え"→LOW、不明→MEDIUM)。
- originalText には、そのチケットの根拠となる原文の該当部分を、
  改行も含めて欠落なく抽出する。
- 出力は必ず指定スキーマに従ったJSON。本文以外の説明文は出力しない。`;

export async function extractTicketsFromText(
  rawText: string,
): Promise<ExtractedTicket[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const ai = new GoogleGenAI({ apiKey });

  const today = new Date().toISOString().slice(0, 10);

  const call = () =>
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `今日の日付: ${today}\n\n以下が不具合報告テキストです。:\n\n${rawText}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: TICKET_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
        temperature: 0.2,
      },
    });

  const response = await callWithRetry(call);

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  let parsed: { tickets?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${text.slice(0, 200)}`);
  }

  if (!parsed.tickets || !Array.isArray(parsed.tickets)) {
    throw new Error("Gemini response missing 'tickets' array");
  }

  return parsed.tickets.map((t: unknown, idx: number) => {
    const ticket = t as Record<string, unknown>;
    // parentIndex のバリデーション: 数値であり、かつ自身より前 (< idx) の要素を指す
    const rawParent = ticket.parentIndex;
    let parentIndex: number | null = null;
    if (typeof rawParent === "number" && Number.isInteger(rawParent)) {
      if (rawParent >= 0 && rawParent < idx) {
        parentIndex = rawParent;
      } else {
        // 不正な値は無視してルート扱い
        parentIndex = null;
      }
    }
    return {
      title: String(ticket.title ?? "").trim(),
      summary: String(ticket.summary ?? "").trim(),
      assigneeHint: ticket.assigneeHint
        ? String(ticket.assigneeHint).trim() || undefined
        : undefined,
      suggestedPriority:
        (ticket.suggestedPriority as ExtractedTicket["suggestedPriority"]) ??
        "MEDIUM",
      suggestedDueDate: ticket.suggestedDueDate
        ? String(ticket.suggestedDueDate).trim() || undefined
        : undefined,
      originalText: String(ticket.originalText ?? "").trim(),
      parentIndex,
    };
  });
}
