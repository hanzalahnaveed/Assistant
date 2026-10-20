import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
import { localDateTimeToIso } from "@/lib/calendar-timezone.mjs";
import { prisma } from "@/lib/prisma";
import { saveGoogleCalendarItem } from "@/lib/schedule/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const inputSchema = z.object({
  startAt: z.string().datetime(),
});

function eventInterval(event, timezone) {
  const startValue = event.start?.dateTime ??
    (event.start?.date ? localDateTimeToIso(event.start.date + "T00:00", timezone) : null);
  const endValue = event.end?.dateTime ??
    (event.end?.date ? localDateTimeToIso(event.end.date + "T00:00", timezone) : null);
  const start = new Date(startValue || "").getTime();
  const end = new Date(endValue || "").getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

async function getExistingEvent(accessToken, url) {
  const response = await fetch(url, {
    headers: { authorization: "Bearer " + accessToken },
    cache: "no-store",
  });
  if (response.status === 404) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Could not verify the existing calendar event.");
  return data;
}

export async function POST(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in before scheduling a meeting." }, { status: 401 });

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose one of the offered meeting slots." }, { status: 400 });

  const { id } = await context.params;
  const inbound = await prisma.inboundEmail.findFirst({
    where: { id, userId: user.id },
  });
  if (!inbound) return NextResponse.json({ error: "Inbound email was not found." }, { status: 404 });
  if (inbound.category !== "MEETING") {
    return NextResponse.json({ error: "This email was not classified as a meeting request." }, { status: 409 });
  }
  if (!inbound.draftId) return NextResponse.json({ error: "Create a reply draft before scheduling the meeting." }, { status: 409 });

  const classification = inbound.classification && typeof inbound.classification === "object" &&
    !Array.isArray(inbound.classification) ? inbound.classification : {};
  const slots = Array.isArray(classification.availableSlots) ? classification.availableSlots : [];
  const slot = slots.find((candidate) => candidate?.startAt === parsed.data.startAt);
  if (!slot) return NextResponse.json({ error: "That time is not one of the currently offered slots. Refresh the email activity and try again." }, { status: 400 });

  const durationMinutes = Number.isInteger(classification.meeting?.durationMinutes)
    ? Math.max(15, Math.min(240, classification.meeting.durationMinutes))
    : 30;
  const start = new Date(slot.startAt);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now() || !Number.isFinite(end.getTime())) {
    return NextResponse.json({ error: "The selected meeting time is no longer valid." }, { status: 400 });
  }

  const preferences = await prisma.userPreference.findUnique({
    where: { userId: user.id },
    select: { automationPaused: true },
  });
  if (preferences?.automationPaused) {
    return NextResponse.json({ error: "Automation is paused. Resume it before creating a calendar event." }, { status: 409 });
  }

  const integration = await prisma.integration.findFirst({
    where: { userId: user.id, provider: "GOOGLE", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
    select: { scopes: true },
  });
  const writeScopes = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar",
  ];
  if (!integration || !integration.scopes.some((scope) => writeScopes.includes(scope))) {
    return NextResponse.json({ error: "Google Calendar event permission is missing. Reconnect Google and grant event access." }, { status: 403 });
  }
  let token;
  try {
    token = await getGoogleAccessToken(user.id);
  } catch {
    return NextResponse.json({ error: "Google Calendar access could not be refreshed. Reconnect Google and try again." }, { status: 403 });
  }
  if (!token) return NextResponse.json({ error: "Google Calendar access needs reconnecting." }, { status: 403 });

  const eventId = createHash("sha256")
    .update(user.id + ":" + inbound.gmailMessageId + ":" + start.toISOString())
    .digest("hex")
    .slice(0, 32);
  const eventUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + eventId);
  let event;
  try {
    event = await getExistingEvent(token.accessToken, eventUrl.toString());
    if (!event) {
      const rangeUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
      rangeUrl.searchParams.set("timeMin", new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString());
      rangeUrl.searchParams.set("timeMax", new Date(end.getTime() + 24 * 60 * 60 * 1000).toISOString());
      rangeUrl.searchParams.set("singleEvents", "true");
      rangeUrl.searchParams.set("maxResults", "250");
      const busyEvents = await googleApiGet(token.accessToken, rangeUrl.toString());
      const conflict = (busyEvents.items ?? []).some((candidate) => {
        if (candidate.id === eventId || candidate.status === "cancelled" || candidate.transparency === "transparent") return false;
        const interval = eventInterval(candidate, user.timezone || "Asia/Karachi");
        return interval && start.getTime() < interval.end && end.getTime() > interval.start;
      });
      if (conflict) {
        return NextResponse.json({ error: "That slot is no longer free. Refresh the calendar availability and choose another time." }, { status: 409 });
      }

      const createUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
      createUrl.searchParams.set("conferenceDataVersion", "1");
      createUrl.searchParams.set("sendUpdates", "all");
      const createResponse = await fetch(createUrl.toString(), {
        method: "POST",
        headers: {
          authorization: "Bearer " + token.accessToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: eventId,
          summary: "Meeting: " + inbound.subject.slice(0, 180),
          description: "Scheduled from an inbound email after account-owner confirmation.",
          start: { dateTime: start.toISOString(), timeZone: user.timezone || "Asia/Karachi" },
          end: { dateTime: end.toISOString(), timeZone: user.timezone || "Asia/Karachi" },
          attendees: [{ email: inbound.fromEmail }],
          conferenceData: {
            createRequest: {
              requestId: "email-agent-" + eventId,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(25000),
      });
      event = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok) {
        return NextResponse.json({
          error: createResponse.status >= 500
            ? "Google's event-creation outcome may be uncertain. Refresh the calendar before retrying."
            : event.error?.message || "Google Calendar could not create this meeting.",
        }, { status: createResponse.status >= 500 ? 502 : 400 });
      }
    }
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Could not verify calendar availability or create the meeting.",
    }, { status: 502 });
  }

  const meetLink = event.hangoutLink ||
    event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri ||
    null;
  const calendarLink = event.htmlLink || null;
  const link = meetLink || calendarLink;
  if (!link) {
    return NextResponse.json({
      error: "The event exists, but Google has not returned a meeting or event link yet. Refresh the calendar and retry; the event ID is retained to prevent duplicates.",
    }, { status: 502 });
  }

  const draft = await prisma.emailDraft.findFirst({
    where: { id: inbound.draftId, userId: user.id },
  });
  if (!draft) return NextResponse.json({ error: "The reply draft for this email no longer exists." }, { status: 409 });
  const meetingDetails = [
    "[Assistant meeting details]",
    "Meeting scheduled for " + (slot.label || start.toISOString()) + ".",
    (meetLink ? "Google Meet: " : "Calendar event: ") + link,
    ...(calendarLink && meetLink ? ["Calendar event: " + calendarLink] : []),
  ].join("\n");
  const baseBody = draft.body.replace(/\n\n\[Assistant meeting details\][\s\S]*$/, "").trimEnd();
  const updatedDraft = await prisma.emailDraft.update({
    where: { id: draft.id },
    data: {
      body: baseBody + "\n\n" + meetingDetails,
      goal: ((draft.goal || "").replace(/\nMeeting event created by owner:[^\n]*/, "") +
        "\nMeeting event created by owner: " + event.id).trim(),
      replyThreadId: inbound.gmailThreadId,
      status: "DRAFT",
      approvedAt: null,
      lastError: null,
    },
  });
  await prisma.inboundEmail.update({
    where: { id: inbound.id },
    data: {
      status: "MEETING_BOOKED_REVIEW",
      classification: {
        ...classification,
        meetingEventId: event.id,
        meetingLink: meetLink,
        calendarEventLink: calendarLink,
        selectedSlot: { startAt: start.toISOString(), endAt: end.toISOString(), label: slot.label || start.toISOString() },
      },
      lastError: null,
    },
  });
  await saveGoogleCalendarItem(user.id, event, user.timezone || "Asia/Karachi").catch(() => undefined);
  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      eventType: "EMAIL_AGENT_MEETING_CREATED",
      actor: "USER",
      resourceId: inbound.id,
      metadata: {
        gmailMessageId: inbound.gmailMessageId,
        calendarEventId: event.id,
        meetingLink: meetLink,
        calendarEventLink: calendarLink,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      },
    },
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    event: {
      id: event.id,
      title: event.summary || inbound.subject,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      meetingLink: meetLink,
      calendarEventLink: calendarLink,
    },
    draft: updatedDraft,
  }, { headers: { "cache-control": "no-store" } });
}
