/**
 * Chatwork 投稿ヘルパー。
 *
 * 環境変数:
 *   CHATWORK_API_TOKEN - 投稿する bot アカウントの API トークン
 *   CHATWORK_ROOM_ID   - エスカレーション先の固定ルーム ID
 *   PUBLIC_APP_URL     - アプリの公開URL (チケットリンクの組み立てに使う)
 *
 * いずれかが欠けていれば投稿は行わず null を返す (開発環境や未設定で
 * エラーにしない、fire-and-forget でメインフローを止めないため)。
 */

export interface ChatworkConfig {
  token: string;
  roomId: string;
  appUrl: string;
}

export function getChatworkConfig(): ChatworkConfig | null {
  const token = process.env.CHATWORK_API_TOKEN?.trim();
  const roomId = process.env.CHATWORK_ROOM_ID?.trim();
  const appUrl = (
    process.env.PUBLIC_APP_URL?.trim() || process.env.AUTH_URL?.trim() || ""
  ).replace(/\/+$/, "");
  if (!token || !roomId) return null;
  return { token, roomId, appUrl };
}

export interface PostTicketParams {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | string | null;
  assigneeName?: string | null;
  reporterName?: string | null;
  priority?: string;
  parentTitle?: string | null;
  /** "new" or "escalate" — メッセージ見出しを切り替える */
  kind: "new" | "escalate";
}

const PRIORITY_LABEL_JA: Record<string, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
};

/**
 * Chatwork の [info][title]...[/title]...[/info] ブロック形式で
 * 1チケットぶんのメッセージを組み立てる。
 */
export function buildTicketMessage(
  cfg: ChatworkConfig,
  params: PostTicketParams,
): string {
  const heading =
    params.kind === "new"
      ? params.parentTitle
        ? `🐛 子チケット追加`
        : `🐛 新規チケット`
      : `📣 チケット共有`;

  const due = formatDue(params.dueDate);
  const description =
    (params.description && params.description.trim()) || "(未記入)";
  const priority =
    params.priority && PRIORITY_LABEL_JA[params.priority]
      ? PRIORITY_LABEL_JA[params.priority]
      : "中";
  const url = cfg.appUrl
    ? `${cfg.appUrl}/tickets/${params.id}`
    : `/tickets/${params.id}`;

  const lines = [
    `[info][title]${escape(heading)}: ${escape(params.title)}[/title]`,
    params.parentTitle ? `親: ${escape(params.parentTitle)}` : null,
    "",
    "■ 概要",
    escape(description),
    "",
    `■ 期限: ${escape(due)}`,
    params.assigneeName ? `■ 担当: ${escape(params.assigneeName)}` : `■ 担当: 未割当`,
    `■ 優先度: ${priority}`,
    params.reporterName ? `■ 取り込み: ${escape(params.reporterName)}` : null,
    "",
    `リンク: ${url}[/info]`,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

function formatDue(v: Date | string | null | undefined): string {
  if (!v) return "未設定";
  const d = typeof v === "string" ? new Date(v) : v;
  if (isNaN(d.getTime())) return "未設定";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// Chatwork のタグ構文と衝突する "["  "]" をそのまま書いてもほぼ問題ないが、
// 念のため HTML エスケープっぽい最低限のサニタイズだけ。
function escape(s: string): string {
  return s.replace(/\r/g, "");
}

/**
 * Chatwork API にメッセージを投稿する。成功なら message_id を返す。
 * 失敗しても例外は外に投げず null を返し console.error に記録する
 * (通知経路の失敗で本筋 (チケット作成) を止めたくない)。
 */
export async function postToChatwork(
  cfg: ChatworkConfig,
  body: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.chatwork.com/v2/rooms/${encodeURIComponent(cfg.roomId)}/messages`,
      {
        method: "POST",
        headers: {
          "X-ChatWorkToken": cfg.token,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ body, self_unread: "0" }).toString(),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[chatwork] post failed: ${res.status} ${res.statusText} - ${text.slice(0, 300)}`,
      );
      return null;
    }
    const data = (await res.json()) as { message_id?: string | number };
    return data.message_id != null ? String(data.message_id) : null;
  } catch (err) {
    console.error("[chatwork] post exception:", err);
    return null;
  }
}

