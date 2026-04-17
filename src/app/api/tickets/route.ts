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
  reporterName: z.string().max(120).optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  status: z.enum(STATUSES).default("OPEN"),
  actionTaken: z.string().max(10000).optional().nullable(),
  parentId: z.string().optional().nullable(),
});

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

  const created = [];
  for (const t of parsed.data.tickets) {
    const ticket = await prisma.ticket.create({
      data: {
        title: t.title,
        description: t.description || null,
        originalText: t.originalText,
        reporterName: t.reporterName || null,
        assigneeId: t.assigneeId || null,
        dueDate: t.dueDate ? new Date(t.dueDate) : null,
        priority: t.priority,
        status: t.status,
        actionTaken: t.actionTaken || null,
        parentId: t.parentId || null,
        createdById: session.user.id,
      },
    });
    await recordAudit({
      userId: session.user.id,
      action: "CREATE_TICKET",
      targetType: "Ticket",
      targetId: ticket.id,
      details: { title: ticket.title },
    });
    created.push(ticket);
  }

  return NextResponse.json({ tickets: created });
}
