import { prisma } from "@/lib/prisma";
export async function createTaskActionProposal(userId, idempotencyKey, input) {
  const existing = await prisma.actionRecord.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
  });
  if (existing) return { action: existing, reused: true };
  const [preferences, rule] = await Promise.all([
    prisma.userPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { defaultApprovalMode: true, automationPaused: true },
    }),
    prisma.automationRule.findFirst({
      where: { userId, actionType: "CREATE_TASK", enabled: true },
      orderBy: { updatedAt: "desc" },
      select: { mode: true },
    }),
  ]);
  const approvalMode = rule?.mode ?? preferences.defaultApprovalMode;
  const automationPaused = preferences.automationPaused;
  if (approvalMode === "BLOCK") {
    const error = new Error("Your approval settings currently block assistant-proposed actions.");
    error.name = "ActionBlockedError";
    throw error;
  }
  const autoExecute = approvalMode === "AUTO" && !automationPaused;
  try {
    const action = await prisma.$transaction(async (tx) => {
      const record = await tx.actionRecord.create({
        data: {
          userId,
          actionType: "CREATE_TASK",
          idempotencyKey,
          input,
          status: autoExecute ? "RUNNING" : "PENDING",
          requiresApproval: !autoExecute,
          ...(autoExecute ? { approvedAt: new Date(), startedAt: new Date() } : {}),
        },
      });
      if (!autoExecute) {
        await tx.auditEvent.create({
          data: {
            userId,
            eventType: "ACTION_PROPOSED",
            actor: "ASSISTANT",
            resourceId: record.id,
            metadata: { actionType: record.actionType, automationPaused },
          },
        });
        return record;
      }
      const task = await tx.task.create({
        data: {
          userId,
          title: input.title,
          description: input.description || null,
          priority: input.priority,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          source: "ASSISTANT",
          sourceRef: record.id,
        },
      });
      const completed = await tx.actionRecord.update({
        where: { id: record.id },
        data: {
          status: "SUCCEEDED",
          completedAt: new Date(),
          result: { taskId: task.id, title: task.title },
        },
      });
      await tx.auditEvent.create({
        data: {
          userId,
          eventType: "ACTION_AUTO_EXECUTED",
          actor: "ASSISTANT",
          resourceId: record.id,
          metadata: { actionType: record.actionType, taskId: task.id },
        },
      });
      return completed;
    });
    return { action, reused: false, automationPaused };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const duplicate = await prisma.actionRecord.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
      });
      if (duplicate) return { action: duplicate, reused: true };
    }
    throw error;
  }
}
