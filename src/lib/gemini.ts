import { GoogleGenAI, Type } from "@google/genai";

export interface ExtractedTicket {
  title: string;
  summary: string;
  reporterName?: string;
  suggestedPriority: "LOW" | "MEDIUM" | "HIGH";
  suggestedDueDate?: string; // ISO yyyy-mm-dd
  originalText: string;
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
          reporterName: {
            type: Type.STRING,
            description:
              "Chatworkの発言者名や報告者名が読み取れる場合のみ抽出。読み取れない場合は空文字。",
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
          "reporterName",
          "suggestedPriority",
          "suggestedDueDate",
          "originalText",
        ],
      },
    },
  },
  required: ["tickets"],
};

const SYSTEM_INSTRUCTION = `あなたはソフトウェアの不具合報告を構造化するアシスタントです。
ユーザーから渡される自由記述テキスト（Chatworkの不具合報告スレからのコピペ等）を読み、
不具合チケットとして管理しやすい形に分解してください。

ルール:
- 1つのテキストに複数の不具合報告が含まれている場合は、それぞれを独立したチケットとして配列で返す。
- 雑談・あいさつ・本題と無関係な発言は除外する。
- 報告者名（[名前] や 「○○さんから」など）が読み取れる場合は reporterName に入れる。
- 期日（"○月○日まで" "今週中" 等）が明示されていれば、今日の日付を基準に YYYY-MM-DD で suggestedDueDate に入れる。
  ただし「今週中」など曖昧なら無理に推定せず空文字で良い。
- 優先度は本文の緊急度・影響範囲から判断（"緊急""至急""本番障害"→HIGH、"軽微""見栄え"→LOW、不明→MEDIUM）。
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

  const response = await ai.models.generateContent({
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

  return parsed.tickets.map((t: unknown) => {
    const ticket = t as Record<string, unknown>;
    return {
      title: String(ticket.title ?? "").trim(),
      summary: String(ticket.summary ?? "").trim(),
      reporterName: ticket.reporterName
        ? String(ticket.reporterName).trim() || undefined
        : undefined,
      suggestedPriority:
        (ticket.suggestedPriority as ExtractedTicket["suggestedPriority"]) ??
        "MEDIUM",
      suggestedDueDate: ticket.suggestedDueDate
        ? String(ticket.suggestedDueDate).trim() || undefined
        : undefined,
      originalText: String(ticket.originalText ?? "").trim(),
    };
  });
}
