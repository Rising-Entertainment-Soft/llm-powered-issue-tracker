import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { auth } from "@/auth";
import { recordAudit } from "@/lib/audit";

const Schema = z.object({
  prompt: z.string().min(1).max(2000),
  contextBefore: z.string().max(20000).optional(),
  contextAfter: z.string().max(20000).optional(),
  fieldLabel: z.string().max(50).optional(),
});

const SYSTEM = `あなたは不具合チケット管理ツールの文章入力補助アシスタントです。
ユーザーは編集中のテキストフィールドに、AIで生成した文章を挿入しようとしています。

ルール:
- ユーザーの指示に従い、挿入すべき文章だけを出力する。
- 前置き・後書き・説明文・マークダウン装飾は付けない。
- 既存のテキスト（挿入位置の前後）がある場合は、自然に文脈が繋がるように書く。
- 日本語で、丁寧だが端的に書く。冗長な表現は避ける。
- フィールドの種類（タイトル / 内容 / 対応内容 など）に応じて適切な文体・長さにする:
  - タイトル: 40文字以内の端的な一文
  - 内容 / やること: 3〜6行程度、課題や必要作業を箇条書きや短い文で
  - 対応内容: 実施した調査・修正の要点を事実ベースで簡潔に`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { prompt, contextBefore = "", contextAfter = "", fieldLabel } = parsed.data;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set" },
      { status: 500 },
    );
  }

  const userText = [
    fieldLabel ? `編集中のフィールド: ${fieldLabel}` : null,
    contextBefore
      ? `【既存の文章 - 挿入位置より前】\n${contextBefore}`
      : null,
    contextAfter
      ? `【既存の文章 - 挿入位置より後】\n${contextAfter}`
      : null,
    `【ユーザーの指示】\n${prompt}`,
    "上記指示に従って、挿入位置に入れる文章だけを出力してください。",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: userText }] }],
      config: {
        systemInstruction: SYSTEM,
        thinkingConfig: { thinkingBudget: 0 },
        temperature: 0.6,
      },
    });

    const text = (response.text ?? "").trim();
    await recordAudit({
      userId: session.user.id,
      action: "AI_ASSIST",
      details: {
        fieldLabel,
        promptLen: prompt.length,
        outputLen: text.length,
      },
    });
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-assist] failed:", message);

    const code = /"code"\s*:\s*(\d+)/.exec(message)?.[1];
    if (code === "503" || /UNAVAILABLE|overloaded|high demand/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Gemini APIが混雑しています。少し時間をおいて再度お試しください。",
        },
        { status: 503 },
      );
    }
    if (code === "429" || /RESOURCE_EXHAUSTED|quota/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Gemini APIのレート上限に達しました。1分ほど待ってから再試行してください。",
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: `LLM呼び出しに失敗しました: ${message}` },
      { status: 500 },
    );
  }
}
