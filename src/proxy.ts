import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/setup",
  // PWA 関連はログイン無しでも返す必要がある
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon.ico",
];
// アイコンは /icon, /icon2, /icon3, /apple-icon など接頭辞マッチで許可
const PUBLIC_PREFIXES = ["/icon", "/apple-icon"];
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/setup"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next")
  ) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
