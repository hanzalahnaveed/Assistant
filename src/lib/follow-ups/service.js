import { prisma } from "@/lib/prisma";

export async function syncFollowUpCandidates(userId, candidates) {
  const now = new Date();
  for (const candidate of candidates) {
    if (!candidate.sourceType || !candidate.sourceId || !candidate.title) continue;
    await prisma.followUp.upsert({
      where: { userId_sourceType_sourceId: { userId, sourceType: candidate.sourceType, sourceId: candidate.sourceId } },
      create: {
        userId, sourceType: candidate.sourceType, sourceId: candidate.sourceId,
        title: candidate.title, description: candidate.description || "",
        evidence: candidate.evidence || "", rationale: candidate.rationale || "",
        priority: candidate.priority || "MEDIUM",
        dueAt: candidate.dueAt ? new Date(candidate.dueAt) : null,
        firstSeenAt: now, lastSeenAt: now,
      },
      update: {
        title: candidate.title, description: candidate.description || "",
        evidence: candidate.evidence || "", rationale: candidate.rationale || "",
        priority: candidate.priority || "MEDIUM",
        dueAt: candidate.dueAt ? new Date(candidate.dueAt) : null,
        lastSeenAt: now,
      },
    });
  }
  const saved = await prisma.followUp.findMany({
    where: { userId, lastSeenAt: { gte: new Date(now.getTime() - 30 * 86400000) } },
    orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }],
    take: 40,
  });
  const sourceTasks = saved.length ? await prisma.task.findMany({
    where: {
      userId, source: { in: ["EMAIL", "MEETING"] },
      sourceRef: { in: saved.map((item) => item.sourceId) },
      status: { not: "CANCELLED" },
    },
    select: { id: true, source: true, sourceRef: true, status: true },
  }) : [];
  const taskBySource = new Map(sourceTasks.map((task) => [`${task.source}:${task.sourceRef}`, task]));
  const serialize = (item) => {
    const task = taskBySource.get(`${item.sourceType}:${item.sourceId}`);
    return {
      id: `${item.sourceType === "EMAIL" ? "email" : "meeting"}:${item.sourceId}`,
      followUpId: item.id, sourceType: item.sourceType, sourceId: item.sourceId,
      title: item.title, description: item.description, evidence: item.evidence,
      rationale: item.rationale, priority: item.priority,
      dueAt: item.dueAt?.toISOString() ?? null,
      lifecycleStatus: task ? (task.status === "DONE" ? "TASK_COMPLETED" : "TASK_CREATED") : "OPEN",
      taskId: task?.id ?? null,
      firstSeenAt: item.firstSeenAt.toISOString(), lastSeenAt: item.lastSeenAt.toISOString(),
    };
  };
  return {
    open: saved.filter((item) => item.status === "OPEN").map(serialize),
    dismissed: saved.filter((item) => item.status === "DISMISSED").map(serialize),
  };
}
