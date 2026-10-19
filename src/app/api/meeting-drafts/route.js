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
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage meetings." }, { status: 401 });
  const drafts = await prisma.meetingDraft.findMany({
    where: { userId: user.id },
    orderBy: { startAt: "asc" },
    take: 100,
  });
  let events = [];
  let calendarError = null;
  const integration = await prisma.integration.findFirst({
    where: { userId: user.id, provider: "GOOGLE", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
    select: { scopes: true },
  });
  if (integration?.scopes.includes("https://www.googleapis.com/auth/calendar.readonly")) {
    try {
      const token = await getGoogleAccessToken(user.id);
      if (token) {
        const now = new Date();
        const until = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
        url.searchParams.set("timeMin", now.toISOString());
        url.searchParams.set("timeMax", until.toISOString());
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        url.searchParams.set("maxResults", "100");
        const result = await googleApiGet(token.accessToken, url.toString());
        events = (result.items ?? [])
          .filter((e) => e.status !== "cancelled")
          .map((e) => ({
            id: e.id,
            title: e.summary || "(untitled meeting)",
            description: e.description || "",
            location: e.location || "",
            startAt: e.start?.dateTime ?? e.start?.date ?? null,
            endAt: e.end?.dateTime ?? e.end?.date ?? null,
            timezone: e.start?.timeZone ?? user.timezone,
            link: e.htmlLink ?? null,
            attendees: (e.attendees ?? []).map((a) => a.email).filter(Boolean),
          }));
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
