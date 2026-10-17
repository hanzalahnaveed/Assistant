import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueAt: z.string().datetime().optional().nullable()
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Connect Google Workspace to sign in." }, { status: 401 });

  const tasks = await prisma.task.findMany({
    where: { userId: user.id, status: { not: "CANCELLED" } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    take: 200
  });
  return NextResponse.json({ tasks }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Connect Google Workspace to sign in." }, { status: 401 });

  const parsed = createTaskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a task title and valid optional details.", details: parsed.error.flatten() }, { status: 400 });

  const task = await prisma.task.create({
    data: {
      userId: user.id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      priority: parsed.data.priority ?? "MEDIUM",
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      source: "USER"
    }
  });
  await prisma.auditEvent.create({
    data: { userId: user.id, eventType: "TASK_CREATED", actor: "USER", resourceId: task.id, metadata: { priority: task.priority } }
  });
  return NextResponse.json({ task }, { status: 201, headers: { "cache-control": "no-store" } });
}
