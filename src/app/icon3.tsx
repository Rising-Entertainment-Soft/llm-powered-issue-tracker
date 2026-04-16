import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/iconArt";

// Android maskable icons は OS が円や角丸でマスクするので、
// 角丸無し（矩形フルブリード）+ 内容を中央 80% にまとめる。
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <IconArt size={size.width} rounded={false} mask />,
    size,
  );
}
