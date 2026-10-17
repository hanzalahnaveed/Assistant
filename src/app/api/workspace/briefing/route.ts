import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GmailList = { messages?: Array<{ id: string; threadId: string }> };
type GmailMessage = {
  id: string; threadId: string; snippet?: string; labelIds?: string[];
  payload?: { headers?: Array<{ name: string; value: string }> };
};
type CalendarList = { items?: Array<{
  id: string; summary?: string; location?: string; status?: string; htmlLink?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
}> };

function dateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
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

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function rankEmail(email: { subject: string; snippet: string; from: string; labels: string[] }) {
  const text = `${email.subject} ${email.snippet}`.toLowerCase();
  const reasons: string[] = [];
  let score = email.labels.includes("UNREAD") ? 2 : 0;
  if (/\b(urgent|asap|time-sensitive|deadline|today|overdue)\b/.test(text)) { score += 4; reasons.push("Time-sensitive wording"); }
  if (/\b(please|could you|can you|would you|let me know|need your|your approval|review|feedback|confirm|follow up|follow-up|respond|reply)\b/.test(text)) { score += 3; reasons.push("May need your response"); }
  if (/\b(proposal|invoice|contract|client|customer|decision|meeting|deliverable|action item)\b/.test(text)) { score += 2; reasons.push("Work-related topic"); }
  if (/\b(no-reply|newsletter|unsubscribe|promotion|sale)\b/.test((email.from + " " + text).toLowerCase())) score -= 5;
  return { score, reasons };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to generate your daily briefing." }, { status: 401 });

  const now = new Date();
  const timeZone = user.timezone || "Asia/Karachi";
  const localNow = dateParts(now, timeZone);
  const year = Number(localNow.year), month = Number(localNow.month), day = Number(localNow.day);
  const dayStart = localMidnightUtc(year, month, day, timeZone);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextMidnight = localMidnightUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), timeZone);
  const dayEnd = new Date(nextMidnight.getTime() - 1);
  const [tasks, preferences, integration] = await Promise.all([
    prisma.task.findMany({
      where: { userId: user.id, status: { in: ["TODO", "IN_PROGRESS"] } },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { createdAt: "asc" }],
      take: 50,
      select: { id: true, title: true, description: true, status: true, priority: true, dueAt: true }
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

  return NextResponse.json({
    generatedAt: now.toISOString(), timezone: timeZone, greeting, summary, connected,
    integration: integration ? { status: connected ? "CONNECTED" : integration.status, email: integration.email, lastSyncedAt: integration.lastSyncedAt } : null,
    workspaceError, preferences,
    metrics: { openTasks: tasks.length, overdueTasks: overdue.length, dueTodayTasks: dueToday.length, highPriorityTasks: highPriority.length, events: events.length, followUps: followUps.length },
    priorities, tasks, events, followUps
  }, { headers: { "cache-control": "no-store" } });
}
