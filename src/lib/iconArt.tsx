import type { CSSProperties } from "react";

/**
 * 共通アイコンデザイン。
 * インディゴ→フクシア→アンバーのグラデ背景の上に、
 *   - 白い太線3本（チケット/タスクリストを表現）
 *   - 右上に黄色いスパーク（LLMの示唆）
 * を載せた構成。Satori (next/og) で動く CSS サブセットだけを使う。
 *
 * `mask` を true にすると Android の maskable icon 仕様に合わせて
 * 中央 80% に内容を収めセーフゾーンを取る。
 */
export function IconArt({
  size,
  rounded,
  mask = false,
}: {
  size: number;
  rounded: boolean;
  mask?: boolean;
}) {
  // Satori はピクセル単位での指定が一番安定するので絶対値で組む
  const safe = mask ? 0.8 : 1.0;
  const barW = Math.round(size * 0.42 * safe);
  const barH = Math.max(8, Math.round(size * 0.07 * safe));
  const gap = Math.round(size * 0.06 * safe);
  const dot = Math.max(8, Math.round(size * 0.09 * safe));
  const radius = rounded ? Math.round(size * 0.22) : 0;

  const wrap: CSSProperties = {
    width: "100%",
    height: "100%",
    background:
      "linear-gradient(135deg, #6366f1 0%, #ec4899 55%, #f59e0b 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius,
  };

  const stack: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap,
    position: "relative",
  };

  const bar = (widthScale: number, opacity: number): CSSProperties => ({
    width: Math.round(barW * widthScale),
    height: barH,
    background: `rgba(255,255,255,${opacity})`,
    borderRadius: barH / 2,
  });

  return (
    <div style={wrap}>
      <div style={stack}>
        <div style={bar(1.0, 1.0)} />
        <div style={bar(0.78, 0.9)} />
        <div style={bar(0.55, 0.7)} />
        <div
          style={{
            position: "absolute",
            top: -Math.round(dot * 0.7),
            right: -Math.round(dot * 0.7),
            width: dot,
            height: dot,
            background: "#fde047",
            borderRadius: "50%",
            display: "flex",
          }}
        />
      </div>
    </div>
  );
}
