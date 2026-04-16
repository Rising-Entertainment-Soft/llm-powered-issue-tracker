"use client";

import { useEffect } from "react";

/**
 * クライアントサイドで /sw.js を登録するだけのコンポーネント。
 * 本番ビルドでのみ動作 (dev で SW を入れると Next.js HMR と相性が悪いため)。
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[sw] registration failed", err);
    });
  }, []);
  return null;
}
