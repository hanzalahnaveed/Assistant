import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
import { localDateTimeToIso } from "@/lib/calendar-timezone.mjs";
import { buildDailySchedule } from "@/lib/schedule/planner.mjs";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const saveSchema = z.object({
  localDate: dateSchema,
  timezone: z.string().trim().min(1).max(100),
  status: z.enum(["DRAFT", "APPROVED"]).default("DRAFT"),
  blocks: z.array(z.object({
    taskId: z.string().min(1).max(100),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
  })).max(100),
  unscheduled: z.array(z.object({
    taskId: z.string().min(1).max(100),
    reason: z.string().trim().min(1).max(500),
  })).max(100).default([]),
});

function validTimezone(timezone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

async function calendarContext(user, startIso, endIso) {
  const integration = await prisma.integration.findFirst({
    where: { userId: user.id, provider: "GOOGLE", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
    select: { scopes: true },
  });
  if (!integration) return { events: [], warnings: ["Google Calendar is not connected; this plan cannot account for existing meetings."] };
  const canRead = integration.scopes.some((scope) => [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar",
  ].includes(scope));
  if (!canRead) throw new Error("Google Calendar read permission is missing. Reconnect Google before scheduling around meetings.");
  const token = await getGoogleAccessToken(user.id);
  if (!token) throw new Error("Google Calendar access needs to be renewed. Reconnect Google before scheduling around meetings.");
  const events = [];
  let pageToken = null;
  for (let page = 0; page < 5; page += 1) {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", startIso);
    url.searchParams.set("timeMax", endIso);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await googleApiGet(token.accessToken, url.toString());
    events.push(...(result.items ?? []).filter((event) => event.status !== "cancelled").map((event) => ({
      id: event.id,
      title: event.summary || "(untitled meeting)",
      startAt: event.start?.dateTime ?? event.start?.date ?? null,
      endAt: event.end?.dateTime ?? event.end?.date ?? null,
      allDay: Boolean(event.start?.date && !event.start?.dateTime),
    })));
    pageToken = result.nextPageToken ?? null;
    if (!pageToken) return { events, warnings: [] };
    if (page === 4) throw new Error("This day has too many calendar events to verify safely. Narrow the range or review Google Calendar directly.");
  }
  return { events, warnings: [] };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function eventInterval(event, timezone) {
  if (event.allDay || /^\d{4}-\d{2}-\d{2}$/.test(event.startAt || "")) {
    const start = localDateTimeToIso(event.startAt + "T00:00", timezone);
    const end = localDateTimeToIso(event.endAt + "T00:00", timezone);
    return start && end ? { start: new Date(start).getTime(), end: new Date(end).getTime() } : null;
  }
  const start = new Date(event.startAt).getTime();
  const end = new Date(event.endAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

async function loadTasks(userId) {
  return prisma.task.findMany({
    where: { userId, status: { in: ["TODO", "IN_PROGRESS"] } },
    orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { createdAt: "asc" }],
    take: 100,
    select: { id: true, title: true, priority: true, dueAt: true, createdAt: true, status: true },
  });
}

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage your daily schedule." }, { status: 401 });
  const date = new URL(request.url).searchParams.get("date");
  if (!dateSchema.safeParse(date).success) return NextResponse.json({ error: "Choose a valid local date (YYYY-MM-DD)." }, { status: 400 });
  const [plan, tasks] = await Promise.all([
    prisma.dailySchedulePlan.findUnique({ where: { userId_localDate: { userId: user.id, localDate: date } } }),
    loadTasks(user.id),
  ]);
  return NextResponse.json({ plan, tasks, timezone: user.timezone || "Asia/Karachi" }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to generate your daily schedule." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const date = body?.localDate;
  if (!dateSchema.safeParse(date).success) return NextResponse.json({ error: "Choose a valid local date (YYYY-MM-DD)." }, { status: 400 });
  const timezone = body?.timezone || user.timezone || "Asia/Karachi";
  if (!validTimezone(timezone)) return NextResponse.json({ error: "Choose a valid IANA timezone." }, { status: 400 });
  const start = localDateTimeToIso(date + "T00:00", timezone);
  const nextParts = date.split("-").map(Number);
  const next = new Date(Date.UTC(nextParts[0], nextParts[1] - 1, nextParts[2] + 1));
  const nextDate = next.getUTCFullYear() + "-" + String(next.getUTCMonth() + 1).padStart(2, "0") + "-" + String(next.getUTCDate()).padStart(2, "0");
  const end = localDateTimeToIso(nextDate + "T00:00", timezone);
  if (!start || !end) return NextResponse.json({ error: "That local date is invalid in the selected timezone." }, { status: 400 });
  let context;
  try {
    context = await calendarContext(user, start, end);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify calendar availability." }, { status: 502 });
  }
  const tasks = await loadTasks(user.id);
  const generated = buildDailySchedule({ tasks, events: context.events, localDate: date, timezone });
  generated.warnings = context.warnings;
  const plan = await prisma.dailySchedulePlan.upsert({
    where: { userId_localDate: { userId: user.id, localDate: date } },
    create: { userId: user.id, localDate: date, timezone, status: "DRAFT", blocks: generated.blocks, unscheduled: generated.unscheduled, warnings: context.warnings, generatedAt: new Date() },
    update: { timezone, status: "DRAFT", blocks: generated.blocks, unscheduled: generated.unscheduled, warnings: context.warnings, generatedAt: new Date() },
  });
  await prisma.auditEvent.create({ data: { userId: user.id, eventType: "DAILY_SCHEDULE_GENERATED", actor: "USER", resourceId: plan.id, metadata: { localDate: date, scheduledCount: generated.blocks.length, unscheduledCount: generated.unscheduled.length } } });
  return NextResponse.json({ plan, tasks, warnings: context.warnings, workWindow: generated.workWindow }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to save your daily schedule." }, { status: 401 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Submit a valid schedule with valid task IDs and time ranges.", details: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  if (!validTimezone(input.timezone)) return NextResponse.json({ error: "Choose a valid IANA timezone." }, { status: 400 });
  const dayStartIso = localDateTimeToIso(input.localDate + "T00:00", input.timezone);
  const dateParts = input.localDate.split("-").map(Number);
  const next = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2] + 1));
  const nextDate = next.getUTCFullYear() + "-" + String(next.getUTCMonth() + 1).padStart(2, "0") + "-" + String(next.getUTCDate()).padStart(2, "0");
  const dayEndIso = localDateTimeToIso(nextDate + "T00:00", input.timezone);
  const workStartIso = localDateTimeToIso(input.localDate + "T09:00", input.timezone);
  const workEndIso = localDateTimeToIso(input.localDate + "T17:00", input.timezone);
  if (!dayStartIso || !dayEndIso || !workStartIso || !workEndIso) return NextResponse.json({ error: "That date or work window is invalid in the selected timezone." }, { status: 400 });
  const allTaskIds = [...new Set([...input.blocks.map((block) => block.taskId), ...input.unscheduled.map((item) => item.taskId)])];
  if (allTaskIds.length !== input.blocks.length + input.unscheduled.length) return NextResponse.json({ error: "Each task can appear only once in a daily schedule." }, { status: 400 });
  const tasks = allTaskIds.length ? await prisma.task.findMany({ where: { userId: user.id, id: { in: allTaskIds }, status: { in: ["TODO", "IN_PROGRESS"] } }, select: { id: true, title: true, priority: true } }) : [];
  if (tasks.length !== allTaskIds.length) return NextResponse.json({ error: "A scheduled task is unavailable or does not belong to your account. Refresh the plan and try again." }, { status: 400 });
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const blocks = input.blocks.map((block) => {
    const start = new Date(block.startAt);
    const end = new Date(block.endAt);
    return { ...block, title: taskMap.get(block.taskId).title, priority: taskMap.get(block.taskId).priority, durationMinutes: (end.getTime() - start.getTime()) / 60000 };
  });
  const workStart = new Date(workStartIso).getTime();
  const workEnd = new Date(workEndIso).getTime();
  const dayStart = new Date(dayStartIso).getTime();
  const dayEnd = new Date(dayEndIso).getTime();
  for (const block of blocks) {
    const start = new Date(block.startAt).getTime();
    const end = new Date(block.endAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < workStart || end > workEnd || start < dayStart || end > dayEnd) {
      return NextResponse.json({ error: "Every block must have a valid end after its start and fit within the 09:00–17:00 work window." }, { status: 400 });
    }
  }
  const ordered = [...blocks].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  for (let index = 1; index < ordered.length; index += 1) {
    if (new Date(ordered[index].startAt) < new Date(ordered[index - 1].endAt)) return NextResponse.json({ error: "Schedule blocks cannot overlap. Adjust the times and save again." }, { status: 409 });
  }
  let context;
  try {
    context = await calendarContext(user, dayStartIso, dayEndIso);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify calendar availability." }, { status: 502 });
  }
  const eventConflicts = [];
  for (const block of blocks) {
    const start = new Date(block.startAt).getTime();
    const end = new Date(block.endAt).getTime();
    for (const event of context.events) {
      const interval = eventInterval(event, input.timezone);
      if (interval && overlaps(start, end, interval.start, interval.end)) eventConflicts.push({ task: block.title, event: event.title });
    }
  }
  if (eventConflicts.length) return NextResponse.json({ error: "A calendar event now overlaps this plan. Regenerate or edit the plan after reviewing availability.", conflicts: eventConflicts.slice(0, 10) }, { status: 409 });
  const unscheduled = input.unscheduled.map((item) => ({ ...item, title: taskMap.get(item.taskId).title }));
  const plan = await prisma.dailySchedulePlan.upsert({
    where: { userId_localDate: { userId: user.id, localDate: input.localDate } },
    create: { userId: user.id, localDate: input.localDate, timezone: input.timezone, status: input.status, blocks: ordered, unscheduled, warnings: context.warnings },
    update: { timezone: input.timezone, status: input.status, blocks: ordered, unscheduled, warnings: context.warnings },
  });
  await prisma.auditEvent.create({ data: { userId: user.id, eventType: input.status === "APPROVED" ? "DAILY_SCHEDULE_APPROVED" : "DAILY_SCHEDULE_SAVED", actor: "USER", resourceId: plan.id, metadata: { localDate: input.localDate, scheduledCount: ordered.length, unscheduledCount: unscheduled.length } } });
  return NextResponse.json({ plan, warnings: context.warnings }, { headers: { "cache-control": "no-store" } });
}
