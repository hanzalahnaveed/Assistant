import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";

type BriefingUser = { id: string; timezone?: string | null };
type GmailList = { messages?: Array<{ id: string; threadId: string }> };
type GmailMessage = {
  id: string; threadId: string; snippet?: string; labelIds?: string[];
  payload?: { headers?: Array<{ name: string; value: string }> };
};
type CalendarList = { items?: Array<{
  id: string; summary?: string; location?: string; status?: string; htmlLink?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
}> };

export function dateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function localDateKey(value: Date, timeZone: string) {
  const parts = dateParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localMidnightUtc(year: number, month: number, day: number, timeZone: string) {
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = dateParts(new Date(guess), timeZone);
    const observed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    guess += target - observed;
  }
  return new Date(guess);
}

function localDayBounds(now: Date, timeZone: string) {
  const parts = dateParts(now, timeZone);
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
  const start = localMidnightUtc(year, month, day, timeZone);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextMidnight = localMidnightUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), timeZone);
  return { start, end: new Date(nextMidnight.getTime() - 1), parts };
}

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function rankEmail(email: { subject: string; snippet: string; from: string; labels: string[] }) {
  const text = `${email.subject} ${email.snippet}`.toLowerCase();
  const reasons: string[] = [];
  let score = email.labels.includes("UNREAD") ? 2 : 0;
  if (/\b(urgent|asap|time-sensitive|deadline|today|overdue|by eod)\b/.test(text)) { score += 4; reasons.push("Time-sensitive wording"); }
  if (/\b(please|could you|can you|would you|let me know|need your|your approval|review|feedback|confirm|follow up|follow-up|respond|reply)\b/.test(text)) { score += 3; reasons.push("May need your response"); }
  if (/\b(proposal|invoice|contract|client|customer|decision|meeting|deliverable|action item)\b/.test(text)) { score += 2; reasons.push("Work-related topic"); }
  if (/\b(no-reply|newsletter|unsubscribe|promotion|sale|receipt)\b/.test((email.from + " " + text).toLowerCase())) score -= 5;
  return { score, reasons };
}

function rankTask(task: { id: string; title: string; description: string | null; status: string; priority: string; dueAt: Date | null; createdAt: Date }, now: Date) {
  const reasons: string[] = [];
  let score = task.priority === "URGENT" ? 50 : task.priority === "HIGH" ? 35 : task.priority === "MEDIUM" ? 20 : 10;
  if (task.dueAt) {
    const hoursUntilDue = (task.dueAt.getTime() - now.getTime()) / 3_600_000;
    if (hoursUntilDue < 0) { score += 45 + Math.min(20, Math.floor(Math.abs(hoursUntilDue) / 24) * 3); reasons.push("Overdue"); }
    else if (hoursUntilDue <= 4) { score += 35; reasons.push("Due within 4 hours"); }
    else if (hoursUntilDue <= 24) { score += 25; reasons.push("Due today"); }
    else if (hoursUntilDue <= 72) { score += 12; reasons.push("Due within 3 days"); }
  }
  if (task.status === "IN_PROGRESS") { score += 5; reasons.push("Already in progress"); }
  const ageDays = Math.max(0, (now.getTime() - task.createdAt.getTime()) / 86_400_000);
  if (ageDays >= 7) { score += Math.min(10, Math.floor(ageDays / 7) * 2); reasons.push("Waiting for a while"); }
  const context = `${task.title} ${task.description ?? ""}`.toLowerCase();
  if (/\b(client|customer|launch|deadline|blocked|approval|revenue|production|incident)\b/.test(context)) { score += 5; reasons.push("Business-critical context"); }
  if (reasons.length === 0) reasons.push("Priority and task age");
  return { score, reasons };
}

