"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
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
  description: string | null;
  originalText: string;
  reporterName: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  actionTaken: string | null;
  parentId: string | null;
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [modalTicket, setModalTicket] = useState<Ticket | null>(null);
  const [childModalParent, setChildModalParent] = useState<Ticket | null>(null);

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

  const deleteTicket = useCallback(async (id: string, title: string) => {
    if (!confirm(`「${title}」を削除しますか？\n子チケットも全て削除されます。`)) return;
    const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("削除に失敗しました");
      return;
    }
    // 子孫もまとめて消えたので、ローカルからも丸ごと削除
    setTickets((cur) => {
      if (!cur) return cur;
      const removeIds = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        cur.forEach((t) => {
          if (t.parentId && removeIds.has(t.parentId) && !removeIds.has(t.id)) {
            removeIds.add(t.id);
            changed = true;
          }
        });
      }
      return cur.filter((t) => !removeIds.has(t.id));
    });
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ツリー構築用: parentId → children マップ
  const childrenMap = useMemo(() => {
    const map = new Map<string | null, Ticket[]>();
    if (!tickets) return map;
    for (const t of tickets) {
      const arr = map.get(t.parentId) ?? [];
      arr.push(t);
      map.set(t.parentId, arr);
    }
    return map;
  }, [tickets]);

  // フィルタは「該当チケット or その祖先」を残してツリー形を保つ。
  // フィルタ条件を満たすチケットの ID 集合をまず作り、
  // そこから親をたどって祖先も生かす。
  const visibleIds = useMemo(() => {
    if (!tickets) return new Set<string>();
    const matchSelf = (t: Ticket) => {
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
    };
    const ids = new Set<string>();
    const byId = new Map(tickets.map((t) => [t.id, t]));
    for (const t of tickets) {
      if (matchSelf(t)) {
        let cur: Ticket | undefined = t;
        while (cur && !ids.has(cur.id)) {
          ids.add(cur.id);
          cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
      }
    }
    return ids;
  }, [tickets, statusFilter, assigneeFilter]);

  const roots = childrenMap.get(null) ?? [];
  const visibleRoots = roots.filter((r) => visibleIds.has(r.id));
  const totalVisible = visibleIds.size;

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      <h1 className="mb-4 text-xl sm:text-2xl font-bold text-gray-900">
        チケット
      </h1>

      <ExtractForm onCreated={loadTickets} />

      <div className="my-4 flex flex-wrap gap-3 rounded-md border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">ステータス:</label>
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
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">担当者:</label>
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
        <div className="ml-auto self-center text-xs text-gray-500">
          {totalVisible} / {tickets?.length ?? 0} 件
        </div>
      </div>

      {!tickets ? (
        <p className="text-gray-600">読み込み中...</p>
      ) : visibleRoots.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          チケットはまだありません。上のフォームから報告テキストを取り込んでください。
        </p>
      ) : (
        <ul className="overflow-hidden rounded-md border border-gray-200 bg-white">
          {visibleRoots.map((t) => (
            <TicketTreeNode
              key={t.id}
              ticket={t}
              childrenMap={childrenMap}
              visibleIds={visibleIds}
              users={users}
              depth={0}
              expandedIds={expandedIds}
              onToggleExpanded={toggleExpanded}
              onPatch={patchTicket}
              onDelete={deleteTicket}
              onShowOriginal={setModalTicket}
              onAddChild={setChildModalParent}
            />
          ))}
        </ul>
      )}

      {modalTicket && (
        <OriginalModal
          ticket={modalTicket}
          onClose={() => setModalTicket(null)}
        />
      )}
      {childModalParent && (
        <ChildExtractModal
          parent={childModalParent}
          onClose={() => setChildModalParent(null)}
          onCreated={() => {
            setChildModalParent(null);
            loadTickets();
            // 親を自動的に展開しておく
            setExpandedIds((cur) => new Set(cur).add(childModalParent.id));
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Extract form (top-level paste-and-extract)                                 */
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
            description: t.summary || null,
            originalText: t.originalText,
            reporterName: t.reporterName || null,
            assigneeId: null,
            dueDate: t.suggestedDueDate || null,
            priority: t.suggestedPriority,
            status: "OPEN",
            actionTaken: null,
            parentId: null,
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
    <div className="rounded-md border border-gray-200 bg-white p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="block text-sm font-medium text-gray-700">
          不具合報告テキストを貼り付けて取り込み
        </label>
        <span className="hidden sm:inline text-xs text-gray-500">
          複数件混ざっていてもLLMが自動で分割します
        </span>
      </div>
      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        rows={5}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder={`例:\n[2026/04/16 10:23] 田中\nダッシュボードでグラフが表示されません。`}
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
/*  Tree node (recursive)                                                      */
/* -------------------------------------------------------------------------- */

interface NodeHandlers {
  onToggleExpanded: (id: string) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<Ticket | null>;
  onDelete: (id: string, title: string) => void;
  onShowOriginal: (t: Ticket) => void;
  onAddChild: (t: Ticket) => void;
}

function TicketTreeNode({
  ticket,
  childrenMap,
  visibleIds,
  users,
  depth,
  expandedIds,
  ...handlers
}: {
  ticket: Ticket;
  childrenMap: Map<string | null, Ticket[]>;
  visibleIds: Set<string>;
  users: UserRow[];
  depth: number;
  expandedIds: Set<string>;
} & NodeHandlers) {
  const expanded = expandedIds.has(ticket.id);
  const children = (childrenMap.get(ticket.id) ?? []).filter((c) =>
    visibleIds.has(c.id),
  );

  return (
    <li className="border-t border-gray-100 first:border-t-0">
      <TicketRow
        ticket={ticket}
        users={users}
        depth={depth}
        expanded={expanded}
        hasChildren={children.length > 0}
        childCount={children.length}
        onToggle={() => handlers.onToggleExpanded(ticket.id)}
        onPatch={(patch) => handlers.onPatch(ticket.id, patch)}
        onDelete={() => handlers.onDelete(ticket.id, ticket.title)}
      />
      {expanded && (
        <AccordionBody
          ticket={ticket}
          depth={depth}
          onPatch={(patch) => handlers.onPatch(ticket.id, patch)}
          onShowOriginal={() => handlers.onShowOriginal(ticket)}
          onAddChild={() => handlers.onAddChild(ticket)}
        />
      )}
      {children.length > 0 && (
        <ul>
          {children.map((c) => (
            <TicketTreeNode
              key={c.id}
              ticket={c}
              childrenMap={childrenMap}
              visibleIds={visibleIds}
              users={users}
              depth={depth + 1}
              expandedIds={expandedIds}
              {...handlers}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row: responsive layout (stacks on mobile, single line on md+)              */
/* -------------------------------------------------------------------------- */

function TicketRow({
  ticket,
  users,
  depth,
  expanded,
  hasChildren,
  childCount,
  onToggle,
  onPatch,
  onDelete,
}: {
  ticket: Ticket;
  users: UserRow[];
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  childCount: number;
  onToggle: () => void;
  onPatch: (patch: Record<string, unknown>) => Promise<Ticket | null>;
  onDelete: () => void;
}) {
  // Inline 操作のクリック伝播を止める
  const stop = (e: React.MouseEvent | React.KeyboardEvent) =>
    e.stopPropagation();

  const indent = depth * 16; // px

  return (
    <div
      onClick={onToggle}
      className={`cursor-pointer px-3 py-2.5 hover:bg-gray-50 ${
        expanded ? "bg-blue-50/40" : ""
      }`}
    >
      {/* 上段: 折り畳みトグル + タイトル + (md以上のみ右にコントロール群) */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        {/* タイトル列 */}
        <div
          className="flex min-w-0 flex-1 items-center gap-2"
          style={{ paddingLeft: indent }}
        >
          <span
            className="shrink-0 select-none text-gray-400 w-4 text-center"
            aria-hidden
          >
            {expanded ? "▼" : "▶"}
          </span>
          <span className="min-w-0 truncate font-medium text-gray-900">
            {ticket.title}
          </span>
          {hasChildren && (
            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
              子{childCount}
            </span>
          )}
        </div>

        {/* コントロール群 (mobile では折り返す flex-wrap、md以上では1行) */}
        <div
          className="flex flex-wrap items-center gap-2"
          onClick={stop}
        >
          <StatusSelect
            value={ticket.status as Status}
            onChange={(v) => onPatch({ status: v })}
          />
          <PrioritySelect
            value={ticket.priority as Priority}
            onChange={(v) => onPatch({ priority: v })}
          />
          <select
            value={ticket.assignee?.id ?? ""}
            onChange={(e) => onPatch({ assigneeId: e.target.value || null })}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          >
            <option value="">未割当</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={ticket.dueDate ? ticket.dueDate.slice(0, 10) : ""}
            onChange={(e) => onPatch({ dueDate: e.target.value || null })}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          />
          {ticket.reporterName && (
            <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
              👤 {ticket.reporterName}
            </span>
          )}
          <button
            onClick={onDelete}
            title="削除"
            aria-label="削除"
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            🗑
          </button>
        </div>
      </div>
    </div>
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
/*  Accordion body                                                             */
/* -------------------------------------------------------------------------- */

function AccordionBody({
  ticket,
  depth,
  onPatch,
  onShowOriginal,
  onAddChild,
}: {
  ticket: Ticket;
  depth: number;
  onPatch: (patch: Record<string, unknown>) => Promise<Ticket | null>;
  onShowOriginal: () => void;
  onAddChild: () => void;
}) {
  const indent = depth * 16 + 24; // 親の三角と揃える

  return (
    <div
      className="bg-gray-50/70 px-3 pb-4 pt-2"
      style={{ paddingLeft: indent + 12 }}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onAddChild}
            className="rounded border border-dashed border-blue-400 bg-white px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
          >
            + 子チケット
          </button>
        </div>

        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            タイトル
          </h3>
          <TitleEditor
            key={`title-${ticket.id}`}
            initial={ticket.title}
            onSave={(value) => onPatch({ title: value })}
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              内容 / やること
            </h3>
            <button
              onClick={onShowOriginal}
              className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              原文を見る
            </button>
          </div>
          <DescriptionEditor
            key={`desc-${ticket.id}`}
            initial={ticket.description ?? ""}
            onSave={(value) => onPatch({ description: value || null })}
          />
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
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Editors with debounced autosave                                            */
/* -------------------------------------------------------------------------- */

function TitleEditor({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (value: string) => Promise<Ticket | null>;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<
    "idle" | "dirty" | "saving" | "saved" | "error"
  >("idle");
  const lastSavedRef = useRef(initial);

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
      <SaveStatusLabel status={status} errorText="タイトルは必須です" />
    </div>
  );
}

function DescriptionEditor({
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
  const lastSavedRef = useRef(initial);

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
        rows={4}
        placeholder="この不具合で何をすべきか・どう再現するか・期待動作など"
        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <SaveStatusLabel status={status} />
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
  const lastSavedRef = useRef(initial);

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
      <SaveStatusLabel status={status} />
    </div>
  );
}

function SaveStatusLabel({
  status,
  errorText = "保存に失敗",
}: {
  status: "idle" | "dirty" | "saving" | "saved" | "error";
  errorText?: string;
}) {
  return (
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
        {status === "error" && errorText}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Modal: original text view                                                  */
/* -------------------------------------------------------------------------- */

function OriginalModal({
  ticket,
  onClose,
}: {
  ticket: Ticket;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-gray-900">
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

/* -------------------------------------------------------------------------- */
/*  Modal: child ticket extract & create                                       */
/* -------------------------------------------------------------------------- */

function ChildExtractModal({
  parent,
  onClose,
  onCreated,
}: {
  parent: Ticket;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, busy]);

  async function onSubmit() {
    if (!rawText.trim() || busy) return;
    setBusy(true);
    setError(null);
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
            description: t.summary || null,
            originalText: t.originalText,
            reporterName: t.reporterName || null,
            assigneeId: null,
            dueDate: t.suggestedDueDate || null,
            priority: t.suggestedPriority,
            status: "OPEN",
            actionTaken: null,
            parentId: parent.id,
          })),
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        setError(saveData.error || "保存に失敗しました");
        return;
      }
      onCreated();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-gray-900">
              子チケットを追加
            </h2>
            <p className="truncate text-xs text-gray-500">親: {parent.title}</p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3 overflow-auto p-4">
          <p className="text-xs text-gray-600">
            子チケットの本文を貼り付けてください。複数件含まれていれば自動的に分割します。
          </p>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={6}
            placeholder="この親チケットに紐づく不具合・タスクの本文..."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {error && <p className="text-xs text-red-700">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={onSubmit}
            disabled={busy || !rawText.trim()}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "取り込み中..." : "取り込む"}
          </button>
        </div>
      </div>
    </div>
  );
}
