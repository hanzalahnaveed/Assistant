import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken } from "@/lib/google/client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z
  .object({
    title: z.string().trim().min(1).max(250),
    description: z.string().max(10000).optional().default(""),
    location: z.string().trim().max(500).optional().default(""),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(100),
    attendees: z.array(z.string().trim().email().max(254)).max(50).default([]),
  })
  .refine((v) => new Date(v.endAt) > new Date(v.startAt), {
    message: "Meeting end must be after its start.",
    path: ["endAt"],
  });
export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Sign in to edit meeting proposals." }, { status: 401 });
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      {
        error: "Enter valid meeting details; end must be after start.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  const v = parsed.data;
  const changed = await prisma.meetingDraft.updateMany({
    where: { id, userId: user.id, status: { in: ["DRAFT", "FAILED"] } },
    data: {
      title: v.title,
      description: v.description,
      location: v.location || null,
      startAt: new Date(v.startAt),
      endAt: new Date(v.endAt),
      timezone: v.timezone,
      attendees: [...new Set(v.attendees.map((a) => a.toLowerCase()))],
      status: "DRAFT",
      lastError: null,
    },
  });
  if (!changed.count)
    return NextResponse.json(
      { error: "Meeting proposal not found or it can no longer be edited." },
      { status: 409 },
    );
  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      eventType: "MEETING_DRAFT_EDITED",
      actor: "USER",
      resourceId: id,
      metadata: { title: v.title },
    },
  });
  return NextResponse.json(
    { draft: await prisma.meetingDraft.findFirst({ where: { id, userId: user.id } }) },
    { headers: { "cache-control": "no-store" } },
  );
}
export async function POST(request, context) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Sign in to manage meeting proposals." }, { status: 401 });
  const { id } = await context.params;
  const parsed = z
    .object({
      action: z.enum(["APPROVE", "CREATE", "CANCEL", "CONFIRM_CREATED", "CONFIRM_NOT_CREATED"]),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Choose a valid meeting action." }, { status: 400 });
  const draft = await prisma.meetingDraft.findFirst({ where: { id, userId: user.id } });
  if (!draft) return NextResponse.json({ error: "Meeting proposal not found." }, { status: 404 });
  const action = parsed.data.action;
  if (action === "CREATE") {
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
  }
  if (action === "CANCEL") {
    const changed = await prisma.meetingDraft.updateMany({
      where: { id, userId: user.id, status: { in: ["DRAFT", "APPROVED", "FAILED"] } },
      data: { status: "CANCELLED" },
    });
    if (!changed.count)
      return NextResponse.json(
        { error: "This meeting proposal can no longer be cancelled." },
        { status: 409 },
      );
    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        eventType: "MEETING_DRAFT_CANCELLED",
        actor: "USER",
        resourceId: id,
        metadata: {},
      },
    });
    return NextResponse.json({ draft: await prisma.meetingDraft.findUnique({ where: { id } }) });
  }
  if (action === "CONFIRM_CREATED" || action === "CONFIRM_NOT_CREATED") {
    if (draft.status !== "CREATE_UNCERTAIN")
      return NextResponse.json(
        { error: "This proposal has no uncertain creation outcome to resolve." },
        { status: 409 },
      );
    const found = action === "CONFIRM_CREATED";
    const changed = await prisma.meetingDraft.updateMany({
      where: { id, userId: user.id, status: "CREATE_UNCERTAIN" },
      data: found
        ? { status: "CREATED", lastError: null }
        : { status: "APPROVED", lastError: null },
    });
    if (!changed.count)
      return NextResponse.json({ error: "This outcome was already resolved." }, { status: 409 });
    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        eventType: found
          ? "MEETING_CREATE_MANUALLY_CONFIRMED"
          : "MEETING_CREATE_MANUALLY_CONFIRMED_ABSENT",
        actor: "USER",
        resourceId: id,
        metadata: { userCheckedGoogleCalendar: true },
      },
    });
    return NextResponse.json({ draft: await prisma.meetingDraft.findUnique({ where: { id } }) });
  }
  if (action === "APPROVE") {
    const changed = await prisma.meetingDraft.updateMany({
      where: { id, userId: user.id, status: "DRAFT" },
      data: { status: "APPROVED", approvedAt: new Date(), lastError: null },
    });
    if (!changed.count)
      return NextResponse.json(
        { error: "Only a draft can be approved. Edit it first if necessary." },
        { status: 409 },
      );
    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        eventType: "MEETING_DRAFT_APPROVED",
        actor: "USER",
        resourceId: id,
        metadata: { title: draft.title, startAt: draft.startAt.toISOString() },
      },
    });
    return NextResponse.json({ draft: await prisma.meetingDraft.findUnique({ where: { id } }) });
  }
  if (draft.status !== "APPROVED")
    return NextResponse.json(
      { error: "Approve this exact meeting proposal before creating it in Google Calendar." },
      { status: 409 },
    );
  const integration = await prisma.integration.findFirst({
    where: { userId: user.id, provider: "GOOGLE", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
  });
  const requiredScope = "https://www.googleapis.com/auth/calendar.events";
  if (!integration || !integration.scopes.includes(requiredScope))
    return NextResponse.json(
      {
        error:
          "Google Calendar event permission is missing. Reconnect Google from Connections and grant calendar event access.",
      },
      { status: 403 },
    );
  let token;
  try {
    token = await getGoogleAccessToken(user.id);
  } catch {
    return NextResponse.json(
      { error: "Google connection needs reconnecting before creating a meeting." },
      { status: 403 },
    );
  }
  if (!token)
    return NextResponse.json({ error: "Google connection needs reconnecting." }, { status: 403 });
  const claimed = await prisma.meetingDraft.updateMany({
    where: { id, userId: user.id, status: "APPROVED" },
    data: { status: "CREATING", lastError: null },
  });
  if (!claimed.count)
    return NextResponse.json(
      { error: "This meeting is already being processed or has changed." },
      { status: 409 },
    );
  const event = {
    summary: draft.title,
    description: draft.description,
    ...(draft.location ? { location: draft.location } : {}),
    start: { dateTime: draft.startAt.toISOString(), timeZone: draft.timezone },
    end: { dateTime: draft.endAt.toISOString(), timeZone: draft.timezone },
    ...(draft.attendees.length ? { attendees: draft.attendees.map((email) => ({ email })) } : {}),
  };
  try {
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
      {
        method: "POST",
        headers: {
          authorization: "Bearer " + token.accessToken,
          "content-type": "application/json",
        },
        body: JSON.stringify(event),
        cache: "no-store",
        signal: AbortSignal.timeout(25000),
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const uncertain = response.status >= 500;
      const message = uncertain
        ? "Google returned a server error; check Calendar before retrying to avoid a duplicate meeting."
        : response.status === 403
          ? "Google denied calendar event access. Reconnect and grant the calendar event permission."
          : result.error?.message ||
            "Google Calendar rejected the event. Edit the proposal and retry.";
      await prisma.meetingDraft.update({
        where: { id },
        data: { status: uncertain ? "CREATE_UNCERTAIN" : "FAILED", lastError: message },
      });
      await prisma.auditEvent
        .create({
          data: {
            userId: user.id,
            eventType: uncertain ? "MEETING_CREATE_UNCERTAIN" : "MEETING_CREATE_FAILED",
            actor: "SYSTEM",
            resourceId: id,
            metadata: { httpStatus: response.status },
          },
        })
        .catch(() => undefined);
      return NextResponse.json({ error: message }, { status: uncertain ? 502 : 400 });
    }
    const saved = await prisma.meetingDraft.update({
      where: { id },
      data: {
        status: "CREATED",
        createdEventId: result.id ?? null,
        createdEventLink: result.htmlLink ?? null,
        lastError: null,
      },
    });
    await prisma.auditEvent
      .create({
        data: {
          userId: user.id,
          eventType: "MEETING_CREATED",
          actor: "USER",
          resourceId: id,
          metadata: {
            title: draft.title,
            googleEventId: result.id ?? null,
            attendeeCount: draft.attendees.length,
          },
        },
      })
      .catch(() => undefined);
    return NextResponse.json({ draft: saved }, { headers: { "cache-control": "no-store" } });
  } catch {
    const message =
      "Creation outcome could not be confirmed. Check Google Calendar before retrying; this proposal is locked to avoid duplicate meetings.";
    await prisma.meetingDraft.update({
      where: { id },
      data: { status: "CREATE_UNCERTAIN", lastError: message },
    });
    await prisma.auditEvent
      .create({
        data: {
          userId: user.id,
          eventType: "MEETING_CREATE_UNCERTAIN",
          actor: "SYSTEM",
          resourceId: id,
          metadata: {},
        },
      })
      .catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
