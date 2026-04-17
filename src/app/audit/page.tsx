"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AUDIT_ACTION_LABEL } from "@/lib/types";

interface AuditLogRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

function formatDetails(raw: string | null): string {
  if (!raw) return "";
  try {
    const v = JSON.parse(raw);
    return JSON.stringify(v, null, 2);
  } catch {
    return raw;
  }
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/audit", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLogs(d.logs || []))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">監査ログ</h1>
      <p className="mb-3 text-xs text-gray-500">
        直近200件を表示 (ヘッダーの監査ログ横の ↻ で更新できます)
      </p>

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!logs ? (
        <p className="text-gray-600">読み込み中...</p>
      ) : logs.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          ログがありません
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-600">
              <tr>
                <th className="px-3 py-2">日時</th>
                <th className="px-3 py-2">ユーザー</th>
                <th className="px-3 py-2">アクション</th>
                <th className="px-3 py-2">対象</th>
                <th className="px-3 py-2">詳細</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-gray-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">
                    {new Date(l.createdAt).toLocaleString("ja-JP")}
                  </td>
                  <td className="px-3 py-2">{l.user?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {AUDIT_ACTION_LABEL[l.action] ?? l.action}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">
                    {l.targetType === "Ticket" && l.targetId ? (
                      <Link
                        href={`/tickets/${l.targetId}`}
                        className="text-blue-700 hover:underline"
                      >
                        Ticket
                      </Link>
                    ) : l.targetType ? (
                      `${l.targetType}`
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {l.details ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-gray-600">
                          開く
                        </summary>
                        <pre className="mt-1 max-w-md whitespace-pre-wrap break-words rounded bg-gray-50 p-2 text-xs text-gray-700">
                          {formatDetails(l.details)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