export async function generateBriefingData(user: BriefingUser, now = new Date()) {
  const timeZone = user.timezone || "Asia/Karachi";
  const { start: dayStart, end: dayEnd, parts: localNow } = localDayBounds(now, timeZone);
  const [tasks, preferences, integration] = await Promise.all([
    prisma.task.findMany({
      where: { userId: user.id, status: { in: ["TODO", "IN_PROGRESS"] } },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { createdAt: "asc" }],
      take: 100,
      select: { id: true, title: true, description: true, status: true, priority: true, dueAt: true, createdAt: true }
    }),
    prisma.userPreference.upsert({
      where: { userId: user.id }, create: { userId: user.id }, update: {},
      select: { dailyBriefingEnabled: true, briefingHour: true, defaultApprovalMode: true }
    }),
    prisma.integration.findFirst({
      where: { userId: user.id, provider: "GOOGLE" }, orderBy: { updatedAt: "desc" },
      select: { status: true, email: true, lastSyncedAt: true }
    })
  ]);

  const rankedTasks = tasks.map((task) => ({ ...task, ...rankTask(task, now) }))
    .sort((a, b) => b.score - a.score || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  const overdue = tasks.filter((task) => task.dueAt && task.dueAt < now);
  const dueToday = tasks.filter((task) => task.dueAt && task.dueAt >= dayStart && task.dueAt <= dayEnd);
  const highPriority = tasks.filter((task) => task.priority === "URGENT" || task.priority === "HIGH");
  let connected = Boolean(integration && integration.status === "CONNECTED");
  let workspaceError: string | null = null;
  let events: Array<{ id: string; title: string; start: string | null; end: string | null; location: string | null; link: string | null }> = [];
  let followUps: Array<{ id: string; threadId: string; from: string; subject: string; snippet: string; date: string; score: number; reasons: string[] }> = [];

  if (connected) {
    try {
      const token = await getGoogleAccessToken(user.id);
      if (!token) connected = false;
      else {
        const gmailUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
        gmailUrl.searchParams.set("maxResults", "25");
        gmailUrl.searchParams.set("q", "in:inbox newer_than:30d -category:promotions -category:social");
        const calendarUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
        calendarUrl.searchParams.set("timeMin", now.toISOString());
        calendarUrl.searchParams.set("timeMax", dayEnd.toISOString());
        calendarUrl.searchParams.set("singleEvents", "true");
        calendarUrl.searchParams.set("orderBy", "startTime");
        calendarUrl.searchParams.set("maxResults", "20");
        const [gmail, calendar] = await Promise.all([
          googleApiGet<GmailList>(token.accessToken, gmailUrl.toString()),
          googleApiGet<CalendarList>(token.accessToken, calendarUrl.toString())
        ]);
        const messages = await Promise.all((gmail.messages ?? []).slice(0, 25).map(async (message) => {
          const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}`);
          url.searchParams.set("format", "metadata");
          for (const name of ["From", "Subject", "Date"]) url.searchParams.append("metadataHeaders", name);
          return googleApiGet<GmailMessage>(token.accessToken, url.toString());
        }));
        followUps = messages.map((item) => {
          const candidate = {
            id: item.id, threadId: item.threadId, from: header(item, "From"),
            subject: header(item, "Subject") || "(no subject)", snippet: item.snippet ?? "",
            date: header(item, "Date"), labels: item.labelIds ?? []
          };
          return { ...candidate, ...rankEmail(candidate) };
        }).filter((email) => email.score >= 3).sort((a, b) => b.score - a.score).slice(0, 8)
          .map(({ labels: _labels, ...email }) => email);
        events = (calendar.items ?? []).filter((event) => event.status !== "cancelled").map((event) => ({
          id: event.id, title: event.summary || "(untitled event)",
          start: event.start?.dateTime ?? event.start?.date ?? null,
          end: event.end?.dateTime ?? event.end?.date ?? null,
          location: event.location ?? null, link: event.htmlLink ?? null
        }));
        await prisma.integration.updateMany({
          where: { userId: user.id, provider: "GOOGLE", status: "CONNECTED" },
          data: { lastSyncedAt: new Date() }
        });
      }
    } catch (error) {
      workspaceError = error instanceof Error ? error.message : "Google Workspace data could not be loaded.";
    }
  }

  const priorities = [
    ...overdue.map((task) => ({ type: "task" as const, id: task.id, title: task.title, detail: "Overdue task", priority: "URGENT" as const })),
    ...dueToday.filter((task) => !overdue.some((item) => item.id === task.id)).map((task) => ({ type: "task" as const, id: task.id, title: task.title, detail: "Due today", priority: task.priority })),
    ...followUps.slice(0, 3).map((email) => ({ type: "email" as const, id: email.id, title: email.subject, detail: email.reasons[0] || "Inbox follow-up candidate", priority: email.score >= 6 ? "HIGH" as const : "MEDIUM" as const }))
  ].slice(0, 6);
  const localHour = Number(localNow.hour);
  const greeting = localHour < 12 ? "Good morning" : localHour < 17 ? "Good afternoon" : "Good evening";
  const summary = tasks.length === 0 && events.length === 0 && followUps.length === 0
    ? "Your workspace is clear of tracked tasks. Add a task or connect Google Workspace to build a richer briefing."
    : `You have ${overdue.length} overdue task(s), ${dueToday.length} task(s) due today, ${events.length} calendar event(s), and ${followUps.length} email follow-up candidate(s).`;

  return {
    generatedAt: now.toISOString(), timezone: timeZone, localDate: localDateKey(now, timeZone),
    greeting, summary, connected,
    integration: integration ? { status: connected ? "CONNECTED" : integration.status, email: integration.email, lastSyncedAt: integration.lastSyncedAt } : null,
    workspaceError, preferences,
    metrics: { openTasks: tasks.length, overdueTasks: overdue.length, dueTodayTasks: dueToday.length, highPriorityTasks: highPriority.length, events: events.length, followUps: followUps.length },
    priorities, tasks: rankedTasks, events, followUps
  };
}

export async function saveDailyBriefing(userId: string, briefing: Awaited<ReturnType<typeof generateBriefingData>>) {
  const content = {
    generatedAt: briefing.generatedAt, timezone: briefing.timezone, greeting: briefing.greeting,
    metrics: briefing.metrics, priorities: briefing.priorities,
    tasks: briefing.tasks.slice(0, 20), events: briefing.events, followUps: briefing.followUps
  };
  const saved = await prisma.dailyBriefing.upsert({
    where: { userId_localDate: { userId, localDate: briefing.localDate } },
    create: { userId, localDate: briefing.localDate, timezone: briefing.timezone, summary: briefing.summary, content },
    update: { timezone: briefing.timezone, summary: briefing.summary, content, generatedAt: new Date() }
  });
  await prisma.notification.upsert({
    where: { userId_idempotencyKey: { userId, idempotencyKey: "daily-briefing:" + briefing.localDate } },
    create: {
      userId, idempotencyKey: "daily-briefing:" + briefing.localDate, type: "DAILY_BRIEFING",
      title: `${briefing.greeting}, here's your daily briefing`, body: briefing.summary,
      payload: { briefingId: saved.id, localDate: briefing.localDate }
    },
    update: { title: `${briefing.greeting}, here's your daily briefing`, body: briefing.summary, payload: { briefingId: saved.id, localDate: briefing.localDate } }
  });
  return saved;
}
