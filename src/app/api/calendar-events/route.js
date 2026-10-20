import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { localDateTimeToIso } from "@/lib/calendar-timezone.mjs";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
import { prisma } from "@/lib/prisma";
import { saveGoogleCalendarItem, scheduleItemToJson } from "@/lib/schedule/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  idempotencyKey: z.string().uuid(),
  title: z.string().trim().min(1).max(250),
  description: z.string().max(10000).optional().default(""),
  location: z.string().trim().max(500).optional().default(""),
  startAt: z.string().min(1).max(40),
  endAt: z.string().min(1).max(40),
  allDay: z.boolean().optional().default(false),
  timezone: z.string().trim().min(1).max(100),
  attendees: z.array(z.string().trim().email().max(254)).max(50).default([]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional().default("MEDIUM"),
}).refine((value) => {
  if (value.allDay) {
    const validDate = (date) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      const parsed = new Date(date + "T00:00:00.000Z");
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
    };
    return validDate(value.startAt) && validDate(value.endAt) && value.endAt > value.startAt;
  }
  const start = new Date(value.startAt).getTime();
  const end = new Date(value.endAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}, {
  message: "Event end must be after its start, using valid date/time values.",
  path: ["endAt"],
}).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}, {
  message: "Enter a valid IANA timezone.",
  path: ["timezone"],
});

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

function matchesEventRequest(event, value) {
  const sameInstant = (existingValue, requestedValue) =>
    Number.isFinite(new Date(existingValue ?? "").getTime()) &&
    new Date(existingValue).getTime() === new Date(requestedValue).getTime();
  const sameStart = value.allDay
    ? event.start?.date === value.startAt
    : sameInstant(event.start?.dateTime, value.startAt);
  const sameEnd = value.allDay
    ? event.end?.date === value.endAt
    : sameInstant(event.end?.dateTime, value.endAt);
  const existingAttendees = (event.attendees ?? [])
    .map((attendee) => attendee.email?.toLowerCase())
    .filter(Boolean)
    .sort();
  const requestedAttendees = [...new Set(value.attendees.map((email) => email.toLowerCase()))].sort();
  return event.summary === value.title &&
    (event.description || "") === value.description &&
    (event.location || "") === value.location &&
    sameStart &&
    sameEnd &&
    JSON.stringify(existingAttendees) === JSON.stringify(requestedAttendees);
}

