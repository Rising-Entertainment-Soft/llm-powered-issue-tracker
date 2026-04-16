import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { extractTicketsFromText } from "@/lib/gemini";
import { recordAudit } from "@/lib/audit";

const ExtractSchema = z.object({
  text: z.string().min(1).max(50000),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = ExtractSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "テキストが空、または長すぎます" },
      { status: 400 },
    );
  }

  try {
    const tickets = await extractTicketsFromText(parsed.data.text);
    await recordAudit({
      userId: session.user.id,
      action: "EXTRACT",
      details: { inputChars: parsed.data.text.length, count: tickets.length },
    });
    return NextResponse.json({ tickets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[extract] failed:", message);
    return NextResponse.json(
      { error: `LLM呼び出しに失敗しました: ${message}` },
      { status: 500 },
    );
  }
}
