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
import { SmartInput, SmartTextarea } from "@/components/SmartEditors";

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
  /** 本文中で示唆された担当者の候補名 */
  assigneeHint?: string;
  suggestedPriority: Priority;
  suggestedDueDate?: string;
  originalText: string;
  /** 配列内で親となる要素の添字 (0-based, 自分より前)。null ならルート。 */
  parentIndex?: number | null;
}

// ステータスフィルタの拡張: INCOMPLETE = OPEN + IN_PROGRESS。デフォルト値。
type StatusFilter = "INCOMPLETE" | "ALL" | Status;

type SortKey =
  | "createdAt"
  | "dueDate"
  | "status"
  | "priority"
  | "assignee"
  | "reporter";

const SORT_LABELS: Record<SortKey, string> = {
  createdAt: "登録日（新しい順）",
  dueDate: "締切日（早い順）",
  status: "ステータス順",
  priority: "重要度（高い順）",
  assignee: "担当者名順",
  reporter: "報告者名順",
};

const STATUS_ORDER: Record<string, number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  DONE: 2,
  WONT_FIX: 3,
};
const PRIORITY_ORDER: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};
// 同点時はタイブレーカーとして登録日新しい順
const tieBreaker = (a: Ticket, b: Ticket) =>
  b.createdAt.localeCompare(a.createdAt);

function makeComparator(key: SortKey): (a: Ticket, b: Ticket) => number {
  switch (key) {
    case "createdAt":
      return (a, b) => b.createdAt.localeCompare(a.createdAt);
    case "dueDate":
      return (a, b) => {
        // 期日 null は末尾に追いやる
        if (!a.dueDate && !b.dueDate) return tieBreaker(a, b);
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        const c = a.dueDate.localeCompare(b.dueDate);
        return c !== 0 ? c : tieBreaker(a, b);
      };
    case "status":
      return (a, b) => {
        const c =
          (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
        return c !== 0 ? c : tieBreaker(a, b);
      };
    case "priority":
      return (a, b) => {
        const c =
          (PRIORITY_ORDER[a.priority] ?? 99) -
          (PRIORITY_ORDER[b.priority] ?? 99);
        return c !== 0 ? c : tieBreaker(a, b);
      };
    case "assignee":
      return (a, b) => {
        // 未割当は末尾
        const an = a.assignee?.name ?? "\uFFFF";
        const bn = b.assignee?.name ?? "\uFFFF";
        const c = an.localeCompare(bn, "ja");
        return c !== 0 ? c : tieBreaker(a, b);
      };
    case "reporter":
      return (a, b) => {
        const an = a.reporterName ?? "\uFFFF";
        const bn = b.reporterName ?? "\uFFFF";
        const c = an.localeCompare(bn, "ja");
        return c !== 0 ? c : tieBreaker(a, b);
      };
  }
}

export default function Home() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [modalTicket, setModalTicket] = useState<Ticket | null>(null);
  const [childModalParent, setChildModalParent] = useState<Ticket | null>(null);

  // デフォルトは「未完了のみ」(完了/対応しないを隠す)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("INCOMPLETE");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");

  // --- ドラッグ&ドロップ (親子付け替え) ---
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | "ROOT" | null>(
    null,
  );

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

  // ツリー構築用: parentId → children マップ。
  // 先に sortKey で全体をソートしてから入れることで、
  // ルート / 各親配下のどちらも同じソート順で並ぶ (階層は維持)。
  const childrenMap = useMemo(() => {
    const map = new Map<string | null, Ticket[]>();
    if (!tickets) return map;
    const sorted = [...tickets].sort(makeComparator(sortKey));
    for (const t of sorted) {
      const arr = map.get(t.parentId) ?? [];
      arr.push(t);
      map.set(t.parentId, arr);
    }
    return map;
  }, [tickets, sortKey]);

  // DnD: targetId を draggedId の新しい親にできるかチェック。
  // draggedId 自身や、draggedId の子孫を親にはできない (循環)。
  const canDropOn = useCallback(
    (draggedId: string, targetId: string | "ROOT"): boolean => {
      if (!draggedId) return false;
      if (targetId === "ROOT") return true;
      if (draggedId === targetId) return false;
      // BFS で draggedId のサブツリーを舐める
      const stack = [draggedId];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (id === targetId) return false;
        const kids = childrenMap.get(id) ?? [];
        stack.push(...kids.map((k) => k.id));
      }
      return true;
    },
    [childrenMap],
  );

  const reparent = useCallback(
    async (draggedId: string, newParentId: string | null) => {
      const dragged = tickets?.find((t) => t.id === draggedId);
      if (!dragged) return;
      // no-op (既に同じ親) なら何もしない
      if ((dragged.parentId ?? null) === newParentId) return;
      await patchTicket(draggedId, { parentId: newParentId });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tickets],
  );

  const dndHandlers: DnDHandlers = {
    draggingId,
    dragOverTarget,
    onDragStart: (id) => setDraggingId(id),
    onDragEnd: () => {
      setDraggingId(null);
      setDragOverTarget(null);
    },
    onDragEnterRow: (id) => {
      if (!draggingId) return;
      if (!canDropOn(draggingId, id)) return;
      setDragOverTarget(id);
    },
    onDropOnRow: (id) => {
      if (!draggingId) return;
      if (!canDropOn(draggingId, id)) return;
      reparent(draggingId, id);
    },
    onDragEnterRoot: () => {
      if (draggingId) setDragOverTarget("ROOT");
    },
    onDropOnRoot: () => {
      if (!draggingId) return;
      reparent(draggingId, null);
    },
  };

  // フィルタは「該当チケット or その祖先」を残してツリー形を保つ。
  // フィルタ条件を満たすチケットの ID 集合をまず作り、
  // そこから親をたどって祖先も生かす。
  const visibleIds = useMemo(() => {
    if (!tickets) return new Set<string>();
    const matchSelf = (t: Ticket) => {
      if (statusFilter === "INCOMPLETE") {
        if (t.status === "DONE" || t.status === "WONT_FIX") return false;
      } else if (statusFilter !== "ALL" && t.status !== statusFilter) {
        return false;
      }
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
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="INCOMPLETE">未完了のみ</option>
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
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">並び替え:</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
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
              dnd={dndHandlers}
            />
          ))}
          {draggingId && (
            <li
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                dndHandlers.onDragEnterRoot();
              }}
              onDrop={(e) => {
                e.preventDefault();
                dndHandlers.onDropOnRoot();
                dndHandlers.onDragEnd();
              }}
              className={`m-2 rounded border-2 border-dashed p-4 text-center text-sm ${
                dragOverTarget === "ROOT"
                  ? "border-blue-500 bg-blue-100 text-blue-800"
                  : "border-blue-300 bg-blue-50/50 text-blue-700"
              }`}
            >
              ⬆ ここへドロップでルート階層に移動
            </li>
          )}
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
            // reporterName はサーバー側でログインユーザー名に上書きされる
            assigneeId: null,
            assigneeHint: t.assigneeHint || null,
            dueDate: t.suggestedDueDate || null,
            priority: t.suggestedPriority,
            status: "OPEN",
            actionTaken: null,
            parentId: null,
            // LLM が親子判定した場合に使われる (サーバー側で parentId に解決)
            parentIndex:
              typeof t.parentIndex === "number" ? t.parentIndex : null,
          })),
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        setError(saveData.error || "保存に失敗しました");
        return;
      }
      setRawText("");
      const rootCount = extracted.filter(
        (t) => t.parentIndex == null,
      ).length;
      const childCount = extracted.length - rootCount;
      setSuccess(
        childCount > 0
          ? `${extracted.length}件 (親${rootCount} / 子${childCount}) を作成しました`
          : `${extracted.length}件のチケットを作成しました`,
      );
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

