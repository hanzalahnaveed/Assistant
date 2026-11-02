import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to view inbound email activity." }, { status: 401 });
  const messages = await prisma.inboundEmail.findMany({
    where: { userId: user.id, OR: [{ fromEmail: { not: "pending@assistant.invalid" } }, { status: { in: ["RETRY_WAIT", "FAILED"] } }] },
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      gmailMessageId: true,
      gmailThreadId: true,
      fromEmail: true,
      subject: true,
      receivedAt: true,
      status: true,
      category: true,
      sensitive: true,
      summary: true,
      classification: true,
      draftId: true,
      processedAt: true,
      processingAttempts: true,
      nextAttemptAt: true,
      lastError: true,
      createdAt: true,
    },
  });
  const draftIds = messages.map((message) => message.draftId).filter(Boolean);
  const drafts = draftIds.length
    ? await prisma.emailDraft.findMany({
        where: { userId: user.id, id: { in: draftIds } },
        select: {
          id: true,
          toEmail: true,
          ccEmail: true,
          subject: true,
          body: true,
          goal: true,
          status: true,
          approvedAt: true,
          sentAt: true,
          lastError: true,
          updatedAt: true,
        },
      })
    : [];
  const draftStatusById = new Map(drafts.map((draft) => [draft.id, draft.status]));
  const now = new Date();
  const [queuedCount, retryingCount, failedCount, processingCount, workerState, oldestQueued, oldestProcessing, recentResolved, retryAttemptGroups] = await Promise.all([
    prisma.inboundEmail.count({ where: { userId: user.id, status: "RECEIVED" } }),
    prisma.inboundEmail.count({ where: { userId: user.id, status: "RETRY_WAIT" } }),
    prisma.inboundEmail.count({ where: { userId: user.id, status: "FAILED" } }),
    prisma.inboundEmail.count({ where: { userId: user.id, status: "PROCESSING" } }),
    prisma.emailAgentState.findUnique({
      where: { userId: user.id },
      select: { pagesScanned: true, lastScanPageAt: true, lastWorkerRunAt: true, lastError: true },
    }),
    prisma.inboundEmail.findFirst({ where: { userId: user.id, status: "RECEIVED" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.inboundEmail.findFirst({ where: { userId: user.id, status: "PROCESSING" }, orderBy: { updatedAt: "asc" }, select: { updatedAt: true } }),
    prisma.inboundEmail.findMany({
      where: { userId: user.id, processedAt: { not: null }, lastProcessingDurationMs: { not: null } },
      orderBy: { processedAt: "desc" },
      take: 50,
      select: { lastProcessingDurationMs: true, classification: true },
    }),
    prisma.inboundEmail.groupBy({
      by: ["processingAttempts"],
      where: { userId: user.id, processingAttempts: { gt: 0 } },
      _count: { _all: true },
    }),
  ]);
  const secondsSince = (date) => date ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000)) : null;
  const durations = recentResolved.map((item) => item.lastProcessingDurationMs).filter((value) => Number.isFinite(value) && value >= 0);
  const averageProcessingDurationMs = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : null;
  const classifierModes = recentResolved.reduce((result, item) => {
    const classification = item.classification && typeof item.classification === "object" && !Array.isArray(item.classification)
      ? item.classification : {};
    const mode = typeof classification.mode === "string" ? classification.mode : "UNKNOWN";
    result[mode] = (result[mode] || 0) + 1;
    return result;
  }, {});
  const oldestQueuedAgeSeconds = secondsSince(oldestQueued?.createdAt);
  const oldestProcessingAgeSeconds = secondsSince(oldestProcessing?.updatedAt);
  const scanFreshnessSeconds = secondsSince(workerState?.lastScanPageAt);
  const workerFreshnessSeconds = secondsSince(workerState?.lastWorkerRunAt);
  const alerts = [];
  if (oldestQueuedAgeSeconds !== null && oldestQueuedAgeSeconds >= 1800) alerts.push("QUEUE_AGE_OVER_30_MINUTES");
  if (failedCount > 0) alerts.push("TERMINAL_EMAIL_FAILURES");
  if (workerFreshnessSeconds !== null && workerFreshnessSeconds >= 900) alerts.push("WORKER_STALE_OVER_15_MINUTES");
  if (scanFreshnessSeconds !== null && scanFreshnessSeconds >= 900) alerts.push("GMAIL_SCAN_STALE_OVER_15_MINUTES");
  return NextResponse.json({
    worker: {
      queuedCount, retryingCount, failedCount, processingCount,
      oldestQueuedAgeSeconds, oldestProcessingAgeSeconds,
      scanFreshnessSeconds, workerFreshnessSeconds,
      averageProcessingDurationMs, measuredProcessingSamples: durations.length,
      classifierModes,
      retryAttemptDistribution: retryAttemptGroups.map((group) => ({
        attempts: group.processingAttempts,
        count: group._count._all,
      })),
      alerts,
      ...workerState,
    },
    messages: messages.map((message) => ({
      ...message,
      draftStatus: message.draftId ? draftStatusById.get(message.draftId) || null : null,
    })),
    drafts,
  }, { headers: { "cache-control": "no-store" } });
}
