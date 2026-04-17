"use client";

/**
 * Notion AI 風の「!ai」トリガー付きテキスト入力。
 *
 *   1. ユーザーがテキスト欄で `!ai` と入力すると、その3文字が消えて
 *      プロンプト入力モーダルが開く。
 *   2. プロンプトを入力して Enter (または「生成」) を押すと、
 *      /api/ai-assist を叩いて Gemini で文章を生成。
 *   3. 生成結果をモーダルで表示し、OK でカーソル位置に挿入 / Cancel で破棄。
 *
 * 認識条件: `!ai` の直前が行頭 / 空白 / 改行 のいずれかである必要あり。
 *   (例: "hello!ai" は誤爆しない、"文章\n!ai" は発火する)
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

type AiState =
  | { phase: "idle" }
  | { phase: "prompting"; insertPos: number }
  | { phase: "generating"; insertPos: number; prompt: string }
  | {
      phase: "reviewing";
      insertPos: number;
      prompt: string;
      generated: string;
    };

type Element = HTMLTextAreaElement | HTMLInputElement;

interface CommonProps {
  value: string;
  onChange: (v: string) => void;
  fieldLabel?: string;
  className?: string;
  placeholder?: string;
  maxLength?: number;
}

interface TextareaOnlyProps {
  rows?: number;
}

interface InputOnlyProps {
  type?: string;
}

export function SmartTextarea(props: CommonProps & TextareaOnlyProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const ai = useAiFlow(props, ref);
  return (
    <>
      <textarea
        ref={ref}
        value={props.value}
        onChange={(e) => ai.handleChange(e.target.value, e.currentTarget)}
        className={props.className}
        placeholder={props.placeholder}
        rows={props.rows}
        maxLength={props.maxLength}
      />
      <AiOverlay ai={ai} fieldLabel={props.fieldLabel} />
    </>
  );
}

export function SmartInput(props: CommonProps & InputOnlyProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  const ai = useAiFlow(props, ref);
  return (
    <>
      <input
        ref={ref}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => ai.handleChange(e.target.value, e.currentTarget)}
        className={props.className}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
      />
      <AiOverlay ai={ai} fieldLabel={props.fieldLabel} />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function useAiFlow(
  { value, onChange, fieldLabel }: CommonProps,
  ref: RefObject<Element | null>,
) {
  const [state, setState] = useState<AiState>({ phase: "idle" });
  const valueRef = useRef(value);
  valueRef.current = value;

  const handleChange = useCallback(
    (newValue: string, el: Element) => {
      const pos = el.selectionStart ?? newValue.length;
      const before = newValue.slice(0, pos);
      if (before.endsWith("!ai")) {
        const prefix = before.slice(0, -3);
        const atBoundary = prefix === "" || /\s$/.test(prefix);
        if (atBoundary) {
          // !ai を取り除いてプロンプト入力へ
          const stripped = newValue.slice(0, pos - 3) + newValue.slice(pos);
          onChange(stripped);
          setState({ phase: "prompting", insertPos: pos - 3 });
          return;
        }
      }
      onChange(newValue);
    },
    [onChange],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  const submitPrompt = useCallback(
    async (prompt: string) => {
      const currentInsertPos =
        state.phase === "prompting"
          ? state.insertPos
          : state.phase === "reviewing"
            ? state.insertPos
            : null;
      if (currentInsertPos === null) return;

      setState({ phase: "generating", insertPos: currentInsertPos, prompt });

      try {
        const v = valueRef.current;
        const res = await fetch("/api/ai-assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            contextBefore: v.slice(0, currentInsertPos),
            contextAfter: v.slice(currentInsertPos),
            fieldLabel,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "failed");
        }
        setState({
          phase: "reviewing",
          insertPos: currentInsertPos,
          prompt,
          generated: String(data.text ?? "").trim(),
        });
      } catch (err) {
        alert(
          `AI生成に失敗しました: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        setState({ phase: "idle" });
      }
    },
    [state, fieldLabel],
  );

  const accept = useCallback(() => {
    if (state.phase !== "reviewing") return;
    const { insertPos, generated } = state;
    const v = valueRef.current;
    const newValue = v.slice(0, insertPos) + generated + v.slice(insertPos);
    onChange(newValue);
    setState({ phase: "idle" });
    setTimeout(() => {
      const el = ref.current;
      if (el) {
        el.focus();
        const p = insertPos + generated.length;
        // Textarea と Input の両方に setSelectionRange がある
        try {
          el.setSelectionRange(p, p);
        } catch {
          // ignore (type="date"等 setSelectionRange 非対応型)
        }
      }
    }, 0);
  }, [state, onChange, ref]);

  return { state, reset, accept, submitPrompt, handleChange };
}

/* -------------------------------------------------------------------------- */
/*  Overlay: prompt / generating / reviewing の3状態モーダル                    */
/* -------------------------------------------------------------------------- */

