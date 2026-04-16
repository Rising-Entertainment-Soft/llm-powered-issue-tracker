"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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

interface Ticket {
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

interface ExtractedTicket {
  title: string;
  summary: string;
  reporterName?: string;
  suggestedPriority: Priority;
  suggestedDueDate?: string;
  originalText: string;
}

export default function Home() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalTicket, setModalTicket] = useState<Ticket | null>(null);

  const [statusFilter, setStatusFilter] = useState<Status | "ALL">("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("ALL");

  const loadTickets = useCallback(async () => {
    const r = await fetch("/api/tickets");
    const d = await r.json();
    setTickets(d.tickets || []);
  }, []);

  const loadUsers = useCallback(async () => {
    const r = await fetch("/api/users");
    const d = await r.json();
    setUsers(d.users || []);
  }, []);

  useEffect(() => {
    loadTickets();
    loadUsers();
  }, [loadTickets, loadUsers]);

  /** Patch a ticket on the server, then merge the returned ticket into local state. */
  const patchTicket = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        console.error("[patch] failed", await res.text());
        return null;
      }
      const d = await res.json();
      setTickets((cur) =>
        cur ? cur.map((t) => (t.id === id ? { ...t, ...d.ticket } : t)) : cur,
      );
      return d.ticket as Ticket;
    },
    [],
  );

  const deleteTicket = useCallback(async (id: string) => {
    if (!confirm("このチケットを削除しますか？")) return;
    const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("削除に失敗しました");
      return;
    }
    setTickets((cur) => (cur ? cur.filter((t) => t.id !== id) : cur));
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
      <h1 className="mb-4 text-2xl font-bold text-gray-900">チケット</h1>

      <ExtractForm onCreated={loadTickets} />

      <div className="my-4 flex flex-wrap gap-3 rounded-md border border-gray-200 bg-white p-3">
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
        <div className="ml-auto text-xs text-gray-500 self-center">
          {filtered.length} / {tickets?.length ?? 0} 件
        </div>
      </div>

      {!tickets ? (
        <p className="text-gray-600">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          チケットはまだありません。上のフォームから報告テキストを取り込んでください。
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-600">
              <tr>
                <th className="w-8 px-2 py-2"></th>
                <th className="px-3 py-2">タイトル</th>
                <th className="px-3 py-2">ステータス</th>
                <th className="px-3 py-2">優先度</th>
                <th className="px-3 py-2">担当者</th>
                <th className="px-3 py-2">期日</th>
                <th className="px-3 py-2">報告者</th>
                <th className="w-8 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <TicketRowWithAccordion
                  key={t.id}
                  ticket={t}
                  users={users}
                  expanded={expandedId === t.id}
                  onToggle={() =>
                    setExpandedId((cur) => (cur === t.id ? null : t.id))
                  }
                  onPatch={(patch) => patchTicket(t.id, patch)}
                  onDelete={() => deleteTicket(t.id)}
                  onShowOriginal={() => setModalTicket(t)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalTicket && (
        <OriginalModal
          ticket={modalTicket}
          onClose={() => setModalTicket(null)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Extract form                                                               */
/* -------------------------------------------------------------------------- */

function ExtractForm({ onCreated }: { onCreated: () => void }) {
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit() {
    if (!rawText.trim() || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const exRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });
      const exData = await exRes.json();
      if (!exRes.ok) {
        setError(exData.error || "解析に失敗しました");
        return;
      }
      const extracted: ExtractedTicket[] = exData.tickets || [];
      if (extracted.length === 0) {
        setError("抽出できる不具合報告が見つかりませんでした");
        return;
      }
      const saveRes = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickets: extracted.map((t) => ({
            title: t.title,
            originalText: `【要約】\n${t.summary}\n\n【原文】\n${t.originalText}`,
            reporterName: t.reporterName || null,
            assigneeId: null,
            dueDate: t.suggestedDueDate || null,
            priority: t.suggestedPriority,
            status: "OPEN",
            actionTaken: null,
          })),
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        setError(saveData.error || "保存に失敗しました");
        return;
      }
      setRawText("");
      setSuccess(`${extracted.length}件のチケットを作成しました`);
      onCreated();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          不具合報告テキストを貼り付けて取り込み
        </label>
        <span className="text-xs text-gray-500">
          複数件混ざっていてもLLMが自動で分割します
        </span>
      </div>
      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        rows={5}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder={`例:\n[2026/04/16 10:23] 田中\nダッシュボードでグラフが表示されません。至急対応お願いします。\n\n[2026/04/16 10:45] 佐藤\n発注画面の合計金額が税抜きになってる。`}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex-1 text-xs">
          {error && <span className="text-red-700">{error}</span>}
          {success && <span className="text-green-700">{success}</span>}
        </div>
        <button
          onClick={onSubmit}
          disabled={busy || !rawText.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "取り込み中..." : "取り込む"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Ticket row with inline edits + accordion                                   */
/* -------------------------------------------------------------------------- */

function TicketRowWithAccordion({
  ticket,
  users,
  expanded,
  onToggle,
  onPatch,
  onDelete,
  onShowOriginal,
}: {
  ticket: Ticket;
  users: UserRow[];
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: Record<string, unknown>) => Promise<Ticket | null>;
  onDelete: () => void;
  onShowOriginal: () => void;
}) {
  // Stop the row-toggle click from firing when interacting with edit controls
  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer border-t border-gray-100 hover:bg-gray-50 ${
          expanded ? "bg-blue-50/40" : ""
        }`}
      >
        <td className="px-2 py-2 text-gray-400">{expanded ? "▼" : "▶"}</td>
        <td className="px-3 py-2">
          <span className="font-medium text-gray-900">{ticket.title}</span>
        </td>
        <td className="px-3 py-2" onClick={stop}>
          <StatusSelect
            value={ticket.status as Status}
            onChange={(v) => onPatch({ status: v })}
          />
        </td>
        <td className="px-3 py-2" onClick={stop}>
          <PrioritySelect
            value={ticket.priority as Priority}
            onChange={(v) => onPatch({ priority: v })}
          />
        </td>
        <td className="px-3 py-2" onClick={stop}>
          <select
            value={ticket.assignee?.id ?? ""}
            onChange={(e) =>
              onPatch({ assigneeId: e.target.value || null })
            }
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          >
            <option value="">未割当</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2" onClick={stop}>
          <input
            type="date"
            value={ticket.dueDate ? ticket.dueDate.slice(0, 10) : ""}
            onChange={(e) =>
              onPatch({ dueDate: e.target.value || null })
            }
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          />
        </td>
        <td className="px-3 py-2 text-gray-700">
          {ticket.reporterName ?? "—"}
        </td>
        <td className="px-2 py-2" onClick={stop}>
          <button
            onClick={onDelete}
            title="削除"
            className="text-gray-400 hover:text-red-600"
          >
            🗑
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/60">
          <td colSpan={8} className="px-4 py-4">
            <AccordionBody
              ticket={ticket}
              onPatch={onPatch}
              onShowOriginal={onShowOriginal}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: Status;
  onChange: (v: Status) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Status)}
      className={`rounded border px-2 py-1 text-xs ${STATUS_COLOR[value] ?? ""}`}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

function PrioritySelect({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (v: Priority) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Priority)}
      className={`rounded border px-2 py-1 text-xs ${PRIORITY_COLOR[value] ?? ""}`}
    >
      {PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {PRIORITY_LABEL[p]}
        </option>
      ))}
    </select>
  );
}

/* -------------------------------------------------------------------------- */
/*  Accordion body: action taken editor (autosave) + original button           */
/* -------------------------------------------------------------------------- */

function AccordionBody({
  ticket,
  onPatch,
  onShowOriginal,
}: {
  ticket: Ticket;
  onPatch: (patch: Record<string, unknown>) => Promise<Ticket | null>;
  onShowOriginal: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            タイトル
          </h3>
          <TitleEditor
            key={`title-${ticket.id}`}
            initial={ticket.title}
            onSave={(value) => onPatch({ title: value })}
          />
        </div>
        <button
          onClick={onShowOriginal}
          className="mt-5 shrink-0 rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          原文を見る
        </button>
      </div>
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          対応内容
        </h3>
        <ActionTakenEditor
          key={`action-${ticket.id}`}
          initial={ticket.actionTaken ?? ""}
          onSave={(value) => onPatch({ actionTaken: value || null })}
        />
      </div>
    </div>
  );
}

function TitleEditor({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (value: string) => Promise<Ticket | null>;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">(
    "idle",
  );
  const lastSavedRef = useRef(initial);

  // Debounced autosave on change. Empty title is rejected by API (min(1)),
  // so we just skip the save until something is typed.
  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === lastSavedRef.current.trim()) return;
    if (trimmed.length === 0) {
      setStatus("error");
      return;
    }
    setStatus("dirty");
    const timer = setTimeout(async () => {
      setStatus("saving");
      const saved = await onSave(trimmed);
      if (saved) {
        lastSavedRef.current = trimmed;
        setStatus("saved");
      } else {
        setStatus("error");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [value, onSave]);

  return (
    <div>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={200}
        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <div className="mt-1 text-right text-xs">
        <span
          className={
            status === "saving"
              ? "text-blue-600"
              : status === "saved"
                ? "text-green-600"
                : status === "dirty"
                  ? "text-gray-500"
                  : status === "error"
                    ? "text-red-600"
                    : "text-gray-400"
          }
        >
          {status === "saving" && "保存中..."}
          {status === "saved" && "✓ 保存済み"}
          {status === "dirty" && "入力中..."}
          {status === "error" && "タイトルは必須です"}
        </span>
      </div>
    </div>
  );
}

function ActionTakenEditor({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (value: string) => Promise<Ticket | null>;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved">(
    "idle",
  );
  const initialRef = useRef(initial);
  const lastSavedRef = useRef(initial);

  // When user types, mark dirty and schedule debounced save.
  useEffect(() => {
    if (value === lastSavedRef.current) return;
    setStatus("dirty");
    const timer = setTimeout(async () => {
      setStatus("saving");
      const saved = await onSave(value);
      if (saved) {
        lastSavedRef.current = value;
        setStatus("saved");
      } else {
        // Revert to dirty on failure so the user sees something is wrong.
        setStatus("dirty");
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [value, onSave]);

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={5}
        placeholder="調査結果・修正内容・暫定対応などを記録..."
        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-gray-400">
          {value === initialRef.current
            ? "入力するとリアルタイムで自動保存されます"
            : ""}
        </span>
        <span
          className={
            status === "saving"
              ? "text-blue-600"
              : status === "saved"
                ? "text-green-600"
                : status === "dirty"
                  ? "text-gray-500"
                  : "text-gray-400"
          }
        >
          {status === "saving" && "保存中..."}
          {status === "saved" && "✓ 保存済み"}
          {status === "dirty" && "入力中..."}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Original text modal                                                        */
/* -------------------------------------------------------------------------- */

function OriginalModal({
  ticket,
  onClose,
}: {
  ticket: Ticket;
  onClose: () => void;
}) {
  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {ticket.title}
            </h2>
            <p className="text-xs text-gray-500">
              原文 / 取り込みテキスト
              {ticket.reporterName ? ` · 報告者: ${ticket.reporterName}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <div className="overflow-auto p-4">
          <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-3 text-xs text-gray-800">
            {ticket.originalText}
          </pre>
        </div>
      </div>
    </div>
  );
}
