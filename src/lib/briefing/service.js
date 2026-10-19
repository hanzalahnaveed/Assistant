import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
export function dateParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}
export function localDateKey(value, timeZone) {
  const parts = dateParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function localMidnightUtc(year, month, day, timeZone) {
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = dateParts(new Date(guess), timeZone);
    const observed = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += target - observed;
  }
  return new Date(guess);
}
export function localDayBounds(now, timeZone) {
  const parts = dateParts(now, timeZone);
  const year = Number(parts.year),
    month = Number(parts.month),
    day = Number(parts.day);
  const start = localMidnightUtc(year, month, day, timeZone);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextMidnight = localMidnightUtc(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    timeZone,
  );
  return { start, end: new Date(nextMidnight.getTime() - 1), parts };
}
function header(message, name) {
  return (
    message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())
      ?.value ?? ""
  );
}
function rankEmail(email) {
  const text = `${email.subject} ${email.snippet}`.toLowerCase();
  const reasons = [];
  let score = email.labels.includes("UNREAD") ? 2 : 0;
  if (/\b(urgent|asap|time-sensitive|deadline|today|overdue|by eod)\b/.test(text)) {
    score += 4;
    reasons.push("Time-sensitive wording");
  }
  if (
    /\b(please|could you|can you|would you|let me know|need your|your approval|review|feedback|confirm|follow up|follow-up|respond|reply)\b/.test(
      text,
    )
  ) {
    score += 3;
    reasons.push("May need your response");
  }
  if (
    /\b(i will|i'll|we will|we'll|i can send|will send|will deliver|as agreed|as discussed|we agreed|next steps|action item|action items|by tomorrow|by friday|by monday|deadline|due on|due by|please send|please share|follow up on)\b/.test(
      text,
    )
  ) {
    score += 4;
    reasons.push("Commitment or next-step language");
  }
  if (
    /\b(proposal|invoice|contract|client|customer|decision|meeting|deliverable|action item)\b/.test(
      text,
    )
  ) {
    score += 2;
    reasons.push("Work-related topic");
  }
  if (
    /\b(no-reply|newsletter|unsubscribe|promotion|sale|receipt)\b/.test(
      (email.from + " " + text).toLowerCase(),
    )
  )
    score -= 5;
  return { score, reasons };
}
function rankTask(task, now) {
  const reasons = [];
  let score =
    task.priority === "URGENT"
      ? 50
      : task.priority === "HIGH"
        ? 35
        : task.priority === "MEDIUM"
          ? 20
          : 10;
  if (task.dueAt) {
    const hoursUntilDue = (task.dueAt.getTime() - now.getTime()) / 3_600_000;
    if (hoursUntilDue < 0) {
      score += 45 + Math.min(20, Math.floor(Math.abs(hoursUntilDue) / 24) * 3);
      reasons.push("Overdue");
    } else if (hoursUntilDue <= 4) {
      score += 35;
      reasons.push("Due within 4 hours");
    } else if (hoursUntilDue <= 24) {
      score += 25;
      reasons.push("Due today");
    } else if (hoursUntilDue <= 72) {
      score += 12;
      reasons.push("Due within 3 days");
    }
  }
  if (task.status === "IN_PROGRESS") {
    score += 5;
    reasons.push("Already in progress");
  }
  const ageDays = Math.max(0, (now.getTime() - task.createdAt.getTime()) / 86_400_000);
  if (ageDays >= 7) {
    score += Math.min(10, Math.floor(ageDays / 7) * 2);
    reasons.push("Waiting for a while");
  }
  const context = `${task.title} ${task.description ?? ""}`.toLowerCase();
  if (
    /\b(client|customer|launch|deadline|blocked|approval|revenue|production|incident)\b/.test(
      context,
    )
  ) {
    score += 5;
    reasons.push("Business-critical context");
  }
  if (reasons.length === 0) reasons.push("Priority and task age");
  return { score, reasons };
}
export async function generateBriefingData(user, now = new Date()) {
  const timeZone = user.timezone || "Asia/Karachi";
  const { start: dayStart, end: dayEnd, parts: localNow } = localDayBounds(now, timeZone);
  const [tasks, preferences, integration] = await Promise.all([
    prisma.task.findMany({
      where: { userId: user.id, status: { in: ["TODO", "IN_PROGRESS"] } },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { createdAt: "asc" }],
      take: 100,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueAt: true,
        createdAt: true,
      },
    }),
    prisma.userPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
      select: { dailyBriefingEnabled: true, briefingHour: true, defaultApprovalMode: true },
    }),
    prisma.integration.findFirst({
      where: { userId: user.id, provider: "GOOGLE" },
      orderBy: { updatedAt: "desc" },
      select: { status: true, email: true, lastSyncedAt: true },
    }),
  ]);
  const rankedTasks = tasks
    .map((task) => ({ ...task, ...rankTask(task, now) }))
    .sort(
      (a, b) =>
        b.score - a.score || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity),
    );
  const overdue = tasks.filter((task) => task.dueAt && task.dueAt < now);
  const dueToday = tasks.filter(
    (task) => task.dueAt && task.dueAt >= dayStart && task.dueAt <= dayEnd,
  );
  const highPriority = tasks.filter(
    (task) => task.priority === "URGENT" || task.priority === "HIGH",
  );
  let connected = Boolean(integration && integration.status === "CONNECTED");
  let workspaceError = null;
  let events = [];
  let followUps = [];
  if (connected) {
    try {
      const token = await getGoogleAccessToken(user.id);
      if (!token) connected = false;
      else {
        const gmailUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
        gmailUrl.searchParams.set("maxResults", "25");
        gmailUrl.searchParams.set(
          "q",
          "in:inbox newer_than:30d -category:promotions -category:social",
        );
        const calendarUrl = new URL(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        );
        calendarUrl.searchParams.set("timeMin", now.toISOString());
        calendarUrl.searchParams.set("timeMax", dayEnd.toISOString());
        calendarUrl.searchParams.set("singleEvents", "true");
        calendarUrl.searchParams.set("orderBy", "startTime");
        calendarUrl.searchParams.set("maxResults", "20");
        const [gmail, calendar] = await Promise.all([
          googleApiGet(token.accessToken, gmailUrl.toString()),
          googleApiGet(token.accessToken, calendarUrl.toString()),
        ]);
        const messages = await Promise.all(
          (gmail.messages ?? []).slice(0, 25).map(async (message) => {
            const url = new URL(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}`,
            );
            url.searchParams.set("format", "metadata");
            for (const name of ["From", "Subject", "Date"])
              url.searchParams.append("metadataHeaders", name);
            return googleApiGet(token.accessToken, url.toString());
          }),
        );
        followUps = messages
          .map((item) => {
            const candidate = {
              id: item.id,
              threadId: item.threadId,
              from: header(item, "From"),
              subject: header(item, "Subject") || "(no subject)",
              snippet: item.snippet ?? "",
              date: header(item, "Date"),
              labels: item.labelIds ?? [],
            };
            return { ...candidate, ...rankEmail(candidate) };
          })
          .filter((email) => email.score >= 3)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map(({ labels: _labels, ...email }) => email);
        events = (calendar.items ?? [])
          .filter((event) => event.status !== "cancelled")
          .map((event) => ({
            id: event.id,
            title: event.summary || "(untitled event)",
            start: event.start?.dateTime ?? event.start?.date ?? null,
            end: event.end?.dateTime ?? event.end?.date ?? null,
            location: event.location ?? null,
            link: event.htmlLink ?? null,
          }));
        await prisma.integration.updateMany({
          where: { userId: user.id, provider: "GOOGLE", status: "CONNECTED" },
          data: { lastSyncedAt: new Date() },
        });
      }
    } catch (error) {
      if (error instanceof Error && error.code === "GOOGLE_REAUTH_REQUIRED") {
        connected = false;
        if (integration) integration.status = "REAUTH_REQUIRED";
      }
      workspaceError =
        error instanceof Error ? error.message : "Google Workspace data could not be loaded.";
    }
  }
  // Surface evidence-backed next steps separately from generic inbox scoring.
  // Email signals are heuristic because Gmail metadata/snippets may omit full context.
  const commitmentPattern =
    /\b(i will|i'll|we will|we'll|i can send|will send|will deliver|as agreed|as discussed|we agreed|next steps|action item|action items|by tomorrow|by friday|by monday|deadline|due on|due by|please send|please share|follow up on)\b/i;
  const commitments = [
    ...followUps.flatMap((email) => {
      const evidence = `${email.subject} ${email.snippet}`;
      if (!commitmentPattern.test(evidence)) return [];
      return [
        {
          id: `email:${email.id}`,
          sourceType: "EMAIL",
          sourceId: email.id,
          title: `Follow up: ${email.subject}`,
          description: [
            `Email from ${email.from || "unknown sender"}`,
            email.snippet,
            `Source Gmail message ID: ${email.id}`,
          ]
            .filter(Boolean)
            .join("\\n\\n"),
          rationale: "The visible email text contains commitment, next-step, or deadline language.",
          evidence: email.snippet || email.subject,
          priority: email.score >= 7 ? "HIGH" : "MEDIUM",
          dueAt: null,
        },
      ];
    }),
    ...events.flatMap((event) => {
      if (!event.start) return [];
      const startAt = new Date(event.start);
      if (Number.isNaN(startAt.getTime()) || startAt.getTime() <= now.getTime()) return [];
      return [
        {
          id: `meeting:${event.id}`,
          sourceType: "MEETING",
          sourceId: event.id,
          title: `Prepare for: ${event.title}`,
          description: [
            `Preparation task suggested from calendar event: ${event.title}`,
            event.start ? `Meeting starts: ${event.start}` : "",
            event.location ? `Location: ${event.location}` : "",
            event.link ? `Calendar event: ${event.link}` : "",
          ]
            .filter(Boolean)
            .join("\\n"),
          rationale:
            "An upcoming calendar event may need preparation; review the agenda and decide what is actually required.",
          evidence: `${event.title} · starts ${event.start}`,
          priority: "MEDIUM",
          dueAt: event.start,
        },
      ];
    }),
  ].slice(0, 10);
  const priorities = [
    ...overdue.map((task) => ({
      type: "task",
      id: task.id,
      title: task.title,
      detail: "Overdue task",
      priority: "URGENT",
    })),
    ...dueToday
      .filter((task) => !overdue.some((item) => item.id === task.id))
      .map((task) => ({
        type: "task",
        id: task.id,
        title: task.title,
        detail: "Due today",
        priority: task.priority,
      })),
    ...followUps.slice(0, 3).map((email) => ({
      type: "email",
      id: email.id,
      title: email.subject,
      detail: email.reasons[0] || "Inbox follow-up candidate",
      priority: email.score >= 6 ? "HIGH" : "MEDIUM",
    })),
  ].slice(0, 6);
  const localHour = Number(localNow.hour);
  const greeting =
    localHour < 12 ? "Good morning" : localHour < 17 ? "Good afternoon" : "Good evening";
  const summary =
    tasks.length === 0 && events.length === 0 && followUps.length === 0
      ? "Your workspace is clear of tracked tasks. Add a task or connect Google Workspace to build a richer briefing."
      : `You have ${overdue.length} overdue task(s), ${dueToday.length} task(s) due today, ${events.length} calendar event(s), and ${followUps.length} email follow-up candidate(s).`;
  return {
    generatedAt: now.toISOString(),
    timezone: timeZone,
    localDate: localDateKey(now, timeZone),
    greeting,
    summary,
    connected,
    integration: integration
      ? {
          status: connected ? "CONNECTED" : integration.status,
          email: integration.email,
          lastSyncedAt: integration.lastSyncedAt,
        }
      : null,
    workspaceError,
    preferences,
    metrics: {
      openTasks: tasks.length,
      overdueTasks: overdue.length,
      dueTodayTasks: dueToday.length,
      highPriorityTasks: highPriority.length,
      events: events.length,
      followUps: followUps.length,
    },
    priorities,
    tasks: rankedTasks,
    events,
    followUps,
    commitments,
  };
}
export async function saveDailyBriefing(userId, briefing) {
  const content = {
    generatedAt: briefing.generatedAt,
    timezone: briefing.timezone,
    greeting: briefing.greeting,
    metrics: briefing.metrics,
    priorities: briefing.priorities,
    tasks: briefing.tasks.slice(0, 20).map((task) => ({
      ...task,
      dueAt: task.dueAt?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
    })),
    events: briefing.events,
    followUps: briefing.followUps,
  };
  const saved = await prisma.dailyBriefing.upsert({
    where: { userId_localDate: { userId, localDate: briefing.localDate } },
    create: {
      userId,
      localDate: briefing.localDate,
      timezone: briefing.timezone,
      summary: briefing.summary,
      content,
    },
    update: {
      timezone: briefing.timezone,
      summary: briefing.summary,
      content,
      generatedAt: new Date(),
    },
  });
  await prisma.notification.upsert({
    where: {
      userId_idempotencyKey: { userId, idempotencyKey: "daily-briefing:" + briefing.localDate },
    },
    create: {
      userId,
      idempotencyKey: "daily-briefing:" + briefing.localDate,
      type: "DAILY_BRIEFING",
      title: `${briefing.greeting}, here's your daily briefing`,
      body: briefing.summary,
      payload: { briefingId: saved.id, localDate: briefing.localDate },
    },
    update: {
      title: `${briefing.greeting}, here's your daily briefing`,
      body: briefing.summary,
      payload: { briefingId: saved.id, localDate: briefing.localDate },
    },
  });
  return saved;
}
