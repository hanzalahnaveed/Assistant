import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getEmailAgentSettings, processInboundEmailForUser } from "@/lib/email-agent/service";
import { compareWorkerFairness } from "@/lib/email-agent/queue.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

function authorized(request) {
  const configured = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configured || configured.length < 32 || !supplied) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized email-agent scheduler request." }, { status: 401 });
  }
  const users = await prisma.user.findMany({
    where: { integrations: { some: { provider: "GOOGLE", status: "CONNECTED" } } },
    select: {
      id: true, email: true, timezone: true,
      preferences: { select: { preferencesJson: true, automationPaused: true } },
      emailAgentState: { select: { lastWorkerRunAt: true } },
      integrations: {
        where: { provider: "GOOGLE", status: "CONNECTED" },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { id: true, scopes: true, status: true, email: true },
      },
    },
    orderBy: { id: "asc" },
  });
  const candidates = users.filter((user) =>
    getEmailAgentSettings(user.preferences?.preferencesJson).enabled &&
    user.integrations[0]?.scopes?.includes(GMAIL_READ_SCOPE)
  ).sort(compareWorkerFairness);
  const maxUsersPerRun = 4;
  const selectedUsers = candidates.slice(0, maxUsersPerRun);
  const deferredUsers = Math.max(0, candidates.length - selectedUsers.length);
  const skipped = Math.max(0, users.length - candidates.length);
  const outcomes = await Promise.all(selectedUsers.map(async (user) => {
    const settings = getEmailAgentSettings(user.preferences?.preferencesJson);
    const integration = user.integrations[0];
    if (!integration) return { userId: user.id, skipped: 1, processed: 0, drafted: 0, failed: 0 };
    try {
      return { userId: user.id, ...(await processInboundEmailForUser(user, integration, settings)) };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 240) : "Unknown email-agent error";
      return { userId: user.id, processed: 0, drafted: 0, sent: 0, skipped: 0, failed: 1, error: message };
    } finally {
      await prisma.emailAgentState.upsert({
        where: { userId: user.id },
        create: { userId: user.id, lastWorkerRunAt: new Date() },
        update: { lastWorkerRunAt: new Date() },
      }).catch(() => undefined);
    }
  }));
  const totals = outcomes.reduce((result, outcome) => {
    for (const key of ["scanned", "queued", "pagesScanned", "processed", "drafted", "sent", "skipped", "failed", "deferred"]) {
      result[key] += outcome[key] || 0;
    }
    if (outcome.failed) result.failures.push({ userId: outcome.userId, failed: outcome.failed, error: outcome.error || null });
    return result;
  }, { scanned: 0, queued: 0, pagesScanned: 0, processed: 0, drafted: 0, sent: 0, skipped, failed: 0, deferred: 0, failures: [] });
  return NextResponse.json({
    ok: totals.failures.length === 0,
    runAt: new Date().toISOString(),
    eligibleUsers: candidates.length,
    processedUsers: selectedUsers.length,
    deferredUsers,
    scanned: totals.scanned,
    queued: totals.queued,
    pagesScanned: totals.pagesScanned,
    processed: totals.processed,
    drafted: totals.drafted,
    sent: totals.sent,
    skipped: totals.skipped,
    failed: totals.failed,
    deferred: totals.deferred,
    failures: totals.failures,
  }, {
    status: totals.failures.length ? 207 : 200,
    headers: { "cache-control": "no-store" },
  });
}
