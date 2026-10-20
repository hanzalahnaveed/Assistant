import { localDateTimeToIso } from "@/lib/calendar-timezone.mjs";
import { prisma } from "@/lib/prisma";

export async function saveGoogleCalendarItem(userId, event, fallbackTimezone, priority) {
  if (!event?.id) {
    return null;
  }
  if (event.status === "cancelled") {
    return prisma.scheduleItem.updateMany({
      where: { userId, calendarEventId: event.id },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
  }
  const allDay = Boolean(event.start?.date && !event.start?.dateTime);
  const timezone = event.start?.timeZone || fallbackTimezone || "UTC";
  const startValue = event.start?.dateTime ??
    (event.start?.date ? localDateTimeToIso(event.start.date + "T00:00", timezone) : null);
  const endValue = event.end?.dateTime ??
    (event.end?.date ? localDateTimeToIso(event.end.date + "T00:00", timezone) : null);
  const start = startValue ? new Date(startValue) : null;
  const end = endValue ? new Date(endValue) : null;
  if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return null;
  }
  const eventData = {
    title: event.summary || "(untitled meeting)",
    description: event.description || null,
    dueAt: start,
    scheduledStartAt: start,
    scheduledEndAt: end,
    timezone,
    allDay,
    location: event.location || null,
    attendees: (event.attendees ?? []).map((attendee) => attendee.email).filter(Boolean),
    calendarEventEtag: event.etag || null,
    calendarEventLink: event.htmlLink || null,
    ...(priority ? { priority } : {}),
  };
  const where = { userId_calendarEventId: { userId, calendarEventId: event.id } };
  return prisma.scheduleItem.upsert({
    where,
    create: {
      userId,
      ...eventData,
      status: "TODO",
      priority: priority || "MEDIUM",
      source: "GOOGLE_CALENDAR",
      sourceRef: event.id,
      calendarEventId: event.id,
    },
    update: eventData,
  });
}

export function scheduleItemToJson(item) {
  const calendarDate = (value) => new Intl.DateTimeFormat("en-CA", {
    timeZone: item.timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  const start = item.scheduledStartAt ?? item.dueAt;
  const end = item.scheduledEndAt;
  return {
    ...item,
    dueAt: item.dueAt?.toISOString() ?? null,
    scheduledStartAt: item.scheduledStartAt?.toISOString() ?? null,
    scheduledEndAt: item.scheduledEndAt?.toISOString() ?? null,
    startAt: start ? item.allDay ? calendarDate(start) : start.toISOString() : null,
    endAt: end ? item.allDay ? calendarDate(end) : end.toISOString() : null,
  };
}
