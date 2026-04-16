"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/setup") return null;

  const navItems = [
    { href: "/", label: "チケット一覧" },
    { href: "/tickets/new", label: "新規取り込み" },
    { href: "/users", label: "ユーザー" },
    { href: "/audit", label: "監査ログ" },
  ];

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold text-gray-900">
            🐛 Issue Tracker
          </Link>
          <nav className="flex gap-4 text-sm">
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
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-700">{session.user.name}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50"
            >
              ログアウト
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
