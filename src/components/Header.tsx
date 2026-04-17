"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

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
          <nav className="flex gap-3 text-sm sm:gap-4">
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
        {session?.user && (
          <div className="flex items-center gap-2 text-sm sm:gap-3">
            <span className="hidden text-gray-700 sm:inline">
              {session.user.name}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 sm:px-3 sm:text-sm"
            >
              ログアウト
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
