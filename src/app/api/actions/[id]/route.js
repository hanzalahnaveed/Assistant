import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const decisionSchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]) });
export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Sign in to review proposed actions." }, { status: 401 });
  const { id } = await context.params;
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
  const existing = await prisma.actionRecord.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Action not found." }, { status: 404 });
  if (existing.status === "SUCCEEDED" || existing.status === "CANCELLED") {
    return NextResponse.json(
      { action: existing, reused: true },
      { headers: { "cache-control": "no-store" } },
    );
  }
  if (existing.status !== "PENDING" && existing.status !== "APPROVED") {
    return NextResponse.json(
      {
        error: `This action cannot be reviewed while its status is ${existing.status.toLowerCase()}.`,
      },
      { status: 409 },
    );
  }
  if (parsed.data.decision === "APPROVE") {
    const preferences = await prisma.userPreference.findUnique({
      where: { userId: user.id },
      select: { automationPaused: true },
    });
    if (preferences?.automationPaused) {
      return NextResponse.json(
        { error: "Automation is paused. Resume it before executing actions." },
        { status: 409 },
      );
    }
  }
  if (parsed.data.decision === "REJECT") {
    const action = await prisma.$transaction(async (tx) => {
      const updated = await tx.actionRecord.update({
        where: { id },
        data: {
          status: "CANCELLED",
          completedAt: new Date(),
          result: { reason: "Rejected by user" },
        },
      });
      await tx.auditEvent.create({
        data: {
          userId: user.id,
          eventType: "ACTION_REJECTED",
          actor: "USER",
          resourceId: id,
          metadata: { actionType: existing.actionType },
        },
      });
      return updated;
    });
    return NextResponse.json({ action }, { headers: { "cache-control": "no-store" } });
  }
  if (existing.actionType !== "CREATE_TASK") {
    return NextResponse.json(
      { error: "This action type is not enabled for execution." },
      { status: 400 },
    );
  }
  const input = z
    .object({
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().max(5000).optional().nullable(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
      dueAt: z.string().datetime().optional().nullable(),
      source: z.enum(["EMAIL", "MEETING"]).optional(),
      sourceRef: z.string().trim().min(1).max(300).optional().nullable(),
    })
    .safeParse(existing.input);
  if (!input.success) {
    await prisma.actionRecord.update({
      where: { id },
      data: { status: "FAILED", errorCode: "INVALID_ACTION_INPUT", completedAt: new Date() },
    });
    return NextResponse.json(
      { error: "The saved action details are invalid and cannot be executed." },
      { status: 409 },
    );
  }
  const action = await prisma.$transaction(async (tx) => {
    const current = await tx.actionRecord.findFirst({ where: { id, userId: user.id } });
    if (!current) throw new Error("Action not found.");
    if (current.status === "SUCCEEDED" || current.status === "CANCELLED") return current;
    if (current.status !== "PENDING" && current.status !== "APPROVED")
      throw new Error("Action is already being processed.");
    await tx.actionRecord.update({
      where: { id },
      data: { status: "RUNNING", approvedAt: new Date(), startedAt: new Date(), errorCode: null },
    });
    const taskSource = input.data.source ?? "ASSISTANT";
    const taskSourceRef = input.data.sourceRef || id;
    const task = await tx.task.upsert({
      where: {
        userId_source_sourceRef: {
          userId: user.id,
          source: taskSource,
          sourceRef: taskSourceRef,
        },
      },
      create: {
        userId: user.id,
        title: input.data.title,
        description: input.data.description || null,
        priority: input.data.priority,
        dueAt: input.data.dueAt ? new Date(input.data.dueAt) : null,
        source: taskSource,
        sourceRef: taskSourceRef,
      },
      update: {},
    });
    const completed = await tx.actionRecord.update({
      where: { id },
      data: {
        status: "SUCCEEDED",
        completedAt: new Date(),
        result: { taskId: task.id, title: task.title },
      },
    });
    await tx.auditEvent.create({
      data: {
        userId: user.id,
        eventType: "ACTION_APPROVED_AND_EXECUTED",
        actor: "USER",
        resourceId: id,
        metadata: { actionType: existing.actionType, taskId: task.id },
      },
    });
    return completed;
  });
  return NextResponse.json({ action }, { headers: { "cache-control": "no-store" } });
}
