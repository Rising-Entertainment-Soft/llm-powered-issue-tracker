import { ImageResponse } from "next/og";

// ブラウザタブの favicon として使われる 32x32 の小サイズ版。
// PWA 本体 (icon.tsx) と同じグラデ+白バーのモチーフを、
// 小サイズで潰れないようバー2本にデフォルメ。
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #6366f1 0%, #ec4899 55%, #f59e0b 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          borderRadius: 7,
        }}
      >
        <div
          style={{
            width: 20,
            height: 5,
            background: "white",
            borderRadius: 2.5,
          }}
        />
        <div
          style={{
            width: 14,
            height: 5,
            background: "rgba(255,255,255,0.85)",
            borderRadius: 2.5,
          }}
        />
      </div>
    ),
    size,
  );
}
