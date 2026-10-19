import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const updateSchema = z
  .object({
    dailyBriefingEnabled: z.boolean().optional(),
    briefingHour: z.number().int().min(0).max(23).optional(),
    defaultApprovalMode: z.enum(["AUTO", "CONFIRM", "BLOCK"]).optional(),
    automationPaused: z.boolean().optional(),
    timezone: z.string().trim().min(1).max(100).refine((value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Enter a valid IANA timezone.").optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Provide at least one preference.");
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to view preferences." }, { status: 401 });
  const preferences = await prisma.userPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
    select: {
      dailyBriefingEnabled: true,
      briefingHour: true,
      defaultApprovalMode: true,
      automationPaused: true,
      updatedAt: true,
    },
  });
  return NextResponse.json(
    { preferences: { ...preferences, timezone: user.timezone } },
    { headers: { "cache-control": "no-store" } },
  );
}
export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to update preferences." }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid preference values.", details: parsed.error.flatten() },
      { status: 400 },
    );
  const { timezone, ...preferenceData } = parsed.data;
  const preferences = await prisma.userPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...preferenceData },
    update: preferenceData,
    select: {
      dailyBriefingEnabled: true,
      briefingHour: true,
      defaultApprovalMode: true,
      automationPaused: true,
      updatedAt: true,
    },
  });
  const updatedUser = timezone
    ? await prisma.user.update({ where: { id: user.id }, data: { timezone }, select: { timezone: true } })
    : { timezone: user.timezone };
  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      eventType: "PREFERENCES_UPDATED",
      actor: "USER",
      metadata: parsed.data,
    },
  });
  return NextResponse.json(
    { preferences: { ...preferences, timezone: updatedUser.timezone } },
    { headers: { "cache-control": "no-store" } },
  );
}
