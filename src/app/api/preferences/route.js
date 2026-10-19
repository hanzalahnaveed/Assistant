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
  return NextResponse.json({ preferences }, { headers: { "cache-control": "no-store" } });
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
  const preferences = await prisma.userPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...parsed.data },
    update: parsed.data,
    select: {
      dailyBriefingEnabled: true,
      briefingHour: true,
      defaultApprovalMode: true,
      updatedAt: true,
    },
  });
  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      eventType: "PREFERENCES_UPDATED",
      actor: "USER",
      metadata: parsed.data,
    },
  });
  return NextResponse.json({ preferences }, { headers: { "cache-control": "no-store" } });
}
