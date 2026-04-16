"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_COLOR,
  STATUS_LABEL,
  type Status,
} from "@/lib/types";

interface TicketRow {
  id: string;
  title: string;
  reporterName: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  actionTaken: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
}

interface UserRow {
  id: string;
  name: string;
}

export default function TicketsListPage() {
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<Status | "ALL">("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("ALL");

  useEffect(() => {
    fetch("/api/tickets")
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets || []))
      .catch((e) => setError(String(e)));
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!tickets) return [];
    return tickets.filter((t) => {
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (assigneeFilter !== "ALL") {
        if (assigneeFilter === "UNASSIGNED" && t.assignee) return false;
        if (
          assigneeFilter !== "UNASSIGNED" &&
          t.assignee?.id !== assigneeFilter
        )
          return false;
      }
      return true;
    });
  }, [tickets, statusFilter, assigneeFilter]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">チケット一覧</h1>
        <Link
          href="/tickets/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 報告テキストから取り込み
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 rounded-md border border-gray-200 bg-white p-3">
        <div>
          <label className="mr-2 text-sm text-gray-600">ステータス:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Status | "ALL")}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="ALL">すべて</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mr-2 text-sm text-gray-600">担当者:</label>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="ALL">すべて</option>
            <option value="UNASSIGNED">未割当</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!tickets ? (
        <p className="text-gray-600">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          表示するチケットはありません
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-600">
              <tr>
                <th className="px-3 py-2">タイトル</th>
                <th className="px-3 py-2">ステータス</th>
                <th className="px-3 py-2">優先度</th>
                <th className="px-3 py-2">担当者</th>
                <th className="px-3 py-2">期日</th>
                <th className="px-3 py-2">報告者</th>
                <th className="px-3 py-2">更新</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/tickets/${t.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded border px-2 py-0.5 text-xs ${
                        STATUS_COLOR[t.status as Status] ?? ""
                      }`}
                    >
                      {STATUS_LABEL[t.status as Status] ?? t.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded border px-2 py-0.5 text-xs ${
                        PRIORITY_COLOR[
                          t.priority as keyof typeof PRIORITY_COLOR
                        ] ?? ""
                      }`}
                    >
                      {PRIORITY_LABEL[
                        t.priority as keyof typeof PRIORITY_LABEL
                      ] ?? t.priority}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {t.assignee?.name ?? (
                      <span className="text-gray-400">未割当</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {t.dueDate
                      ? new Date(t.dueDate).toLocaleDateString("ja-JP")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {t.reporterName ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {new Date(t.updatedAt).toLocaleString("ja-JP", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
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
