"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const REPO_URL =
  "https://github.com/Rising-Entertainment-Soft/llm-powered-issue-tracker";

const FEATURES: { emoji: string; title: string; desc: string }[] = [
  {
    emoji: "🤖",
    title: "LLM で自動構造化",
    desc: "Chatworkスレをそのまま貼り付ければ、Gemini 2.5 Flash がタイトル・要約・優先度・担当者・期日まで抽出。複数報告も自動で分割。",
  },
  {
    emoji: "🌳",
    title: "階層チケット管理",
    desc: "親チケットに「+ 子チケット」で関連タスクを紐付け。孫・ひ孫まで任意の深さで構築可能。",
  },
  {
    emoji: "✨",
    title: "!ai でAI文章生成",
    desc: "入力欄で `!ai` と入力するとプロンプトモーダルが起動。前後文脈を踏まえた文をその場で挿入。",
  },
  {
    emoji: "💾",
    title: "リアルタイム自動保存",
    desc: "タイトル・内容・対応内容はすべてデバウンス付きで即座に保存。チケットの行内編集も含めて保存ボタン不要。",
  },
  {
    emoji: "📱",
    title: "PWA 対応",
    desc: "ブラウザから「ホーム画面に追加」でインストール可能。オフラインでも最近見たチケットは閲覧できます。",
  },
  {
    emoji: "🔍",
    title: "フィルタ・ソート・監査ログ",
    desc: "担当者 / ステータスでフィルタ、5項目でソート。全操作は監査ログに残り、誰がいつ何をしたか追跡可能。",
  },
];

const TECH: string[] = [
  "Next.js 16",
  "TypeScript",
  "Tailwind CSS v4",
  "Prisma 7",
  "SQLite",
  "Auth.js v5",
  "Gemini 2.5 Flash",
];

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => setNeedsSetup(!!d.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  useEffect(() => {
    if (needsSetup) router.replace("/setup");
  }, [needsSetup, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });
    setSubmitting(false);
    if (res?.error) {
      setError("メールアドレスまたはパスワードが正しくありません");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-fuchsia-50 to-amber-50">
      {/* Top bar */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-amber-500 text-white shadow-sm"
            aria-hidden
          >
            🐛
          </span>
          LLM Issue Tracker
        </span>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white/70 px-3 py-1 text-xs text-gray-700 backdrop-blur hover:bg-white hover:text-gray-900"
        >
          <GitHubIcon />
          <span className="hidden sm:inline">GitHub で見る</span>
          <span className="sm:hidden">GitHub</span>
        </a>
      </header>

      {/* Main grid */}
      <main className="mx-auto grid max-w-6xl gap-8 px-4 pb-12 pt-4 sm:px-6 md:grid-cols-[1.2fr_1fr] md:gap-12 md:pt-8">
        {/* Hero / features */}
        <section>
          <div className="mb-6">
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl md:text-5xl">
              不具合報告を、<br />
              <span className="bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-amber-600 bg-clip-text text-transparent">
                LLM で即チケット化
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-sm text-gray-600 sm:text-base">
              Chatwork や Slack から貼り付けたフリーテキストを、Gemini
              2.5 Flash が自動で分解・要約。タイトル・担当者・期日・優先度を構造化して、
              チームで運用しやすいチケット一覧にまとめます。
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="rounded-lg border border-gray-200 bg-white/60 p-3 shadow-sm backdrop-blur transition hover:bg-white"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-hidden>
                    {f.emoji}
                  </span>
                  <h3 className="text-sm font-semibold text-gray-900">
                    {f.title}
                  </h3>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">
                  {f.desc}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-1.5">
            {TECH.map((t) => (
              <span
                key={t}
                className="rounded-full border border-gray-200 bg-white/60 px-2 py-0.5 text-[11px] text-gray-600"
              >
                {t}
              </span>
            ))}
          </div>
        </section>

        {/* Login form card */}
        <section className="md:sticky md:top-8 md:self-start">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl shadow-indigo-100/50">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-gray-900">
                サインイン
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                管理者から発行されたアカウントでログインしてください。
              </p>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  メールアドレス
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  パスワード
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p className="rounded bg-red-50 p-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-indigo-200 transition hover:shadow-lg hover:shadow-indigo-300 disabled:opacity-60"
              >
                {submitting ? "ログイン中..." : "ログイン"}
              </button>
            </form>
            <div className="mt-5 border-t border-gray-100 pt-3 text-center text-[11px] text-gray-500">
              ユーザーがまだ一人も居ない場合、自動的にセットアップ画面へ移動します。
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white/60 py-4 text-center text-xs text-gray-500 backdrop-blur">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900 hover:underline"
        >
          <GitHubIcon />
          <span>Rising-Entertainment-Soft / llm-powered-issue-tracker</span>
        </a>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8">読み込み中...</div>}>
      <LoginForm />
    </Suspense>
  );
}
