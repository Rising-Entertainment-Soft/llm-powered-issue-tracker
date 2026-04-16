import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LLM Issue Tracker",
    short_name: "Issues",
    description:
      "Chatworkからの不具合報告をLLMで構造化して一元管理するチケットトラッカー",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f172a",
    theme_color: "#6366f1",
    lang: "ja",
    icons: [
      { src: "/icon", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon2", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon3",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