interface DnDHandlers {
  draggingId: string | null;
  dragOverTarget: string | "ROOT" | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragEnterRow: (id: string) => void;
  onDropOnRow: (id: string) => void;
  onDragEnterRoot: () => void;
  onDropOnRoot: () => void;
}

function TicketTreeNode({
  ticket,
  childrenMap,
  visibleIds,
  users,
  depth,
  expandedIds,
  dnd,
  ...handlers
}: {
  ticket: Ticket;
  childrenMap: Map<string | null, Ticket[]>;
  visibleIds: Set<string>;
  users: UserRow[];
  depth: number;
  expandedIds: Set<string>;
  dnd: DnDHandlers;
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
        dnd={dnd}
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
              dnd={dnd}
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
  dnd,
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
  dnd: DnDHandlers;
}) {
  // Inline 操作のクリック伝播を止める
  const stop = (e: React.MouseEvent | React.KeyboardEvent) =>
    e.stopPropagation();

  const indent = depth * 16; // px

  const isDragging = dnd.draggingId === ticket.id;
  const isDropTarget = dnd.dragOverTarget === ticket.id;

  return (
    <div
      onClick={onToggle}
      onDragOver={(e) => {
        if (!dnd.draggingId || dnd.draggingId === ticket.id) return;
        // preventDefault しないと drop が発火しない
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        dnd.onDragEnterRow(ticket.id);
      }}
      onDrop={(e) => {
        if (!dnd.draggingId) return;
        e.preventDefault();
        dnd.onDropOnRow(ticket.id);
        dnd.onDragEnd();
      }}
      className={`grid cursor-pointer grid-cols-1 gap-2 px-3 py-2 hover:bg-gray-50 md:grid-cols-[minmax(0,1fr)_104px_72px_136px_160px_28px] md:items-center ${
        expanded ? "bg-blue-50/40" : ""
      } ${isDragging ? "opacity-40" : ""} ${
        isDropTarget
          ? "bg-blue-100 ring-2 ring-inset ring-blue-500"
          : ""
      }`}
    >
      {/* タイトル列 */}
      <div className="flex min-w-0 items-start gap-1.5">
        {/* ドラッグハンドル (これだけ draggable=true、行全体は drop target) */}
        <span
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData("application/x-ticket-id", ticket.id);
            e.dataTransfer.effectAllowed = "move";
            dnd.onDragStart(ticket.id);
          }}
          onDragEnd={(e) => {
            e.stopPropagation();
            dnd.onDragEnd();
          }}
          onClick={stop}
          title="ドラッグで別のチケットへ移動 (親子付け替え)"
          className="mt-0.5 select-none text-gray-300 hover:text-gray-600 active:cursor-grabbing"
          style={{ cursor: "grab" }}
          aria-label="ドラッグハンドル"
        >
          ⋮⋮
        </span>
        <span
          className="mt-0.5 w-4 shrink-0 select-none text-center text-gray-400"
          aria-hidden
        >
          {expanded ? "▼" : "▶"}
        </span>
        <div className="min-w-0 flex-1" style={{ paddingLeft: indent }}>
          <div className="truncate font-medium text-gray-900">
            {ticket.title}
          </div>
          {(hasChildren || ticket.reporterName) && (
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
              {hasChildren && <span>子{childCount}件</span>}
              {ticket.reporterName && <span>👤 {ticket.reporterName}</span>}
            </div>
          )}
        </div>
      </div>

      {/*
        コントロール群: モバイルでは flex-wrap、デスクトップでは display: contents
        にしてラッパを消し、各コントロールが親 grid のセルに直接入る形にする。
        これで全行の列幅が固定値で揃う。
      */}
      <div
        className="flex flex-wrap items-center gap-2 md:contents"
        onClick={stop}
      >
        <StatusSelect
          value={ticket.status as Status}
          onChange={(v) => onPatch({ status: v })}
          widthClass="w-[104px]"
        />
        <PrioritySelect
          value={ticket.priority as Priority}
          onChange={(v) => onPatch({ priority: v })}
          widthClass="w-[72px]"
        />
        <select
          value={ticket.assignee?.id ?? ""}
          onChange={(e) => onPatch({ assigneeId: e.target.value || null })}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs w-[136px]"
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
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs w-[160px]"
        />
        <button
          onClick={onDelete}
          title="削除"
          aria-label="削除"
          className="justify-self-center rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
        >
          🗑
        </button>
      </div>
    </div>
  );
}

