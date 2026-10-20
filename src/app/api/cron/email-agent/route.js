import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getEmailAgentSettings, processInboundEmailForUser } from "@/lib/email-agent/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    where: {
      integrations: { some: { provider: "GOOGLE", status: "CONNECTED" } },
    },
    select: {
      id: true,
      email: true,
      timezone: true,
      preferences: {
        select: { preferencesJson: true, automationPaused: true },
      },
      integrations: {
        where: { provider: "GOOGLE", status: "CONNECTED" },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { id: true, scopes: true, status: true, email: true },
      },
    },
    orderBy: { id: "asc" },
  });
  let processed = 0;
  let drafted = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];
  for (const user of users) {
    const settings = getEmailAgentSettings(user.preferences?.preferencesJson);
    if (!settings.enabled) {
      skipped++;
      continue;
    }
    const integration = user.integrations[0];
    if (!integration) {
      skipped++;
      continue;
    }
    try {
      const result = await processInboundEmailForUser(user, integration, settings);
      processed += result.processed;
      drafted += result.drafted;
      sent += result.sent;
      skipped += result.skipped;
      failed += result.failed;
      if (result.failed) failures.push({ userId: user.id, failed: result.failed });
    } catch (error) {
      failed++;
      failures.push({
        userId: user.id,
        error: error instanceof Error ? error.message.slice(0, 240) : "Unknown email-agent error",
      });
    }
  }
  return NextResponse.json({
    ok: failures.length === 0,
    runAt: new Date().toISOString(),
    eligibleUsers: users.length,
    processed,
    drafted,
    sent,
    skipped,
    failed,
    failures,
  }, {
    status: failures.length ? 207 : 200,
    headers: { "cache-control": "no-store" },
  });
}
