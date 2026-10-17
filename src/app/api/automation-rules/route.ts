import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  actionType: z.literal("CREATE_TASK"),
  name: z.string().trim().min(1).max(100).default("Task creation"),
  mode: z.enum(["AUTO", "CONFIRM", "BLOCK"]),
  enabled: z.boolean().default(true)
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage automation rules." }, { status: 401 });
  const [rules, preferences] = await Promise.all([
    prisma.automationRule.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.userPreference.upsert({
      where: { userId: user.id }, create: { userId: user.id }, update: {},
      select: { defaultApprovalMode: true }
    })
  ]);
  return NextResponse.json({ rules, defaultApprovalMode: preferences.defaultApprovalMode }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage automation rules." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid automation rule.", details: parsed.error.flatten() }, { status: 400 });

  const rule = await prisma.$transaction(async tx => {
    if (parsed.data.enabled) {
      await tx.automationRule.updateMany({
        where: { userId: user.id, actionType: parsed.data.actionType, enabled: true },
        data: { enabled: false }
      });
    }
    const created = await tx.automationRule.create({
      data: { userId: user.id, ...parsed.data, conditions: {} }
    });
    await tx.auditEvent.create({
      data: { userId: user.id, eventType: "AUTOMATION_RULE_CREATED", actor: "USER", resourceId: created.id, metadata: { actionType: created.actionType, mode: created.mode, enabled: created.enabled } }
    });
    return created;
  });
  return NextResponse.json({ rule }, { status: 201, headers: { "cache-control": "no-store" } });
}
