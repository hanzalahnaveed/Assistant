import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({ action: z.enum(["APPROVE", "REJECT"]) });
const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

export async function POST(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to review this task proposal." }, { status: 401 });
  const parsedAction = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsedAction.success) return NextResponse.json({ error: "Choose APPROVE or REJECT." }, { status: 400 });
  const { id } = await context.params;
  const action = parsedAction.data.action;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const inbound = await tx.inboundEmail.findFirst({ where: { id, userId: user.id } });
      if (!inbound) return { status: 404, error: "Inbound email was not found." };
      const classification = inbound.classification && typeof inbound.classification === "object" && !Array.isArray(inbound.classification)
        ? inbound.classification
        : {};
      const approvalStatus = classification.taskApprovalStatus;

      if (approvalStatus === "APPROVED" && classification.taskId) {
        if (action === "REJECT") return { status: 409, error: "This task proposal has already been approved." };
        const task = await tx.scheduleItem.findFirst({ where: { id: classification.taskId, userId: user.id } });
        return { status: 200, task, alreadyProcessed: true };
      }
      if (approvalStatus === "REJECTED") {
        return action === "REJECT"
          ? { status: 200, rejected: true, alreadyProcessed: true }
          : { status: 409, error: "This task proposal has already been declined." };
      }
      if (inbound.status !== "TASK_REVIEW" || approvalStatus !== "PENDING") {
        return { status: 409, error: "This email does not have a pending task proposal." };
      }
      const parsedTask = taskSchema.safeParse(classification.task);
      if (!parsedTask.success) return { status: 409, error: "The extracted task proposal is incomplete or invalid." };

      if (action === "APPROVE") {
        const preferences = await tx.userPreference.findUnique({ where: { userId: user.id }, select: { automationPaused: true } });
        if (preferences?.automationPaused) return { status: 409, error: "Automation is paused. Resume it before adding this task to the schedule." };
      }

      const claimed = await tx.inboundEmail.updateMany({
        where: { id, userId: user.id, status: "TASK_REVIEW" },
        data: { status: action === "APPROVE" ? "TASK_APPROVAL_PROCESSING" : "TASK_REJECTION_PROCESSING" },
      });
      if (!claimed.count) return { status: 409, error: "This task proposal was already updated. Refresh the inbox." };

      let task = null;
      let status = "TASK_DISMISSED";
      const nextClassification = { ...classification, taskApprovalStatus: action === "APPROVE" ? "APPROVED" : "REJECTED" };
      if (action === "APPROVE") {
        const dueAt = parsedTask.data.dueAt ? new Date(parsedTask.data.dueAt) : null;
        task = await tx.scheduleItem.upsert({
          where: { userId_source_sourceRef: { userId: user.id, source: "EMAIL", sourceRef: inbound.gmailMessageId } },
          create: {
            userId: user.id,
            title: parsedTask.data.title,
            description: parsedTask.data.description || null,
            priority: parsedTask.data.priority || "MEDIUM",
            dueAt,
            scheduledStartAt: dueAt,
            source: "EMAIL",
            sourceRef: inbound.gmailMessageId,
            timezone: user.timezone || "Asia/Karachi",
          },
          update: {},
        });
        nextClassification.taskId = task.id;
        nextClassification.taskCreated = true;
        status = "TASK_CREATED";
      } else {
        nextClassification.taskId = null;
        nextClassification.taskCreated = false;
      }
      await tx.inboundEmail.update({
        where: { id },
        data: { status, classification: nextClassification },
      });
      await tx.auditEvent.create({
        data: {
          userId: user.id,
          eventType: action === "APPROVE" ? "EMAIL_TASK_PROPOSAL_APPROVED" : "EMAIL_TASK_PROPOSAL_REJECTED",
          actor: "USER",
          resourceId: task?.id || inbound.id,
          metadata: { inboundEmailId: inbound.id, sourceMessageId: inbound.gmailMessageId, taskId: task?.id || null },
        },
      });
      return { status: 200, task, rejected: action === "REJECT", alreadyProcessed: false };
    });
    const { status, ...body } = outcome;
    return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error?.code === "P2034" || error?.code === "P2002") {
      return NextResponse.json({ error: "This task proposal was updated concurrently. Refresh the inbox and verify its current status." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not update this task proposal." }, { status: 500 });
  }
}
