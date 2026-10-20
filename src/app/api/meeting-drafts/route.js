import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z
  .object({
    title: z.string().trim().min(1).max(250),
    description: z.string().max(10000).optional().default(""),
    location: z.string().trim().max(500).optional().default(""),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(100).default("Asia/Karachi"),
    attendees: z.array(z.string().trim().email().max(254)).max(50).default([]),
  })
  .refine((v) => new Date(v.endAt) > new Date(v.startAt), {
    message: "Meeting end must be after its start.",
    path: ["endAt"],
  })
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: v.timezone }).format(new Date(v.startAt));
      return true;
    } catch {
      return false;
    }
  }, {
    message: "Enter a valid IANA timezone.",
    path: ["timezone"],
  });
export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage meetings." }, { status: 401 });
  const drafts = await prisma.meetingDraft.findMany({
    where: { userId: user.id },
    orderBy: { startAt: "asc" },
    take: 100,
  });
  const requestUrl = new URL(request.url);
  const requestedStart = requestUrl.searchParams.get("start");
  const requestedEnd = requestUrl.searchParams.get("end");
  const now = new Date();
  const rangeStart = requestedStart ? new Date(requestedStart) : now;
  const rangeEnd = requestedEnd ? new Date(requestedEnd) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (
    Number.isNaN(rangeStart.getTime()) ||
    Number.isNaN(rangeEnd.getTime()) ||
    rangeEnd <= rangeStart ||
    rangeEnd.getTime() - rangeStart.getTime() > 32 * 24 * 60 * 60 * 1000
  ) {
    return NextResponse.json(
      { error: "Choose a valid calendar range of up to 32 days." },
      { status: 400 },
    );
  }
  let events = [];
  let calendarError = null;
  let eventsTruncated = false;
  const integration = await prisma.integration.findFirst({
    where: { userId: user.id, provider: "GOOGLE", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
    select: { scopes: true },
  });
  const canReadCalendar = Boolean(
    integration?.scopes.some((scope) =>
      [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar",
      ].includes(scope),
    ),
  );
  if (integration && !canReadCalendar) {
    calendarError = "Calendar read permission is missing. Reconnect Google and grant calendar access.";
  }
  if (integration && canReadCalendar) {
    try {
      const token = await getGoogleAccessToken(user.id);
      if (token) {
        let pageToken = null;
        const maxPages = 5;
        for (let page = 0; page < maxPages; page += 1) {
          const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
          url.searchParams.set("timeMin", rangeStart.toISOString());
          url.searchParams.set("timeMax", rangeEnd.toISOString());
          url.searchParams.set("singleEvents", "true");
          url.searchParams.set("orderBy", "startTime");
          url.searchParams.set("maxResults", "250");
          if (pageToken) url.searchParams.set("pageToken", pageToken);
          const result = await googleApiGet(token.accessToken, url.toString());
          events.push(
            ...(result.items ?? [])
              .filter((event) => event.status !== "cancelled")
              .map((event) => ({
                id: event.id,
                title: event.summary || "(untitled meeting)",
                description: event.description || "",
                location: event.location || "",
                startAt: event.start?.dateTime ?? event.start?.date ?? null,
                endAt: event.end?.dateTime ?? event.end?.date ?? null,
                allDay: Boolean(event.start?.date && !event.start?.dateTime),
                timezone: event.start?.timeZone ?? user.timezone,
                link: event.htmlLink ?? null,
                attendees: (event.attendees ?? []).map((attendee) => attendee.email).filter(Boolean),
              })),
          );
          pageToken = result.nextPageToken ?? null;
          if (!pageToken) break;
          if (page === maxPages - 1) eventsTruncated = true;
        }
      } else {
        calendarError = "Google Calendar access needs to be renewed. Reconnect Google and try again.";
      }
    } catch (e) {
      calendarError = e instanceof Error ? e.message : "Could not load Google Calendar events.";
    }
  }
  return NextResponse.json(
    {
      drafts,
      events,
      calendarConnected: Boolean(integration),
      calendarRange: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
      eventsTruncated,
      canCreateEvents: Boolean(
        integration?.scopes.includes("https://www.googleapis.com/auth/calendar.events"),
      ),
      calendarError,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to propose a meeting." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      {
        error: "Enter a valid meeting title, time range, timezone, and attendee emails.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  const input = parsed.data;
  const draft = await prisma.meetingDraft.create({
    data: {
      userId: user.id,
      title: input.title,
      description: input.description,
      location: input.location || null,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      timezone: input.timezone,
      attendees: [...new Set(input.attendees.map((a) => a.toLowerCase()))],
    },
  });
  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      eventType: "MEETING_DRAFT_CREATED",
      actor: "USER",
      resourceId: draft.id,
      metadata: {
        title: draft.title,
        startAt: draft.startAt.toISOString(),
        attendeeCount: draft.attendees.length,
      },
    },
  });
  return NextResponse.json({ draft }, { status: 201, headers: { "cache-control": "no-store" } });
}
