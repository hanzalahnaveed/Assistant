import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
import { localDayBounds } from "@/lib/briefing/service";
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
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const integration = await prisma.integration.findFirst({
    where: { userId: user.id, provider: "GOOGLE" },
    orderBy: { updatedAt: "desc" },
    select: { status: true, email: true, scopes: true, lastSyncedAt: true },
  });
  if (!integration || integration.status !== "CONNECTED") {
    return NextResponse.json(
      {
        connected: false,
        reauthRequired: integration?.status === "REAUTH_REQUIRED",
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
    const { start: dayStart, end: dayEnd } = localDayBounds(now, user.timezone || "Asia/Karachi");
    const gmailUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    gmailUrl.searchParams.set("maxResults", "25");
    gmailUrl.searchParams.set("q", "in:inbox newer_than:14d -category:promotions");
    const calendarUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    calendarUrl.searchParams.set("timeMin", dayStart.toISOString());
    calendarUrl.searchParams.set("timeMax", dayEnd.toISOString());
    calendarUrl.searchParams.set("singleEvents", "true");
    calendarUrl.searchParams.set("orderBy", "startTime");
    calendarUrl.searchParams.set("maxResults", "10");
    // Gmail and Calendar are independent capabilities. Keep whichever side
    // succeeds so a missing scope or temporary provider failure does not blank
    // the entire integrations workspace.
    const [gmailResult, calendarResult] = await Promise.allSettled([
      googleApiGet(token.accessToken, gmailUrl.toString()),
      googleApiGet(token.accessToken, calendarUrl.toString()),
    ]);
    const gmail = gmailResult.status === "fulfilled" ? gmailResult.value : { messages: [], resultSizeEstimate: 0 };
    const calendar = calendarResult.status === "fulfilled" ? calendarResult.value : { items: [] };
    const workspaceWarnings = [];
    if (gmailResult.status === "rejected") workspaceWarnings.push("Gmail could not be loaded.");
    if (calendarResult.status === "rejected") workspaceWarnings.push("Google Calendar could not be loaded.");
    const detailResults = await Promise.allSettled(
      (gmail.messages ?? []).slice(0, 25).map(async (message) => {
        const url = new URL(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}`,
        );
        url.searchParams.set("format", "metadata");
        url.searchParams.append("metadataHeaders", "From");
        url.searchParams.append("metadataHeaders", "Subject");
        url.searchParams.append("metadataHeaders", "Date");
        const item = await googleApiGet(token.accessToken, url.toString());
        const labels = item.labelIds ?? [];
        const priorityReasons = [];
        if (labels.includes("IMPORTANT")) priorityReasons.push("Marked important");
        if (labels.includes("UNREAD")) priorityReasons.push("Unread");
        if (labels.includes("STARRED")) priorityReasons.push("Starred");
        const priorityScore =
          (labels.includes("IMPORTANT") ? 3 : 0) +
          (labels.includes("UNREAD") ? 2 : 0) +
          (labels.includes("STARRED") ? 1 : 0);
        return {
          id: item.id,
          threadId: item.threadId,
          from: header(item, "From"),
          subject: header(item, "Subject") || "(no subject)",
          date: header(item, "Date"),
          snippet: item.snippet ?? "",
          priority: priorityScore >= 3 ? "HIGH" : priorityScore > 0 ? "MEDIUM" : "NORMAL",
          priorityReasons,
          priorityScore,
          internalDate: Number(item.internalDate ?? 0),
        };
      }),
    );
    const details = detailResults
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    if (detailResults.some((result) => result.status === "rejected")) {
      workspaceWarnings.push("Some inbox messages could not be loaded.");
    }
    details.sort(
      (a, b) => b.priorityScore - a.priorityScore || b.internalDate - a.internalDate,
    );
    await prisma.integration.updateMany({
      where: { userId: user.id, provider: "GOOGLE", status: "CONNECTED" },
      data: { lastSyncedAt: new Date() },
    });
    return NextResponse.json(
      {
        connected: true,
        workspaceError: workspaceWarnings.length ? workspaceWarnings.join(" ") : null,
        user,
        integration: {
          email: token.email,
          status: "CONNECTED",
          lastSyncedAt: new Date().toISOString(),
        },
        emails: details.slice(0, 6),
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
    const currentIntegration = await prisma.integration.findFirst({
      where: { userId: user.id, provider: "GOOGLE" },
      orderBy: { updatedAt: "desc" },
      select: { status: true, email: true, scopes: true, lastSyncedAt: true },
    });
    if (currentIntegration?.status === "REAUTH_REQUIRED") {
      return NextResponse.json(
        {
          connected: false,
          reauthRequired: true,
          user,
          integration: currentIntegration,
          emails: [],
          events: [],
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      { connected: true, error: message, user, emails: [], events: [] },
      { status: 502 },
    );
  }
}