function AiOverlay({
  ai,
  fieldLabel,
}: {
  ai: ReturnType<typeof useAiFlow>;
  fieldLabel?: string;
}) {
  if (ai.state.phase === "idle") return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4"
      onClick={ai.state.phase === "generating" ? undefined : ai.reset}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <span>✨</span>
              <span>AI で生成</span>
            </h2>
            {fieldLabel && (
              <p className="truncate text-xs text-gray-500">
                フィールド: {fieldLabel}
              </p>
            )}
          </div>
          <button
            onClick={ai.reset}
            disabled={ai.state.phase === "generating"}
            className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {ai.state.phase === "prompting" && (
          <PromptingBody onSubmit={ai.submitPrompt} onCancel={ai.reset} />
        )}
        {ai.state.phase === "generating" && (
          <GeneratingBody prompt={ai.state.prompt} />
        )}
        {ai.state.phase === "reviewing" && (
          <ReviewingBody
            prompt={ai.state.prompt}
            generated={ai.state.generated}
            onAccept={ai.accept}
            onRetry={() => ai.submitPrompt(ai.state.phase === "reviewing" ? ai.state.prompt : "")}
            onCancel={ai.reset}
          />
        )}
      </div>
    </div>
  );
}

function PromptingBody({
  onSubmit,
  onCancel,
}: {
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const p = prompt.trim();
    if (!p) return;
    onSubmit(p);
  };

  return (
    <>
      <div className="space-y-2 overflow-auto p-4">
        <p className="text-xs text-gray-600">
          AI に生成してほしい内容を指示してください。Enter で実行、Shift+Enter で改行。
        </p>
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              onCancel();
            }
          }}
          rows={3}
          placeholder="例: 調査した結果を3行でまとめて"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
        <button
          onClick={onCancel}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          キャンセル
        </button>
        <button
          onClick={submit}
          disabled={!prompt.trim()}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          生成
        </button>
      </div>
    </>
  );
}

function GeneratingBody({ prompt }: { prompt: string }) {
  return (
    <div className="space-y-3 overflow-auto p-4">
      <p className="text-xs text-gray-500">プロンプト:</p>
      <div className="rounded bg-gray-50 p-2 text-xs text-gray-700 whitespace-pre-wrap break-words">
        {prompt}
      </div>
      <div className="flex items-center justify-center py-6">
        <span className="flex items-center gap-2 text-sm text-blue-600">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          生成中...
        </span>
      </div>
    </div>
  );
}

function ReviewingBody({
  prompt,
  generated,
  onAccept,
  onRetry,
  onCancel,
}: {
  prompt: string;
  generated: string;
  onAccept: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="space-y-3 overflow-auto p-4">
        <div>
          <p className="text-xs text-gray-500">プロンプト:</p>
          <div className="mt-1 rounded bg-gray-50 p-2 text-xs text-gray-700 whitespace-pre-wrap break-words">
            {prompt}
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500">生成された文章:</p>
          <div className="mt-1 whitespace-pre-wrap break-words rounded border border-blue-200 bg-blue-50/40 p-3 text-sm text-gray-900">
            {generated || "(空の応答)"}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
        <button
          onClick={onRetry}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          再生成
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          キャンセル
        </button>
        <button
          onClick={onAccept}
          disabled={!generated}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          OK / 挿入
        </button>
      </div>
    </>
  );
}