async function getWritableCalendar(userId) {
  const integration = await prisma.integration.findFirst({
    where: { userId, provider: "GOOGLE", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
    select: { scopes: true },
  });
  if (!integration) {
    return { error: "Connect Google Calendar before creating calendar events.", status: 403 };
  }
  if (!integration.scopes.some((scope) => [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar",
  ].includes(scope))) {
    return {
      error: "Calendar event permission is missing. Reconnect Google and grant event access.",
      status: 403,
    };
  }
  let token;
  try {
    token = await getGoogleAccessToken(userId);
  } catch {
    return {
      error: "Google Calendar access could not be refreshed. Reconnect Google and try again.",
      status: 403,
    };
  }
  if (!token) {
    return {
      error: "Google Calendar access needs to be renewed. Reconnect Google and try again.",
      status: 403,
    };
  }
  return { token };
}

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your schedule." }, { status: 401 });

  const requestUrl = new URL(request.url);
  const requestedStart = requestUrl.searchParams.get("start");
  const requestedEnd = requestUrl.searchParams.get("end");
  const now = new Date();
  const rangeStart = requestedStart ? new Date(requestedStart) : now;
  const rangeEnd = requestedEnd
    ? new Date(requestedEnd)
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (
    Number.isNaN(rangeStart.getTime()) ||
    Number.isNaN(rangeEnd.getTime()) ||
    rangeEnd <= rangeStart ||
    rangeEnd.getTime() - rangeStart.getTime() > 32 * 24 * 60 * 60 * 1000
  ) {
    return NextResponse.json({ error: "Choose a valid calendar range of up to 32 days." }, { status: 400 });
  }

  const integration = await prisma.integration.findFirst({
    where: { userId: user.id, provider: "GOOGLE", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
    select: { scopes: true },
  });
  const canReadCalendar = Boolean(integration?.scopes.some((scope) => [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar",
  ].includes(scope)));
  let events = [];
  let calendarError = null;
  let eventsTruncated = false;

  if (integration && !canReadCalendar) {
    calendarError = "Calendar read permission is missing. Reconnect Google and grant calendar access.";
  } else if (integration) {
    try {
      const token = await getGoogleAccessToken(user.id);
      if (!token) {
        calendarError = "Google Calendar access needs to be renewed. Reconnect Google and try again.";
      } else {
        let pageToken = null;
        for (let page = 0; page < 5; page += 1) {
          const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
          url.searchParams.set("timeMin", rangeStart.toISOString());
          url.searchParams.set("timeMax", rangeEnd.toISOString());
          url.searchParams.set("singleEvents", "true");
          url.searchParams.set("orderBy", "startTime");
          url.searchParams.set("maxResults", "250");
          if (pageToken) url.searchParams.set("pageToken", pageToken);
          const result = await googleApiGet(token.accessToken, url.toString());
          for (const event of result.items ?? []) {
            await saveGoogleCalendarItem(user.id, event, user.timezone);
            if (event.status === "cancelled") continue;
            events.push({
              id: event.id,
              etag: event.etag ?? null,
              title: event.summary || "(untitled meeting)",
              description: event.description || "",
              location: event.location || "",
              startAt: event.start?.dateTime ?? event.start?.date ?? null,
              endAt: event.end?.dateTime ?? event.end?.date ?? null,
              allDay: Boolean(event.start?.date && !event.start?.dateTime),
              transparency: event.transparency ?? "opaque",
              timezone: event.start?.timeZone ?? user.timezone,
              link: event.htmlLink ?? null,
              attendees: (event.attendees ?? []).map((attendee) => attendee.email).filter(Boolean),
            });
          }
          pageToken = result.nextPageToken ?? null;
          if (!pageToken) break;
          if (page === 4) eventsTruncated = true;
        }
      }
    } catch (error) {
      calendarError = error instanceof Error ? error.message : "Could not load Google Calendar events.";
    }
  }

  const calendarEventIds = events.map((event) => event.id);
  if (integration && !calendarError && !eventsTruncated) {
    await prisma.scheduleItem.updateMany({
      where: {
        userId: user.id,
        status: { not: "CANCELLED" },
        calendarEventId: {
          not: null,
          ...(calendarEventIds.length ? { notIn: calendarEventIds } : {}),
        },
        scheduledStartAt: { lt: rangeEnd },
        scheduledEndAt: { gt: rangeStart },
      },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
  }
  const scheduleItems = await prisma.scheduleItem.findMany({
    where: {
      userId: user.id,
      status: { not: "CANCELLED" },
    },
    orderBy: [{ scheduledStartAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    items: scheduleItems.map(scheduleItemToJson),
    events,
    calendarConnected: Boolean(integration),
    calendarRange: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
    eventsTruncated,
    canCreateEvents: Boolean(integration?.scopes.some((scope) => [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar",
    ].includes(scope))),
    calendarError,
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to create calendar events." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: "Enter a valid title, time range, timezone, and attendee emails.",
      details: parsed.error.flatten(),
    }, { status: 400 });
  }
  const value = parsed.data;
  const preferences = await prisma.userPreference.findUnique({
    where: { userId: user.id },
    select: { automationPaused: true },
  });
  if (preferences?.automationPaused) {
    return NextResponse.json(
      { error: "Automation is paused. Resume it before creating calendar events." },
      { status: 409 },
    );
  }

  const access = await getWritableCalendar(user.id);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const eventId = value.idempotencyKey.replaceAll("-", "").toLowerCase();
  const eventUrl = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  let existingResponse;
  try {
    existingResponse = await fetch(eventUrl + "/" + encodeURIComponent(eventId), {
      headers: { authorization: "Bearer " + access.token.accessToken },
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not verify whether this event request already completed. Refresh the calendar before retrying." },
      { status: 502 },
    );
  }
  if (existingResponse.ok) {
    const existingEvent = await existingResponse.json().catch(() => ({}));
    if (!matchesEventRequest(existingEvent, value)) {
      return NextResponse.json(
        { error: "This request key has already been used for a different calendar event." },
        { status: 409 },
      );
    }
    await saveGoogleCalendarItem(user.id, existingEvent, value.timezone, value.priority);
    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        eventType: "CALENDAR_EVENT_CREATED",
        actor: "USER",
        resourceId: existingEvent.id || eventId,
        metadata: {
          title: existingEvent.summary,
          startAt: existingEvent.start?.dateTime ?? existingEvent.start?.date,
          attendeeCount: value.attendees.length,
        },
      },
    });
    const item = await prisma.scheduleItem.findUnique({
      where: { userId_calendarEventId: { userId: user.id, calendarEventId: existingEvent.id } },
    });
    return NextResponse.json({ event: existingEvent, item: item ? scheduleItemToJson(item) : null, alreadyCreated: true }, {
      headers: { "cache-control": "no-store" },
    });
  }
  if (existingResponse.status !== 404 && existingResponse.status !== 410) {
    return NextResponse.json(
      { error: "Google Calendar could not verify this event request. Refresh and try again." },
      { status: existingResponse.status >= 500 ? 502 : 403 },
    );
  }

  const availabilityStart = value.allDay
    ? localDateTimeToIso(value.startAt + "T00:00", value.timezone)
    : value.startAt;
  const availabilityEnd = value.allDay
    ? localDateTimeToIso(value.endAt + "T00:00", value.timezone)
    : value.endAt;
  if (!availabilityStart || !availabilityEnd) {
    return NextResponse.json({ error: "The event date is invalid in the selected timezone." }, { status: 400 });
  }

  const availabilityUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  availabilityUrl.searchParams.set("timeMin", availabilityStart);
  availabilityUrl.searchParams.set("timeMax", availabilityEnd);
  availabilityUrl.searchParams.set("singleEvents", "true");
  availabilityUrl.searchParams.set("orderBy", "startTime");
  availabilityUrl.searchParams.set("maxResults", "250");
  let availability;
  try {
    availability = await googleApiGet(access.token.accessToken, availabilityUrl.toString());
  } catch {
    return NextResponse.json(
      { error: "Could not verify calendar availability. No event was created." },
      { status: 502 },
    );
  }
  if (availability.nextPageToken) {
    return NextResponse.json(
      { error: "There are too many events to verify this time safely. Choose a less crowded time." },
      { status: 409 },
    );
  }
  const proposedStart = new Date(availabilityStart).getTime();
  const proposedEnd = new Date(availabilityEnd).getTime();
  const conflicts = (availability.items ?? []).filter((event) => {
    if (event.status === "cancelled" || event.transparency === "transparent") return false;
    const interval = eventInterval(event, value.timezone);
    return interval && proposedStart < interval.end && proposedEnd > interval.start;
  });
  if (conflicts.length) {
    return NextResponse.json({
      error: "This time overlaps another calendar event. Review availability and choose a different time.",
      conflicts: conflicts.slice(0, 5).map((event) => ({
        title: event.summary || "(untitled event)",
        start: event.start?.dateTime ?? event.start?.date ?? null,
        end: event.end?.dateTime ?? event.end?.date ?? null,
      })),
    }, { status: 409 });
  }

  const eventBody = {
    id: eventId,
    summary: value.title,
    description: value.description,
    location: value.location,
    start: value.allDay
      ? { date: value.startAt }
      : { dateTime: value.startAt, timeZone: value.timezone },
    end: value.allDay
      ? { date: value.endAt }
      : { dateTime: value.endAt, timeZone: value.timezone },
    attendees: [...new Set(value.attendees.map((email) => email.toLowerCase()))].map((email) => ({ email })),
  };
  let response;
  try {
    response = await fetch(eventUrl + "?sendUpdates=all", {
      method: "POST",
      headers: {
        authorization: "Bearer " + access.token.accessToken,
        "content-type": "application/json",
      },
      body: JSON.stringify(eventBody),
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    return NextResponse.json(
      { error: "The creation outcome could not be confirmed. Refresh the calendar before retrying with this form still open." },
      { status: 502 },
    );
  }

  let event = await response.json().catch(() => ({}));
  let alreadyCreated = false;
  if (response.status === 409) {
    try {
      event = await googleApiGet(access.token.accessToken, eventUrl + "/" + encodeURIComponent(eventId));
      if (!matchesEventRequest(event, value)) {
        return NextResponse.json(
          { error: "This request key has already been used for a different calendar event." },
          { status: 409 },
        );
      }
      alreadyCreated = true;
    } catch {
      return NextResponse.json(
        { error: "Google Calendar could not confirm whether the event already exists. Refresh the calendar before retrying." },
        { status: 502 },
      );
    }
  } else if (!response.ok) {
    return NextResponse.json({
      error: response.status >= 500
        ? "Google Calendar could not confirm event creation. Refresh the calendar before retrying."
        : event.error?.message || "Google Calendar rejected the event.",
    }, { status: response.status >= 500 ? 502 : 400 });
  }

  await saveGoogleCalendarItem(user.id, event, value.timezone, value.priority);
  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      eventType: "CALENDAR_EVENT_CREATED",
      actor: "USER",
      resourceId: event.id || eventId,
      metadata: {
        title: event.summary || value.title,
        startAt: event.start?.dateTime ?? event.start?.date ?? value.startAt,
        attendeeCount: value.attendees.length,
      },
    },
  });
  const item = await prisma.scheduleItem.findUnique({
    where: { userId_calendarEventId: { userId: user.id, calendarEventId: event.id } },
  });
  return NextResponse.json({ event, item: item ? scheduleItemToJson(item) : null, alreadyCreated }, {
    status: alreadyCreated ? 200 : 201,
    headers: { "cache-control": "no-store" },
  });
}
