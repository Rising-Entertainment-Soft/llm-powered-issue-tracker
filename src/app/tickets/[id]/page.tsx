"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PRIORITIES,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_COLOR,
  STATUS_LABEL,
  type Priority,
  type Status,
} from "@/lib/types";

interface TicketData {
  id: string;
  title: string;
  originalText: string;
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

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    title: "",
    reporterName: "",
    assigneeId: "",
    dueDate: "",
    priority: "MEDIUM" as Priority,
    status: "OPEN" as Status,
    actionTaken: "",
  });

  useEffect(() => {
    fetch(`/api/tickets/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ticket) {
          setError(d.error || "Not found");
          return;
        }
        const t: TicketData = d.ticket;
        setTicket(t);
        setForm({
          title: t.title,
          reporterName: t.reporterName ?? "",
          assigneeId: t.assignee?.id ?? "",
          dueDate: t.dueDate ? t.dueDate.slice(0, 10) : "",
          priority: t.priority as Priority,
          status: t.status as Status,
          actionTaken: t.actionTaken ?? "",
        });
      })
      .catch((e) => setError(String(e)));
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => {});
  }, [id]);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          reporterName: form.reporterName || null,
          assigneeId: form.assigneeId || null,
          dueDate: form.dueDate || null,
          priority: form.priority,
          status: form.status,
          actionTaken: form.actionTaken || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "保存に失敗しました");
        return;
      }
      setTicket(data.ticket);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm("このチケットを削除してよろしいですか？")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "削除に失敗しました");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  if (error && !ticket) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
        <Link href="/" className="mt-4 inline-block text-blue-700 underline">
          ← 一覧へ戻る
        </Link>
      </div>
    );
  }
  if (!ticket) {
    return <p className="p-6 text-gray-600">読み込み中...</p>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/" className="mb-4 inline-block text-sm text-blue-700 hover:underline">
        ← 一覧へ戻る
      </Link>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-block rounded border px-2 py-0.5 text-xs ${
            STATUS_COLOR[ticket.status as Status] ?? ""
          }`}
        >
          {STATUS_LABEL[ticket.status as Status] ?? ticket.status}
        </span>
        <span
          className={`inline-block rounded border px-2 py-0.5 text-xs ${
            PRIORITY_COLOR[ticket.priority as Priority] ?? ""
          }`}
        >
          優先度: {PRIORITY_LABEL[ticket.priority as Priority] ?? ticket.priority}
        </span>
        <span className="text-xs text-gray-500">
          作成: {ticket.createdBy?.name ?? "?"} /{" "}
          {new Date(ticket.createdAt).toLocaleString("ja-JP")}
        </span>
        <span className="text-xs text-gray-500">
          更新: {new Date(ticket.updatedAt).toLocaleString("ja-JP")}
        </span>
      </div>

      <div className="rounded-md border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-gray-600">タイトル</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">ステータス</label>
            <select
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as Status })
              }
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">優先度</label>
            <select
              value={form.priority}
              onChange={(e) =>
                setForm({ ...form, priority: e.target.value as Priority })
              }
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">担当者</label>
            <select
              value={form.assigneeId}
              onChange={(e) =>
                setForm({ ...form, assigneeId: e.target.value })
              }
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">未割当</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-600">期日</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-gray-600">報告者</label>
            <input
              value={form.reporterName}
              onChange={(e) =>
                setForm({ ...form, reporterName: e.target.value })
              }
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-gray-600">対応内容</label>
            <textarea
              value={form.actionTaken}
              onChange={(e) =>
                setForm({ ...form, actionTaken: e.target.value })
              }
              rows={5}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="調査結果・修正内容・暫定対応などを記録"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={onDelete}
            disabled={deleting}
            className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "削除中..." : "削除"}
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">
          原文 / 取り込みテキスト
        </h2>
        <pre className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-800">
          {ticket.originalText}
        </pre>
      </div>
    </div>
  );
}
