import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { PRIORITIES, STATUSES } from "@/lib/types";

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).optional().nullable(),
  reporterName: z.string().max(120).optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(), // empty string -> clear
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(STATUSES).optional(),
  actionTaken: z.string().max(10000).optional().nullable(),
  // 親チケットの付け替え (ドラッグ&ドロップ)。null ならルート化。
  parentId: z.string().optional().nullable(),
});

/**
 * ticketId の親を newParentId に変更すると循環になるかチェックする。
 * newParentId から親をたどり、途中で ticketId にぶつかれば循環。
 */
async function wouldCreateCycle(
  ticketId: string,
  newParentId: string,
): Promise<boolean> {
  if (newParentId === ticketId) return true;
  let cur: string | null = newParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === ticketId) return true;
    if (seen.has(cur)) return true; // 既に壊れた状態への防御
    seen.add(cur);
    const p: { parentId: string | null } | null =
      await prisma.ticket.findUnique({
        where: { id: cur },
        select: { parentId: true },
      });
    if (!p) break;
    cur = p.parentId;
  }
  return false;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ticket });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const before = await prisma.ticket.findUnique({ where: { id } });
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 親付け替え時の循環チェック
  if (data.parentId !== undefined && data.parentId) {
    if (data.parentId === id) {
      return NextResponse.json(
        { error: "自分自身を親にすることはできません" },
        { status: 400 },
      );
    }
    const cycle = await wouldCreateCycle(id, data.parentId);
    if (cycle) {
      return NextResponse.json(
        { error: "循環構造になるため親に設定できません" },
        { status: 400 },
      );
    }
  }

  const ticket = await prisma.ticket.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && {
        description: data.description || null,
      }),
      ...(data.reporterName !== undefined && {
        reporterName: data.reporterName || null,
      }),
      ...(data.assigneeId !== undefined && {
        assigneeId: data.assigneeId || null,
      }),
      ...(data.dueDate !== undefined && {
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.actionTaken !== undefined && {
        actionTaken: data.actionTaken || null,
      }),
      ...(data.parentId !== undefined && {
        parentId: data.parentId || null,
      }),
    },
    // フロント側で即座に表示更新できるよう relation も返す
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  // Build a diff of what changed for the audit log
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(data) as (keyof typeof data)[]) {
    const beforeVal = (before as unknown as Record<string, unknown>)[key];
    const afterVal = (ticket as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      diff[key] = { from: beforeVal, to: afterVal };
    }
  }

  await recordAudit({
    userId: session.user.id,
    action: "UPDATE_TICKET",
    targetType: "Ticket",
    targetId: ticket.id,
    details: { changes: diff, title: ticket.title },
  });

  return NextResponse.json({ ticket });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const before = await prisma.ticket.findUnique({ where: { id } });
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 子孫を BFS で集めて深い順に削除する。
  // SQLite の ON DELETE CASCADE は PRAGMA foreign_keys=ON が必須で
  // adapter ごとに挙動が変わるため、アプリ側で明示的に削除する。
  const allIds: string[] = [];
  let frontier: string[] = [id];
  while (frontier.length > 0) {
    allIds.push(...frontier);
    const children = await prisma.ticket.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
  }
  // 深い順 (子孫から先) に削除
  await prisma.ticket.deleteMany({
    where: { id: { in: allIds.slice(1) } }, // まず子孫だけ
  });
  await prisma.ticket.delete({ where: { id } });

  await recordAudit({
    userId: session.user.id,
    action: "DELETE_TICKET",
    targetType: "Ticket",
    targetId: id,
    details: {
      title: before.title,
      cascadedCount: allIds.length - 1,
    },
  });
  return NextResponse.json({ ok: true, deleted: allIds.length });
}
