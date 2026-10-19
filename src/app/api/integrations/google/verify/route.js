import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getGoogleAccessToken, googleApiGet } from "@/lib/google/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES = {
  gmailRead: "https://www.googleapis.com/auth/gmail.readonly",
  gmailSend: "https://www.googleapis.com/auth/gmail.send",
  calendarRead: "https://www.googleapis.com/auth/calendar.readonly",
  calendarWrite: "https://www.googleapis.com/auth/calendar.events",
};

function capability(status, detail) {
  return { status, detail };
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in before verifying Google integrations." }, { status: 401 });
  }

  const integration = await prisma.integration.findFirst({
    where: { userId: user.id, provider: "GOOGLE" },
    orderBy: { updatedAt: "desc" },
    select: { email: true, status: true, scopes: true, lastSyncedAt: true },
  });

  if (!integration) {
    return NextResponse.json({
      connected: false,
      reauthRequired: false,
      email: null,
      checkedAt: new Date().toISOString(),
      checks: {
        gmailRead: capability("not_connected", "Connect a Google account to test Gmail inbox access."),
        gmailSend: capability("not_connected", "Connect a Google account to check approved email sending permission."),
        calendarRead: capability("not_connected", "Connect a Google account to test calendar access."),
        calendarWrite: capability("not_connected", "Connect a Google account to check event creation permission."),
      },
    }, { headers: { "cache-control": "no-store" } });
  }

  const granted = new Set(integration.scopes ?? []);
  const hasGmailRead = granted.has(SCOPES.gmailRead);
  const hasGmailSend = granted.has(SCOPES.gmailSend);
  const hasCalendarRead = granted.has(SCOPES.calendarRead) || granted.has(SCOPES.calendarWrite);
  const hasCalendarWrite = granted.has(SCOPES.calendarWrite);
  const checks = {
    gmailRead: capability(hasGmailRead ? "checking" : "missing_scope", hasGmailRead ? "Gmail read permission is granted; testing live API access." : "Missing Gmail read permission. Reconnect Google and grant inbox access."),
    gmailSend: capability(hasGmailSend ? "granted" : "missing_scope", hasGmailSend ? "Permission granted. Sending is still gated by draft approval and explicit confirmation." : "Missing Gmail send permission. Reconnect Google and grant send access."),
    calendarRead: capability(hasCalendarRead ? "checking" : "missing_scope", hasCalendarRead ? "Calendar read permission is granted; testing live API access." : "Missing Calendar read permission. Reconnect Google and grant calendar access."),
    calendarWrite: capability(hasCalendarWrite ? "granted" : "missing_scope", hasCalendarWrite ? "Permission granted. Event creation still requires approval and a separate confirmation." : "Missing Calendar event permission. Reconnect Google and grant event access."),
  };

  if (integration.status !== "CONNECTED") {
    for (const key of Object.keys(checks)) {
      if (checks[key].status !== "missing_scope") {
        checks[key] = capability("reauth_required", "Google needs to be reconnected before this permission can be verified.");
      }
    }
    return NextResponse.json({
      connected: false,
      reauthRequired: integration.status === "REAUTH_REQUIRED",
      email: integration.email,
      checkedAt: new Date().toISOString(),
      checks,
    }, { headers: { "cache-control": "no-store" } });
  }

  let token;
  try {
    token = await getGoogleAccessToken(user.id);
  } catch {
    const current = await prisma.integration.findFirst({
      where: { userId: user.id, provider: "GOOGLE" },
      orderBy: { updatedAt: "desc" },
      select: { status: true },
    });
    if (current?.status === "REAUTH_REQUIRED") {
      for (const key of Object.keys(checks)) {
        if (checks[key].status !== "missing_scope") {
          checks[key] = capability("reauth_required", "Google access expired or was revoked. Reconnect to verify this permission.");
        }
      }
      return NextResponse.json({
        connected: false,
        reauthRequired: true,
        email: integration.email,
        checkedAt: new Date().toISOString(),
        checks,
      }, { headers: { "cache-control": "no-store" } });
    }
    for (const key of ["gmailRead", "calendarRead"]) {
      if (checks[key].status === "checking") {
        checks[key] = capability("failed", "Could not refresh Google access. Retry or reconnect the account.");
      }
    }
    return NextResponse.json({
      connected: true,
      reauthRequired: false,
      email: integration.email,
      checkedAt: new Date().toISOString(),
      checks,
    }, { headers: { "cache-control": "no-store" } });
  }

  if (!token) {
    return NextResponse.json({
      connected: false,
      reauthRequired: true,
      email: integration.email,
      checkedAt: new Date().toISOString(),
      checks: Object.fromEntries(Object.entries(checks).map(([key, value]) => [
        key,
        value.status === "missing_scope" ? value : capability("reauth_required", "Reconnect Google to restore API access."),
      ])),
    }, { headers: { "cache-control": "no-store" } });
  }

  const now = new Date();
  const gmailProbe = hasGmailRead
    ? googleApiGet(token.accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=in%3Ainbox")
    : Promise.resolve(null);
  const calendarProbe = hasCalendarRead
    ? (() => {
        const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
        url.searchParams.set("timeMin", now.toISOString());
        url.searchParams.set("timeMax", new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString());
        url.searchParams.set("maxResults", "1");
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        return googleApiGet(token.accessToken, url.toString());
      })()
    : Promise.resolve(null);

  const [gmailResult, calendarResult] = await Promise.allSettled([gmailProbe, calendarProbe]);
  if (hasGmailRead) {
    checks.gmailRead = gmailResult.status === "fulfilled"
      ? capability("passed", "Gmail API responded successfully. Inbox reading is available.")
      : capability("failed", gmailResult.reason instanceof Error ? gmailResult.reason.message : "Gmail API verification failed. Retry or reconnect.");
  }
  if (hasCalendarRead) {
    checks.calendarRead = calendarResult.status === "fulfilled"
      ? capability("passed", "Google Calendar API responded successfully. Event reading is available.")
      : capability("failed", calendarResult.reason instanceof Error ? calendarResult.reason.message : "Calendar API verification failed. Retry or reconnect.");
  }

  if (
    (hasGmailRead && gmailResult.status === "fulfilled") ||
    (hasCalendarRead && calendarResult.status === "fulfilled")
  ) {
    await prisma.integration.updateMany({
      where: { userId: user.id, provider: "GOOGLE", status: "CONNECTED" },
      data: { lastSyncedAt: new Date() },
    });
  }

  return NextResponse.json({
    connected: true,
    reauthRequired: false,
    email: token.email || integration.email,
    checkedAt: new Date().toISOString(),
    checks,
  }, { headers: { "cache-control": "no-store" } });
}
