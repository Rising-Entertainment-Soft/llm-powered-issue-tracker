import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { PRIORITIES, STATUSES } from "@/lib/types";

const TicketInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).optional().nullable(),
  originalText: z.string().min(1).max(50000),
  // reporterName は無視 (常にログインユーザー名で上書きする)
  reporterName: z.string().max(120).optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  // 本文中で特定の担当者が示唆されていれば、その名前。
  // 既存ユーザーと曖昧マッチして見つかれば assigneeId にする。
  // 明示的な assigneeId が指定されていればそちらが優先。
  assigneeHint: z.string().max(120).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  status: z.enum(STATUSES).default("OPEN"),
  actionTaken: z.string().max(10000).optional().nullable(),
  parentId: z.string().optional().nullable(),
});

/**
 * 与えられた hint 文字列を既存ユーザー名と照合して最も近そうなユーザーを返す。
 *   - 完全一致 (大小文字無視) → 最優先
 *   - User.name に hint が含まれる、または hint に User.name が含まれる
 *   - 苗字 / 名前単独でも拾えるよう、空白とフルネームの両方を試す
 * 曖昧 (複数候補) または該当なしなら null。
 */
function pickUserByHint(
  hint: string,
  users: { id: string; name: string }[],
): string | null {
  const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const h = normalize(hint);
  if (!h) return null;

  // 1) 正規化後の完全一致
  const exact = users.filter((u) => normalize(u.name) === h);
  if (exact.length === 1) return exact[0].id;

  // 2) 部分一致（双方向）
  const partial = users.filter((u) => {
    const n = normalize(u.name);
    return n.includes(h) || h.includes(n);
  });
  if (partial.length === 1) return partial[0].id;

  return null;
}

const CreateBody = z.object({
  tickets: z.array(TicketInput).min(1).max(50),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tickets = await prisma.ticket.findMany({
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ tickets });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // 担当者マッチング用に全ユーザー名を一度だけ取得
  const allUsers = await prisma.user.findMany({
    select: { id: true, name: true },
  });
  const reporterName = session.user.name ?? null;

  const created = [];
  for (const t of parsed.data.tickets) {
    // 担当者決定: 明示の assigneeId があればそれを採用、
    // 無ければ assigneeHint をユーザー名と照合
    let assigneeId = t.assigneeId || null;
    if (!assigneeId && t.assigneeHint) {
      assigneeId = pickUserByHint(t.assigneeHint, allUsers);
    }

    const ticket = await prisma.ticket.create({
      data: {
        title: t.title,
        description: t.description || null,
        originalText: t.originalText,
        // 報告者は常にログインユーザー名で固定 (要件)
        reporterName,
        assigneeId,
        dueDate: t.dueDate ? new Date(t.dueDate) : null,
        priority: t.priority,
        status: t.status,
        actionTaken: t.actionTaken || null,
        parentId: t.parentId || null,
        createdById: session.user.id,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    await recordAudit({
      userId: session.user.id,
      action: "CREATE_TICKET",
      targetType: "Ticket",
      targetId: ticket.id,
      details: {
        title: ticket.title,
        autoAssignedFrom: t.assigneeHint && assigneeId ? t.assigneeHint : undefined,
      },
    });
    created.push(ticket);
  }

  return NextResponse.json({ tickets: created });
}
