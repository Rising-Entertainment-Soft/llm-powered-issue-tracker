export const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "WONT_FIX"] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
};

export const STATUS_LABEL: Record<Status, string> = {
  OPEN: "未対応",
  IN_PROGRESS: "対応中",
  DONE: "完了",
  WONT_FIX: "対応しない",
};

export const STATUS_COLOR: Record<Status, string> = {
  OPEN: "bg-red-100 text-red-800 border-red-200",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800 border-yellow-200",
  DONE: "bg-green-100 text-green-800 border-green-200",
  WONT_FIX: "bg-gray-100 text-gray-700 border-gray-200",
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  LOW: "bg-gray-100 text-gray-700 border-gray-200",
  MEDIUM: "bg-blue-100 text-blue-800 border-blue-200",
  HIGH: "bg-orange-100 text-orange-800 border-orange-200",
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  LOGIN: "ログイン",
  LOGOUT: "ログアウト",
  CREATE_USER: "ユーザー作成",
  CREATE_TICKET: "チケット作成",
  UPDATE_TICKET: "チケット更新",
  DELETE_TICKET: "チケット削除",
  EXTRACT: "LLM解析",
};
