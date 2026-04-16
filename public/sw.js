// 最低限の Service Worker。
// PWA install プロンプトを Chrome に出すために fetch ハンドラが必要。
// オフライン専用ページの提供までは行わず、
//   - ナビゲーション (HTML) は network-first
//   - 静的アセット (JS/CSS/画像) は stale-while-revalidate
// で動かす。API リクエストは触らない（常にネットワーク直）。

const CACHE = "lit-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 認証・API・next-auth まわりは触らない
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/setup")
  ) {
    return;
  }

  // ナビゲーション (HTML) は network-first → キャッシュフォールバック
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          throw new Error("offline");
        }
      })(),
    );
    return;
  }

  // 静的アセット: stale-while-revalidate
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon") ||
    url.pathname.startsWith("/apple-icon") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || (await network);
      })(),
    );
  }
});
