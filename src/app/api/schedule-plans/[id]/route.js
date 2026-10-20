import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
import { localDateTimeToIso } from "@/lib/calendar-timezone.mjs";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shiftDate(date, amount) {
  const parts = date.split("-").map(Number);
  const value = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + amount));
  return value.getUTCFullYear() + "-" + String(value.getUTCMonth() + 1).padStart(2, "0") + "-" + String(value.getUTCDate()).padStart(2, "0");
}

function eventInterval(event, timezone) {
  if (event.start?.date && event.end?.date) {
    const start = localDateTimeToIso(event.start.date + "T00:00", timezone);
    const end = localDateTimeToIso(event.end.date + "T00:00", timezone);
    return start && end ? { start: new Date(start).getTime(), end: new Date(end).getTime() } : null;
  }
  const start = new Date(event.start?.dateTime ?? "").getTime();
  const end = new Date(event.end?.dateTime ?? "").getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

async function listCalendarEvents(accessToken, start, end) {
  const events = [];
  let pageToken = null;
  for (let page = 0; page < 5; page += 1) {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", start);
    url.searchParams.set("timeMax", end);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await googleApiGet(accessToken, url.toString());
    events.push(...(result.items ?? []).filter((event) => event.status !== "cancelled"));
    pageToken = result.nextPageToken ?? null;
    if (!pageToken) return events;
  }
  throw new Error("There are too many events to verify this day safely. Review the calendar before trying again.");
}

export async function POST(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to add schedule blocks to Google Calendar." }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (body?.action !== "CREATE_EVENTS") return NextResponse.json({ error: "Choose a valid daily schedule action." }, { status: 400 });
  const plan = await prisma.dailySchedulePlan.findFirst({ where: { id, userId: user.id } });
  if (!plan) return NextResponse.json({ error: "Daily schedule not found." }, { status: 404 });
  if (plan.status !== "APPROVED") return NextResponse.json({ error: "Approve the schedule before creating calendar blocks." }, { status: 409 });
  const blocks = Array.isArray(plan.blocks) ? plan.blocks : [];
  if (!blocks.length) return NextResponse.json({ error: "This plan has no scheduled blocks to add to Google Calendar." }, { status: 400 });
  const integration = await prisma.integration.findFirst({
    where: { userId: user.id, provider: "GOOGLE", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
    select: { scopes: true },
  });
  if (!integration) return NextResponse.json({ error: "Connect Google Calendar before creating schedule blocks." }, { status: 403 });
  if (!integration.scopes.some((scope) => [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar",
  ].includes(scope))) return NextResponse.json({ error: "Calendar event permission is missing. Reconnect Google and grant event access." }, { status: 403 });
  let token;
  try {
    token = await getGoogleAccessToken(user.id);
  } catch {
    return NextResponse.json({ error: "Google Calendar access could not be refreshed. Reconnect Google and try again." }, { status: 403 });
  }
  if (!token) return NextResponse.json({ error: "Google Calendar access needs to be renewed. Reconnect Google and try again." }, { status: 403 });
  const dayStart = localDateTimeToIso(plan.localDate + "T00:00", plan.timezone);
  const dayEnd = localDateTimeToIso(shiftDate(plan.localDate, 1) + "T00:00", plan.timezone);
  if (!dayStart || !dayEnd) return NextResponse.json({ error: "The saved plan has an invalid local date or timezone." }, { status: 400 });
  let existingEvents;
  try {
    existingEvents = await listCalendarEvents(token.accessToken, dayStart, dayEnd);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify Google Calendar availability." }, { status: 502 });
  }
  const conflicts = [];
  for (const block of blocks) {
    const start = new Date(block.startAt).getTime();
    const end = new Date(block.endAt).getTime();
    for (const event of existingEvents) {
      if (event.transparency === "transparent") continue;
      const interval = eventInterval(event, plan.timezone);
      if (interval && intervalsOverlap(start, end, interval.start, interval.end)) conflicts.push({ task: block.title, event: event.summary || "(untitled event)" });
    }
  }
  if (conflicts.length) return NextResponse.json({ error: "Calendar availability changed since this plan was approved. Review the conflicts and regenerate or edit the plan.", conflicts: conflicts.slice(0, 10) }, { status: 409 });
  const claim = await prisma.dailySchedulePlan.updateMany({
    where: { id: plan.id, userId: user.id, status: "APPROVED" },
    data: { status: "CREATING" },
  });
  if (!claim.count) return NextResponse.json({ error: "This plan has changed or is already being processed." }, { status: 409 });
  const created = [];
  try {
    for (const block of blocks) {
      const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none", {
        method: "POST",
        headers: { authorization: "Bearer " + token.accessToken, "content-type": "application/json" },
        body: JSON.stringify({
          summary: block.title,
          description: "Focus block created by Assistant for task " + block.taskId + ".",
          start: { dateTime: block.startAt, timeZone: plan.timezone },
          end: { dateTime: block.endAt, timeZone: plan.timezone },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(25000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.id) {
        const uncertain = response.status >= 500 || created.length > 0 || response.ok;
        const message = uncertain
          ? "Calendar block creation stopped with an uncertain or partial outcome. Do not retry until you inspect Google Calendar; created event IDs are retained below."
          : result.error?.message || "Google Calendar rejected a schedule block. No blocks were created; edit the plan and try again.";
        const saved = await prisma.dailySchedulePlan.update({
          where: { id: plan.id },
          data: { status: uncertain ? "CREATE_UNCERTAIN" : "APPROVED", calendarEvents: created },
        });
        await prisma.auditEvent.create({ data: { userId: user.id, eventType: uncertain ? "DAILY_SCHEDULE_CREATE_UNCERTAIN" : "DAILY_SCHEDULE_CREATE_FAILED", actor: "USER", resourceId: plan.id, metadata: { createdCount: created.length, httpStatus: response.status } } }).catch(() => undefined);
        return NextResponse.json({ error: message, plan: saved }, { status: uncertain ? 502 : 400 });
      }
      created.push({
        taskId: block.taskId,
        title: block.title,
        eventId: result.id,
        htmlLink: result.htmlLink ?? null,
        startAt: block.startAt,
        endAt: block.endAt,
      });
      await prisma.dailySchedulePlan.update({
        where: { id: plan.id },
        data: { calendarEvents: created },
      });
    }
    const saved = await prisma.dailySchedulePlan.update({
      where: { id: plan.id },
      data: { status: "CREATED", calendarEvents: created },
    });
    await prisma.auditEvent.create({ data: { userId: user.id, eventType: "DAILY_SCHEDULE_ADDED_TO_CALENDAR", actor: "USER", resourceId: plan.id, metadata: { localDate: plan.localDate, createdCount: created.length } } }).catch(() => undefined);
    return NextResponse.json({ plan: saved }, { headers: { "cache-control": "no-store" } });
  } catch {
    const saved = await prisma.dailySchedulePlan.update({
      where: { id: plan.id },
      data: { status: "CREATE_UNCERTAIN", calendarEvents: created },
    });
    await prisma.auditEvent.create({ data: { userId: user.id, eventType: "DAILY_SCHEDULE_CREATE_UNCERTAIN", actor: "USER", resourceId: plan.id, metadata: { createdCount: created.length } } }).catch(() => undefined);
    return NextResponse.json({ error: "The calendar write outcome could not be confirmed. Inspect Google Calendar before taking further action.", plan: saved }, { status: 502 });
  }
}
