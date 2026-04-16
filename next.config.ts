import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub Actions でビルド → サーバーに最小アーティファクトをコピーする方式なので
  // node_modules 丸ごとではなく standalone 出力（必要な依存だけ .next/standalone/ に同梱）を使う。
  output: "standalone",
};

export default nextConfig;
