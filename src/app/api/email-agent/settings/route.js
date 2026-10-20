import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  getEmailAgentSettings,
} from "@/lib/email-agent/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  autoReplyEnabled: z.boolean().optional(),
  tone: z.enum(["professional", "warm", "direct", "formal", "friendly"]).optional(),
  style: z.enum(["concise", "detailed", "bullet_points"]).optional(),
  signature: z.string().max(2000).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one email-agent setting.");

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to view email-agent settings." }, { status: 401 });
  const preferences = await prisma.userPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
    select: { preferencesJson: true, automationPaused: true, updatedAt: true },
  });
  return NextResponse.json({
    settings: getEmailAgentSettings(preferences.preferencesJson),
    automationPaused: preferences.automationPaused,
    updatedAt: preferences.updatedAt,
  }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to update email-agent settings." }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email-agent settings.", details: parsed.error.flatten() }, { status: 400 });
  }
  const current = await prisma.userPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
    select: { preferencesJson: true, automationPaused: true },
  });
  const root = asObject(current.preferencesJson);
  const saved = getEmailAgentSettings(root);
  const settings = { ...saved, ...parsed.data };
  const now = new Date().toISOString();
  if (parsed.data.enabled === true && !saved.enabled) settings.enabledAt = now;
  if (parsed.data.enabled === false) {
    settings.enabledAt = null;
    settings.autoReplyEnabledAt = null;
  }
  if (parsed.data.autoReplyEnabled === true && !saved.autoReplyEnabled) settings.autoReplyEnabledAt = now;
  if (parsed.data.autoReplyEnabled === false) settings.autoReplyEnabledAt = null;
  if (settings.autoReplyEnabled && !settings.enabled) {
    return NextResponse.json({
      error: "Enable the email agent before enabling automatic replies.",
    }, { status: 400 });
  }
  const preferencesJson = { ...root, emailAgent: settings };
  await prisma.userPreference.update({
    where: { userId: user.id },
    data: { preferencesJson },
  });
  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      eventType: "EMAIL_AGENT_SETTINGS_UPDATED",
      actor: "USER",
      metadata: {
        enabled: settings.enabled,
        autoReplyEnabled: settings.autoReplyEnabled,
        tone: settings.tone,
        style: settings.style,
      },
    },
  });
  return NextResponse.json({
    settings,
    automationPaused: current.automationPaused,
  }, { headers: { "cache-control": "no-store" } });
}
