import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const updateSchema = z.object({ status: z.enum(["OPEN", "DISMISSED"]) });

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage follow-ups." }, { status: 401 });
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose open or dismissed status." }, { status: 400 });
  const existing = await prisma.followUp.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Follow-up not found." }, { status: 404 });
  const followUp = await prisma.$transaction(async (tx) => {
    const updated = await tx.followUp.update({ where: { id: existing.id }, data: { status: parsed.data.status } });
    await tx.auditEvent.create({
      data: {
        userId: user.id,
        eventType: parsed.data.status === "DISMISSED" ? "FOLLOW_UP_DISMISSED" : "FOLLOW_UP_RESTORED",
        actor: "USER",
        resourceId: existing.id,
        metadata: { sourceType: existing.sourceType, sourceId: existing.sourceId },
      },
    });
    return updated;
  });
  return NextResponse.json({ followUp }, { headers: { "cache-control": "no-store" } });
}
