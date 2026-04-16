import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { PRIORITIES, STATUSES } from "@/lib/types";

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  reporterName: z.string().max(120).optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(), // empty string -> clear
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(STATUSES).optional(),
  actionTaken: z.string().max(10000).optional().nullable(),
});

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

  const ticket = await prisma.ticket.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
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
  await prisma.ticket.delete({ where: { id } });
  await recordAudit({
    userId: session.user.id,
    action: "DELETE_TICKET",
    targetType: "Ticket",
    targetId: id,
    details: { title: before.title },
  });
  return NextResponse.json({ ok: true });
}
