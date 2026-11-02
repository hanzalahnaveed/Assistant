import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
import { saveGoogleCalendarItem } from "@/lib/schedule/items";
import { localDateTimeToIso } from "@/lib/calendar-timezone.mjs";

const inputSchema = z.object({
  title: z.string().trim().min(1).max(250),
  description: z.string().max(10000).optional().default(""),
  location: z.string().max(500).optional().default(""),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  timezone: z.string().min(1).max(100),
  attendees: z.array(z.string().email().max(254)).max(50).default([]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM")
}).refine(v => new Date(v.endAt) > new Date(v.startAt)).refine(v => { try { new Intl.DateTimeFormat("en-US", { timeZone: v.timezone }).format(new Date()); return true; } catch { return false; } });

export async function executeCalendarEventAction(userId, action) {
  const parsed = inputSchema.safeParse(action.input);
  if (!parsed.success) return { error: "Saved calendar event details are invalid.", status: 409 };
  const value = parsed.data;
  const integration = await prisma.integration.findFirst({ where: { userId, provider: "GOOGLE", status: "CONNECTED" }, orderBy: { updatedAt: "desc" }, select: { scopes: true } });
  if (!integration) return { error: "Connect Google Calendar before approving this event.", status: 403 };
  if (!integration.scopes.some(scope => ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar"].includes(scope))) return { error: "Calendar event permission is missing. Reconnect Google and grant event access.", status: 403 };
  let token;
  try { token = await getGoogleAccessToken(userId); } catch { return { error: "Google Calendar access could not be refreshed. Reconnect Google.", status: 403 }; }
  if (!token) return { error: "Google Calendar access needs to be renewed. Reconnect Google.", status: 403 };
  const claimed = await prisma.actionRecord.updateMany({ where: { id: action.id, userId, status: { in: ["PENDING", "APPROVED"] } }, data: { status: "RUNNING", approvedAt: new Date(), startedAt: new Date(), errorCode: null } });
  if (!claimed.count) {
    const current = await prisma.actionRecord.findFirst({ where: { id: action.id, userId } });
    if (current?.status === "SUCCEEDED") return { action: current, reused: true };
    return { error: "This calendar action is already being processed or has changed.", status: 409 };
  }
  const eventId = createHash("sha256").update(action.id).digest("hex").slice(0, 40);
  const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  try {
    const existingResponse = await fetch(base + "/" + eventId, { headers: { authorization: "Bearer " + token.accessToken }, cache: "no-store", signal: AbortSignal.timeout(20000) });
    let event;
    if (existingResponse.ok) {
      event = await existingResponse.json();
      if (event.summary !== value.title || new Date(event.start?.dateTime).getTime() !== new Date(value.startAt).getTime() || new Date(event.end?.dateTime).getTime() !== new Date(value.endAt).getTime()) throw new Error("IDEMPOTENCY_CONFLICT");
    } else if (existingResponse.status === 404 || existingResponse.status === 410) {
      const url = new URL(base); url.searchParams.set("timeMin", value.startAt); url.searchParams.set("timeMax", value.endAt); url.searchParams.set("singleEvents", "true"); url.searchParams.set("maxResults", "250");
      const availability = await googleApiGet(token.accessToken, url.toString());
      if (availability.nextPageToken) throw new Error("CALENDAR_TOO_BUSY");
      const start = new Date(value.startAt).getTime(), end = new Date(value.endAt).getTime();
      const conflict = (availability.items || []).some(item => {
        if (item.status === "cancelled" || item.transparency === "transparent") return false;
        const itemStartValue = item.start?.date ? localDateTimeToIso(item.start.date + "T00:00", value.timezone) : item.start?.dateTime;
        const itemEndValue = item.end?.date ? localDateTimeToIso(item.end.date + "T00:00", value.timezone) : item.end?.dateTime;
        const itemStart = new Date(itemStartValue || "").getTime(), itemEnd = new Date(itemEndValue || "").getTime();
        return Number.isFinite(itemStart) && Number.isFinite(itemEnd) && start < itemEnd && end > itemStart;
      });
      if (conflict) throw new Error("CALENDAR_CONFLICT");
      const response = await fetch(base + "?sendUpdates=all", { method: "POST", headers: { authorization: "Bearer " + token.accessToken, "content-type": "application/json" }, body: JSON.stringify({ id: eventId, summary: value.title, description: value.description, location: value.location, start: { dateTime: value.startAt, timeZone: value.timezone }, end: { dateTime: value.endAt, timeZone: value.timezone }, attendees: [...new Set(value.attendees.map(email => email.toLowerCase()))].map(email => ({ email })) }), cache: "no-store", signal: AbortSignal.timeout(25000) });
      event = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 409) throw new Error(response.status >= 500 ? "GOOGLE_UNCERTAIN" : "GOOGLE_REJECTED");
      if (response.status === 409) event = await googleApiGet(token.accessToken, base + "/" + eventId);
    } else throw new Error("GOOGLE_UNAVAILABLE");
    await saveGoogleCalendarItem(userId, event, value.timezone, value.priority);
    const completed = await prisma.$transaction(async tx => {
      const updated = await tx.actionRecord.update({ where: { id: action.id }, data: { status: "SUCCEEDED", completedAt: new Date(), result: { calendarEventId: event.id, title: event.summary, htmlLink: event.htmlLink || null } } });
      await tx.auditEvent.create({ data: { userId, eventType: "ACTION_APPROVED_AND_EXECUTED", actor: "USER", resourceId: action.id, metadata: { actionType: action.actionType, calendarEventId: event.id } } });
      return updated;
    });
    return { action: completed, event };
  } catch (error) {
    const code = error instanceof Error ? error.message : "CALENDAR_CREATE_FAILED";
    const messages = { IDEMPOTENCY_CONFLICT: "This action key belongs to a different calendar event.", CALENDAR_TOO_BUSY: "There are too many events to verify this time safely.", CALENDAR_CONFLICT: "This time overlaps another calendar event. No event was created.", GOOGLE_UNCERTAIN: "Google Calendar could not confirm creation. Refresh the calendar before retrying.", GOOGLE_REJECTED: "Google Calendar rejected the event.", GOOGLE_UNAVAILABLE: "Google Calendar could not verify this event request." };
    const failed = await prisma.actionRecord.update({ where: { id: action.id }, data: { status: "FAILED", errorCode: code, completedAt: new Date() } }).catch(() => null);
    return { error: messages[code] || "Calendar event creation failed.", status: 409, action: failed };
  }
}
