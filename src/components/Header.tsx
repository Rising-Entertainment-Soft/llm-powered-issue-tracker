"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

function ReloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block h-4 w-4 shrink-0"
      aria-hidden
    >
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/setup") return null;

  const navItems = [
    { href: "/", label: "チケット" },
    { href: "/users", label: "ユーザー" },
    { href: "/audit", label: "監査ログ" },
  ];

  return (
    <header
      className="sticky top-0 z-30 border-b border-gray-200 bg-white"
      // iOS のノッチ / Dynamic Island / ステータスバーに被らないよう
      // セーフエリア分の余白を確保。デスクトップでは env() が 0 になるので無害。
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:gap-x-6">
          <Link href="/" className="text-base font-bold text-gray-900 sm:text-lg">
            🐛 Issue Tracker
          </Link>
          <nav className="flex items-center gap-3 text-sm sm:gap-4">
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? "font-semibold text-blue-700"
                      : "text-gray-600 hover:text-gray-900"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2 text-sm sm:gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            title="このページを再読み込み (F5)"
            aria-label="再読み込み"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            <ReloadIcon />
          </button>
          {session?.user && (
            <>
              <span className="hidden text-gray-700 sm:inline">
                {session.user.name}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 sm:px-3 sm:text-sm"
              >
                ログアウト
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
