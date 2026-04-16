"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  type Priority,
} from "@/lib/types";

interface UserRow {
  id: string;
  name: string;
}

interface DraftTicket {
  title: string;
  summary: string;
  reporterName: string;
  suggestedPriority: Priority;
  suggestedDueDate: string;
  originalText: string;
  // editable extras
  assigneeId: string;
  selected: boolean;
}

export default function NewTicketsPage() {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [drafts, setDrafts] = useState<DraftTicket[] | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => {});
  }, []);

  async function onExtract() {
    setError(null);
    setDrafts(null);
    if (!rawText.trim()) {
      setError("テキストを入力してください");
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "解析に失敗しました");
        return;
      }
      const extracted: DraftTicket[] = (data.tickets || []).map(
        (t: {
          title: string;
          summary: string;
          reporterName?: string;
          suggestedPriority: Priority;
          suggestedDueDate?: string;
          originalText: string;
        }) => ({
          title: t.title,
          summary: t.summary,
          reporterName: t.reporterName ?? "",
          suggestedPriority: t.suggestedPriority,
          suggestedDueDate: t.suggestedDueDate ?? "",
          originalText: t.originalText,
          assigneeId: "",
          selected: true,
        }),
      );
      setDrafts(extracted);
    } catch (e) {
      setError(String(e));
    } finally {
      setExtracting(false);
    }
  }

  function updateDraft(idx: number, patch: Partial<DraftTicket>) {
    setDrafts((cur) =>
      cur ? cur.map((d, i) => (i === idx ? { ...d, ...patch } : d)) : cur,
    );
  }

  async function onSave() {
    if (!drafts) return;
    const selected = drafts.filter((d) => d.selected);
    if (selected.length === 0) {
      setError("保存対象がありません");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        tickets: selected.map((d) => ({
          title: d.title,
          // Save the LLM summary into actionTaken? No — keep summary as part of originalText area.
          // We store the summary as part of the ticket title context; original text gets the source extract.
          originalText: `【要約】\n${d.summary}\n\n【原文】\n${d.originalText}`,
          reporterName: d.reporterName || null,
          assigneeId: d.assigneeId || null,
          dueDate: d.suggestedDueDate || null,
          priority: d.suggestedPriority,
          status: "OPEN",
          actionTaken: null,
        })),
      };
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "保存に失敗しました");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">
        報告テキストから取り込み
      </h1>

      <div className="mb-6 rounded-md border border-gray-200 bg-white p-4">
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Chatworkなどから報告テキストをそのまま貼り付け
        </label>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={10}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={`例:\n[2026/04/16 10:23] 田中\nログイン後のダッシュボード画面で、グラフが表示されません。\n再現:\n1. ログイン\n2. ダッシュボードを開く\n→ 真っ白\n至急対応お願いします\n\n[2026/04/16 10:45] 佐藤\n発注画面の合計金額が税抜きになってる。先月までは税込みでした。`}
        />
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            複数の不具合が混ざっていてもOK。LLMが分割します。
          </p>
          <button
            onClick={onExtract}
            disabled={extracting || !rawText.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {extracting ? "解析中..." : "LLMで解析"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {drafts && drafts.length === 0 && (
        <p className="rounded border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          抽出できる不具合報告が見つかりませんでした
        </p>
      )}

      {drafts && drafts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              抽出結果 ({drafts.length}件)
            </h2>
            <button
              onClick={onSave}
              disabled={saving || drafts.filter((d) => d.selected).length === 0}
              className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving
                ? "保存中..."
                : `選択した${drafts.filter((d) => d.selected).length}件をチケット化`}
            </button>
          </div>

          {drafts.map((d, idx) => (
            <div
              key={idx}
              className={`rounded-md border p-4 ${
                d.selected
                  ? "border-blue-300 bg-white"
                  : "border-gray-200 bg-gray-50 opacity-60"
              }`}
            >
              <div className="mb-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={d.selected}
                  onChange={(e) =>
                    updateDraft(idx, { selected: e.target.checked })
                  }
                  className="h-4 w-4"
                />
                <span className="text-xs text-gray-500">
                  チケット #{idx + 1}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-gray-600">
                    タイトル
                  </label>
                  <input
                    value={d.title}
                    onChange={(e) =>
                      updateDraft(idx, { title: e.target.value })
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">
                    報告者
                  </label>
                  <input
                    value={d.reporterName}
                    onChange={(e) =>
                      updateDraft(idx, { reporterName: e.target.value })
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">
                    担当者
                  </label>
                  <select
                    value={d.assigneeId}
                    onChange={(e) =>
                      updateDraft(idx, { assigneeId: e.target.value })
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
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
                  <label className="mb-1 block text-xs text-gray-600">
                    優先度
                  </label>
                  <select
                    value={d.suggestedPriority}
                    onChange={(e) =>
                      updateDraft(idx, {
                        suggestedPriority: e.target.value as Priority,
                      })
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">
                    期日
                  </label>
                  <input
                    type="date"
                    value={d.suggestedDueDate}
                    onChange={(e) =>
                      updateDraft(idx, { suggestedDueDate: e.target.value })
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-gray-600">
                    要約（LLM生成、編集可）
                  </label>
                  <textarea
                    value={d.summary}
                    onChange={(e) =>
                      updateDraft(idx, { summary: e.target.value })
                    }
                    rows={3}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-gray-600">
                    原文（編集可）
                  </label>
                  <textarea
                    value={d.originalText}
                    onChange={(e) =>
                      updateDraft(idx, { originalText: e.target.value })
                    }
                    rows={3}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
