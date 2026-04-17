"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const REPO_SLUG = "Rising-Entertainment-Soft/llm-powered-issue-tracker";
const REPO_URL = `https://github.com/${REPO_SLUG}`;

const FEATURES: { title: string; desc: string }[] = [
  {
    title: "LLM で自動構造化",
    desc: "Chatwork からの貼り付けテキストを Gemini 2.5 Flash がタイトル・要約・優先度・担当者・期日まで抽出。複数報告の自動分割にも対応。",
  },
  {
    title: "階層チケット管理",
    desc: "親チケットに「+ 子チケット」で紐付け。孫・ひ孫まで任意の深さで管理できます。",
  },
  {
    title: "!ai インライン生成",
    desc: "入力欄で `!ai` と打つとプロンプトモーダルが起動。前後文脈を踏まえた文章を生成して挿入。",
  },
  {
    title: "リアルタイム自動保存",
    desc: "タイトル・内容・対応内容・行内の各フィールドまで、デバウンス付きで即保存。保存ボタン不要。",
  },
  {
    title: "PWA 対応",
    desc: "ホーム画面に追加してアプリとして起動可能。モバイルのセーフエリアも考慮済み。",
  },
  {
    title: "ソート・フィルタ・監査ログ",
    desc: "5項目ソート、ステータス/担当者フィルタ。全操作は監査ログに残ります。",
  },
];

function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
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
    <div className="min-h-screen bg-white text-gray-900">
      {/* Top bar */}
      <header className="border-b border-gray-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="text-sm font-semibold">
            🐛 LLM Issue Tracker
          </span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-900 bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
          >
            <GitHubIcon />
            <span>GitHub</span>
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-gray-200">
        <div className="mx-auto max-w-5xl px-4 py-12 text-center sm:px-6 sm:py-16">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            不具合報告を、LLM で即チケット化
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-gray-600 sm:text-base">
            Chatwork 等から貼り付けたフリーテキストを Gemini 2.5 Flash
            が自動で分解・構造化。チームで運用しやすいチケット一覧にまとめる
            社内向けウェブアプリです。
          </p>

          {/* Repository Card — 全面アピール */}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group mx-auto mt-8 flex max-w-lg items-center gap-4 rounded-lg border border-gray-300 bg-white p-4 text-left transition hover:border-gray-900 hover:shadow-md"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-gray-50 text-gray-900 group-hover:bg-gray-900 group-hover:text-white">
              <GitHubIcon size={24} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-gray-500">
                Source on GitHub
              </span>
              <span className="block truncate font-mono text-sm font-semibold text-gray-900">
                {REPO_SLUG}
              </span>
              <span className="mt-0.5 block text-xs text-gray-600">
                ソースコード・Issue・Pull Request はこちら
              </span>
            </span>
            <span className="shrink-0 text-gray-400 group-hover:text-gray-900">
              →
            </span>
          </a>
        </div>
      </section>

      {/* Login form */}
      <section className="border-b border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-1 text-lg font-semibold">サインイン</h2>
            <p className="mb-5 text-xs text-gray-500">
              管理者から発行されたアカウントでログインしてください。
            </p>
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
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
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
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
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
                className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-60"
              >
                {submitting ? "ログイン中..." : "ログイン"}
              </button>
            </form>
            <p className="mt-4 text-[11px] text-gray-500">
              まだユーザーが居ない場合は自動的にセットアップ画面へ移動します。
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section>
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="text-center text-lg font-semibold">主な機能</h2>
          <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 md:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 text-gray-700">
                  <CheckIcon />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{f.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">
                    {f.desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Big GitHub CTA at bottom */}
      <section className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-5xl px-4 py-12 text-center sm:px-6">
          <h2 className="text-xl font-semibold">ソースコードは GitHub で公開</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
            バグ報告・機能提案・Pull Request は GitHub リポジトリからお願いします。
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-700"
          >
            <GitHubIcon size={18} />
            <span>リポジトリを開く</span>
          </a>
          <p className="mt-3 font-mono text-xs text-gray-500">{REPO_SLUG}</p>
        </div>
      </section>

      <footer className="border-t border-gray-200">
        <div className="mx-auto max-w-5xl px-4 py-4 text-center text-xs text-gray-500 sm:px-6">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-gray-900 hover:underline"
          >
            <GitHubIcon />
            <span>{REPO_SLUG}</span>
          </a>
        </div>
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
