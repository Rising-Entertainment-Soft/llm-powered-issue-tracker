import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/iconArt";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<IconArt size={size.width} rounded />, size);
}