function StatusSelect({
  value,
  onChange,
  widthClass = "",
}: {
  value: Status;
  onChange: (v: Status) => void;
  widthClass?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Status)}
      className={`rounded border px-2 py-1 text-xs ${widthClass} ${STATUS_COLOR[value] ?? ""}`}
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
  widthClass = "",
}: {
  value: Priority;
  onChange: (v: Priority) => void;
  widthClass?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Priority)}
      className={`rounded border px-2 py-1 text-xs ${widthClass} ${PRIORITY_COLOR[value] ?? ""}`}
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
          <ShareButton ticket={ticket} />
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
/*  Share: copy ticket summary to clipboard in mail/chat-friendly format       */
/* -------------------------------------------------------------------------- */

function buildShareText(ticket: Ticket, url: string): string {
  const due = ticket.dueDate
    ? new Date(ticket.dueDate).toLocaleDateString("ja-JP")
    : "未設定";
  const description =
    (ticket.description && ticket.description.trim()) || "(未記入)";
  return [
    `【チケット共有】${ticket.title}`,
    "",
    "■ 概要",
    description,
    "",
    "■ 期限",
    due,
    "",
    "■ リンク",
    url,
  ].join("\n");
}

function ShareButton({ ticket }: { ticket: Ticket }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/tickets/${ticket.id}`;
    const text = buildShareText(ticket, url);
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 1800);
    }
  }

  return (
    <button
      onClick={handleCopy}
      title="タイトル・概要・期限・リンクをメール形式でコピー"
      className={`inline-flex items-center gap-1 rounded border px-3 py-1 text-xs font-medium transition ${
        state === "copied"
          ? "border-green-500 bg-green-50 text-green-700"
          : state === "error"
            ? "border-red-500 bg-red-50 text-red-700"
            : "border-gray-300 bg-white text-gray-700 hover:border-gray-900 hover:bg-gray-50"
      }`}
    >
      <span aria-hidden>{state === "copied" ? "✓" : "📤"}</span>
      <span>
        {state === "copied"
          ? "コピーしました"
          : state === "error"
            ? "失敗"
            : "共有コピー"}
      </span>
    </button>
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
      <SmartInput
        value={value}
        onChange={setValue}
        fieldLabel="タイトル"
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
      <SmartTextarea
        value={value}
        onChange={setValue}
        fieldLabel="内容 / やること"
        rows={4}
        placeholder="この不具合で何をすべきか・どう再現するか・期待動作など  (「!ai」と入力するとAIで生成)"
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
      <SmartTextarea
        value={value}
        onChange={setValue}
        fieldLabel="対応内容"
        rows={5}
        placeholder="調査結果・修正内容・暫定対応などを記録...  (「!ai」と入力するとAIで生成)"
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
            assigneeId: null,
            assigneeHint: t.assigneeHint || null,
            dueDate: t.suggestedDueDate || null,
            priority: t.suggestedPriority,
            status: "OPEN",
            actionTaken: null,
            // 子チケットモーダルから作る場合は親を固定。
            // LLM の parentIndex はサーバー側で無視される (parentId 優先)。
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
