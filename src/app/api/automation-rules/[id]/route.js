import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const updateSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    mode: z.enum(["AUTO", "CONFIRM", "BLOCK"]).optional(),
    enabled: z.boolean().optional()
}).refine(value => Object.keys(value).length > 0, "Provide a rule change.");
export async function PATCH(request, context) {
    const user = await getSessionUser();
    if (!user)
        return NextResponse.json({ error: "Sign in to manage automation rules." }, { status: 401 });
    const { id } = await context.params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
        return NextResponse.json({ error: "Invalid rule settings.", details: parsed.error.flatten() }, { status: 400 });
    const existing = await prisma.automationRule.findFirst({ where: { id, userId: user.id } });
    if (!existing)
        return NextResponse.json({ error: "Automation rule not found." }, { status: 404 });
    const rule = await prisma.$transaction(async (tx) => {
        if (parsed.data.enabled) {
            await tx.automationRule.updateMany({
                where: { userId: user.id, actionType: existing.actionType, enabled: true, id: { not: id } },
                data: { enabled: false }
            });
        }
        const updated = await tx.automationRule.update({ where: { id }, data: parsed.data });
        await tx.auditEvent.create({
            data: { userId: user.id, eventType: "AUTOMATION_RULE_UPDATED", actor: "USER", resourceId: id, metadata: parsed.data }
        });
        return updated;
    });
    return NextResponse.json({ rule }, { headers: { "cache-control": "no-store" } });
}
export async function DELETE(_request, context) {
    const user = await getSessionUser();
    if (!user)
        return NextResponse.json({ error: "Sign in to manage automation rules." }, { status: 401 });
    const { id } = await context.params;
    const existing = await prisma.automationRule.findFirst({ where: { id, userId: user.id } });
    if (!existing)
        return NextResponse.json({ error: "Automation rule not found." }, { status: 404 });
    await prisma.$transaction(async (tx) => {
        await tx.automationRule.delete({ where: { id } });
        await tx.auditEvent.create({
            data: { userId: user.id, eventType: "AUTOMATION_RULE_DELETED", actor: "USER", resourceId: id, metadata: { actionType: existing.actionType } }
        });
    });
    return NextResponse.json({ success: true });
}
