import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().trim().min(1).max(250),
  description: z.string().max(10000).optional().default(""),
  location: z.string().trim().max(500).optional().default(""),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  timezone: z.string().trim().min(1).max(100),
  attendees: z.array(z.string().trim().email().max(254)).max(50).default([]),
}).refine((value) => new Date(value.endAt) > new Date(value.startAt), {
  message: "Event end must be after its start.",
  path: ["endAt"],
}).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }).format(new Date(value.startAt));
    return true;
  } catch {
    return false;
  }
}, { message: "Enter a valid IANA timezone.", path: ["timezone"] });

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
  const token = await getGoogleAccessToken(userId);
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
  const eventBody = {
    summary: value.title,
    description: value.description,
    ...(value.location ? { location: value.location } : {}),
    start: { dateTime: value.startAt, timeZone: value.timezone },
    end: { dateTime: value.endAt, timeZone: value.timezone },
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
