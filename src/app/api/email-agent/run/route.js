import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getEmailAgentSettings, processInboundEmailForUser } from "@/lib/email-agent/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Authenticated, single-account worker for local development and manual testing.
// Production scheduling uses /api/cron/email-agent with CRON_SECRET.
export async function POST() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Sign in to run the email agent." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      email: true,
      timezone: true,
      preferences: {
        select: { preferencesJson: true, automationPaused: true },
      },
      integrations: {
        where: { provider: "GOOGLE", status: "CONNECTED" },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { id: true, scopes: true, status: true, email: true },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "Account not found. Sign in again." }, { status: 401 });

  const settings = getEmailAgentSettings(user.preferences?.preferencesJson);
  if (!settings.enabled) {
    return NextResponse.json({
      error: "The email agent is disabled. Enable it and save settings before running the inbox check.",
    }, { status: 400 });
  }
  const integration = user.integrations[0];
  if (!integration) {
    return NextResponse.json({
      error: "No connected Google account was found. Reconnect Google in Integrations first.",
    }, { status: 400 });
  }

  try {
    const result = await processInboundEmailForUser(user, integration, settings);
    return NextResponse.json({
      ok: result.failed === 0,
      runAt: new Date().toISOString(),
      ...result,
      // Never return message bodies or credentials from the worker.
    }, {
      status: result.failed ? 207 : 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 300) : "Email agent run failed.",
    }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
