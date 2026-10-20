import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
import { localDateTimeToIso } from "@/lib/calendar-timezone.mjs";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().trim().min(1).max(250),
  description: z.string().max(10000).optional().default(""),
  location: z.string().trim().max(500).optional().default(""),
  startAt: z.string().min(1).max(40),
  endAt: z.string().min(1).max(40),
  allDay: z.boolean().optional().default(false),
  timezone: z.string().trim().min(1).max(100),
  attendees: z.array(z.string().trim().email().max(254)).max(50).default([]),
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
}, { message: "Event end must be after its start, using valid date/time values.", path: ["endAt"] }).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}, { message: "Enter a valid IANA timezone.", path: ["timezone"] });

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

async function getCalendarAccess(userId) {
  const integration = await prisma.integration.findFirst({
    where: { userId, provider: "GOOGLE", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
    select: { scopes: true },
  });
  if (!integration) return { error: "Connect Google Calendar before editing events.", status: 403 };
  if (!integration.scopes.some((scope) => [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar",
  ].includes(scope))) {
    return { error: "Calendar event permission is missing. Reconnect Google and grant event access.", status: 403 };
  }
  let token;
  try {
    token = await getGoogleAccessToken(userId);
  } catch {
    return { error: "Google Calendar access could not be refreshed. Reconnect Google and try again.", status: 403 };
  }
  if (!token) return { error: "Google Calendar access needs to be renewed. Reconnect Google and try again.", status: 403 };
  return { token };
}

async function eventRequest(accessToken, eventId, method, body, etag) {
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(eventId));
  url.searchParams.set("sendUpdates", "all");
  const headers = { authorization: "Bearer " + accessToken };
  if (body) headers["content-type"] = "application/json";
  if (etag) headers["if-match"] = etag;
  return fetch(url.toString(), {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
}

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to edit calendar events." }, { status: 401 });
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter valid event details; end must be after start.", details: parsed.error.flatten() }, { status: 400 });
  const access = await getCalendarAccess(user.id);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  let current;
  try {
    current = await googleApiGet(access.token.accessToken, "https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the current calendar event." }, { status: 502 });
  }
  if (current.status === "cancelled") return NextResponse.json({ error: "This calendar event has already been cancelled." }, { status: 404 });
  const value = parsed.data;
  const availabilityStart = value.allDay ? localDateTimeToIso(value.startAt + "T00:00", value.timezone) : value.startAt;
  const availabilityEnd = value.allDay ? localDateTimeToIso(value.endAt + "T00:00", value.timezone) : value.endAt;
  if (!availabilityStart || !availabilityEnd) return NextResponse.json({ error: "The all-day date is invalid in the selected timezone." }, { status: 400 });
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
    return NextResponse.json({ error: "Could not verify calendar availability. No event update was applied." }, { status: 502 });
  }
  if (availability.nextPageToken) return NextResponse.json({ error: "There are too many events to verify this time safely. Open Google Calendar and choose a less crowded time." }, { status: 409 });
  const proposedStart = new Date(availabilityStart).getTime();
  const proposedEnd = new Date(availabilityEnd).getTime();
  const conflicts = (availability.items ?? []).filter((event) => {
    if (event.id === id || event.status === "cancelled" || event.transparency === "transparent") return false;
    const interval = eventInterval(event, value.timezone);
    return interval && proposedStart < interval.end && proposedEnd > interval.start;
  });
  if (conflicts.length) return NextResponse.json({
    error: "This time overlaps another calendar event. Review availability and choose a different time.",
    conflicts: conflicts.slice(0, 5).map((event) => ({ title: event.summary || "(untitled event)", start: event.start?.dateTime ?? event.start?.date ?? null, end: event.end?.dateTime ?? event.end?.date ?? null })),
  }, { status: 409 });
  const eventBody = {
    summary: value.title,
    description: value.description,
    location: value.location,
    start: value.allDay ? { date: value.startAt } : { dateTime: value.startAt, timeZone: value.timezone },
    end: value.allDay ? { date: value.endAt } : { dateTime: value.endAt, timeZone: value.timezone },
    attendees: [...new Set(value.attendees.map((email) => email.toLowerCase()))].map((email) => ({ email })),
  };
  try {
    const response = await eventRequest(access.token.accessToken, id, "PATCH", eventBody, current.etag);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = response.status === 412 ? 409 : response.status >= 500 ? 502 : 400;
      return NextResponse.json({
        error: response.status === 412
          ? "This event changed in Google Calendar while you were editing it. Refresh and review the latest version."
          : response.status >= 500
            ? "Google Calendar could not confirm the update. Refresh the calendar before retrying."
            : result.error?.message || "Google Calendar rejected the event update.",
      }, { status });
    }
    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        eventType: "CALENDAR_EVENT_UPDATED",
        actor: "USER",
        resourceId: id,
        metadata: { title: result.summary || value.title, startAt: result.start?.dateTime ?? value.startAt },
      },
    }).catch(() => undefined);
    return NextResponse.json({ event: result }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The update outcome could not be confirmed. Refresh Google Calendar before retrying." }, { status: 502 });
  }
}

export async function DELETE(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to cancel calendar events." }, { status: 401 });
  const { id } = await context.params;
  const access = await getCalendarAccess(user.id);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  let current;
  try {
    current = await googleApiGet(access.token.accessToken, "https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify the current calendar event." }, { status: 502 });
  }
  if (current.status === "cancelled") return NextResponse.json({ error: "This calendar event is already cancelled." }, { status: 404 });
  try {
    const response = await eventRequest(access.token.accessToken, id, "DELETE", null, current.etag);
    if (response.status === 404 || response.status === 410) return NextResponse.json({ cancelled: true, alreadyCancelled: true });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const status = response.status === 412 ? 409 : response.status >= 500 ? 502 : 400;
      return NextResponse.json({
        error: response.status === 412
          ? "This event changed in Google Calendar. Refresh and confirm you still want to cancel it."
          : response.status >= 500
            ? "Google Calendar could not confirm cancellation. Refresh the calendar before retrying."
            : result.error?.message || "Google Calendar rejected the cancellation.",
      }, { status });
    }
    await prisma.auditEvent.create({
      data: { userId: user.id, eventType: "CALENDAR_EVENT_CANCELLED", actor: "USER", resourceId: id, metadata: { title: current.summary || "(untitled event)" } },
    }).catch(() => undefined);
    return NextResponse.json({ cancelled: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The cancellation outcome could not be confirmed. Refresh Google Calendar before retrying." }, { status: 502 });
  }
}
