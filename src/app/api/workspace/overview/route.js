import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function header(message, name) {
  return (
    message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())
      ?.value ?? ""
  );
}
export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Sign in with Google to continue." }, { status: 401 });
  const integration = await prisma.integration.findFirst({
    where: { userId: user.id, provider: "GOOGLE" },
    orderBy: { updatedAt: "desc" },
    select: { status: true, email: true, scopes: true, lastSyncedAt: true },
  });
  if (!integration || integration.status !== "CONNECTED") {
    return NextResponse.json(
      {
        connected: false,
        user,
        integration: integration ? { ...integration, scopes: integration.scopes } : null,
        emails: [],
        events: [],
      },
      { headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const token = await getGoogleAccessToken(user.id);
    if (!token) {
      return NextResponse.json(
        { connected: false, reauthRequired: true, user, emails: [], events: [] },
        { status: 200 },
      );
    }
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const gmailUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    gmailUrl.searchParams.set("maxResults", "6");
    gmailUrl.searchParams.set("q", "in:inbox newer_than:14d -category:promotions");
    const calendarUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    calendarUrl.searchParams.set("timeMin", now.toISOString());
    calendarUrl.searchParams.set("timeMax", tomorrow.toISOString());
    calendarUrl.searchParams.set("singleEvents", "true");
    calendarUrl.searchParams.set("orderBy", "startTime");
    calendarUrl.searchParams.set("maxResults", "10");
    const [gmail, calendar] = await Promise.all([
      googleApiGet(token.accessToken, gmailUrl.toString()),
      googleApiGet(token.accessToken, calendarUrl.toString()),
    ]);
    const details = await Promise.all(
      (gmail.messages ?? []).slice(0, 6).map(async (message) => {
        const url = new URL(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}`,
        );
        url.searchParams.set("format", "metadata");
        url.searchParams.append("metadataHeaders", "From");
        url.searchParams.append("metadataHeaders", "Subject");
        url.searchParams.append("metadataHeaders", "Date");
        const item = await googleApiGet(token.accessToken, url.toString());
        return {
          id: item.id,
          threadId: item.threadId,
          from: header(item, "From"),
          subject: header(item, "Subject") || "(no subject)",
          date: header(item, "Date"),
          snippet: item.snippet ?? "",
        };
      }),
    );
    await prisma.integration.updateMany({
      where: { userId: user.id, provider: "GOOGLE", status: "CONNECTED" },
      data: { lastSyncedAt: new Date() },
    });
    return NextResponse.json(
      {
        connected: true,
        user,
        integration: {
          email: token.email,
          status: "CONNECTED",
          lastSyncedAt: new Date().toISOString(),
        },
        emails: details,
        emailCountEstimate: gmail.resultSizeEstimate ?? details.length,
        events: (calendar.items ?? [])
          .filter((event) => event.status !== "cancelled")
          .map((event) => ({
            id: event.id,
            title: event.summary || "(untitled event)",
            start: event.start?.dateTime ?? event.start?.date ?? null,
            end: event.end?.dateTime ?? event.end?.date ?? null,
            location: event.location ?? null,
            link: event.htmlLink ?? null,
            attendeeCount: event.attendees?.length ?? 0,
          })),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load Google Workspace data.";
    return NextResponse.json(
      { connected: true, error: message, user, emails: [], events: [] },
      { status: 502 },
    );
  }
}
