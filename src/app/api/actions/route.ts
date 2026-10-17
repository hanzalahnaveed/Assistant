import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proposalSchema = z.object({
  actionType: z.literal("CREATE_TASK"),
  idempotencyKey: z.string().trim().min(8).max(128),
  input: z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional().nullable(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
    dueAt: z.string().datetime().optional().nullable()
  })
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to view proposed actions." }, { status: 401 });

  const actions = await prisma.actionRecord.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, actionType: true, status: true, input: true, result: true,
      requiresApproval: true, approvedAt: true, startedAt: true, completedAt: true,
      errorCode: true, createdAt: true, updatedAt: true
    }
  });
  return NextResponse.json({ actions }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to propose an action." }, { status: 401 });

  const parsed = proposalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({
    error: "Provide a valid task proposal and an idempotency key.",
    details: parsed.error.flatten()
  }, { status: 400 });

  const existing = await prisma.actionRecord.findUnique({
    where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: parsed.data.idempotencyKey } }
  });
  if (existing) return NextResponse.json({ action: existing, reused: true }, { headers: { "cache-control": "no-store" } });

  const [preferences, rule] = await Promise.all([
    prisma.userPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
      select: { defaultApprovalMode: true }
    }),
    prisma.automationRule.findFirst({
      where: { userId: user.id, actionType: "CREATE_TASK", enabled: true },
      orderBy: { updatedAt: "desc" },
      select: { mode: true }
    })
  ]);
  const approvalMode = rule?.mode ?? preferences.defaultApprovalMode;
  if (approvalMode === "BLOCK") {
    return NextResponse.json({ error: "Your approval settings currently block assistant-proposed actions." }, { status: 403 });
  }

  try {
    const action = await prisma.$transaction(async (tx) => {
      const record = await tx.actionRecord.create({
        data: {
          userId: user.id,
          actionType: "CREATE_TASK",
          idempotencyKey: parsed.data.idempotencyKey,
          input: parsed.data.input,
          status: approvalMode === "AUTO" ? "RUNNING" : "PENDING",
          requiresApproval: approvalMode !== "AUTO",
          ...(approvalMode === "AUTO" ? { approvedAt: new Date(), startedAt: new Date() } : {})
        }
      });

      if (approvalMode !== "AUTO") {
        await tx.auditEvent.create({
          data: { userId: user.id, eventType: "ACTION_PROPOSED", actor: "ASSISTANT", resourceId: record.id, metadata: { actionType: record.actionType } }
        });
        return record;
      }

      const task = await tx.task.create({
        data: {
          userId: user.id,
          title: parsed.data.input.title,
          description: parsed.data.input.description || null,
          priority: parsed.data.input.priority,
          dueAt: parsed.data.input.dueAt ? new Date(parsed.data.input.dueAt) : null,
          source: "ASSISTANT",
          sourceRef: record.id
        }
      });
      const completed = await tx.actionRecord.update({
        where: { id: record.id },
        data: { status: "SUCCEEDED", completedAt: new Date(), result: { taskId: task.id, title: task.title } }
      });
      await tx.auditEvent.create({
        data: { userId: user.id, eventType: "ACTION_AUTO_EXECUTED", actor: "ASSISTANT", resourceId: record.id, metadata: { actionType: record.actionType, taskId: task.id } }
      });
      return completed;
    });
    return NextResponse.json({ action, reused: false }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    // Concurrent retries may race on the unique idempotency key; return the first request's record.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const duplicate = await prisma.actionRecord.findUnique({
        where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: parsed.data.idempotencyKey } }
      });
      if (duplicate) return NextResponse.json({ action: duplicate, reused: true }, { headers: { "cache-control": "no-store" } });
    }
    throw error;
  }
}
