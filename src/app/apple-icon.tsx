import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/iconArt";

// iOS は apple-touch-icon を自動的に角丸化するので、こちらは矩形でOK。
// 中身が全面に近いほどホーム画面で映える。
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<IconArt size={size.width} rounded={false} />, size);
}
