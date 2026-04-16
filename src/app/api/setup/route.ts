import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

const SetupSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80),
  password: z.string().min(8).max(200),
});

// Returns whether setup is needed (no users yet).
export async function GET() {
  const count = await prisma.user.count();
  return NextResponse.json({ needsSetup: count === 0 });
}

// Creates the very first user. Only allowed when DB is empty.
export async function POST(req: Request) {
  const count = await prisma.user.count();
  if (count > 0) {
    return NextResponse.json(
      { error: "Setup already completed" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = SetupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: { email, name: parsed.data.name.trim(), passwordHash },
    select: { id: true, email: true, name: true },
  });

  await recordAudit({
    userId: user.id,
    action: "CREATE_USER",
    targetType: "User",
    targetId: user.id,
    details: { initial: true, email: user.email, name: user.name },
  });

  return NextResponse.json({ user });
}
