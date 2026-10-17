import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { dateParts, generateBriefingData, localDateKey, saveDailyBriefing } from "@/lib/briefing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const configured = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configured || configured.length < 32 || !supplied) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized scheduler request." }, { status: 401 });
  }

  const now = new Date();
  const users = await prisma.user.findMany({
    where: { OR: [{ preferences: { is: null } }, { preferences: { is: { dailyBriefingEnabled: true } } }] },
    select: { id: true, timezone: true, preferences: { select: { briefingHour: true } } },
    orderBy: { id: "asc" }
  });

  let generated = 0;
  let skipped = 0;
  const failures: Array<{ userId: string; error: string }> = [];
  for (const user of users) {
    const timezone = user.timezone || "Asia/Karachi";
    try {
      const parts = dateParts(now, timezone);
      if (Number(parts.hour) !== user.preferences?.briefingHour) {
        skipped++;
        continue;
      }
      const localDate = localDateKey(now, timezone);
      const existing = await prisma.dailyBriefing.findUnique({
        where: { userId_localDate: { userId: user.id, localDate } },
        select: { id: true }
      });
      if (existing) {
        skipped++;
        continue;
      }
      const briefing = await generateBriefingData(user, now);
      await saveDailyBriefing(user.id, briefing);
      generated++;
    } catch (error) {
      failures.push({
        userId: user.id,
        error: error instanceof Error ? error.message.slice(0, 240) : "Unknown generation error"
      });
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    runAt: now.toISOString(),
    eligibleUsers: users.length,
    generated,
    skipped,
    failed: failures.length,
    failures
  }, { status: failures.length ? 207 : 200, headers: { "cache-control": "no-store" } });
}
