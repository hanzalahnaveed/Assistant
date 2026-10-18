import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
export const runtime = "nodejs";
const updateTaskSchema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    dueAt: z.string().datetime().nullable().optional()
}).refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update." });
export async function PATCH(request, context) {
    const user = await getSessionUser();
    if (!user)
        return NextResponse.json({ error: "Connect Google Workspace to sign in." }, { status: 401 });
    const { id } = await context.params;
    const parsed = updateTaskSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
        return NextResponse.json({ error: "Invalid task update.", details: parsed.error.flatten() }, { status: 400 });
    const existing = await prisma.task.findFirst({ where: { id, userId: user.id } });
    if (!existing)
        return NextResponse.json({ error: "Task not found." }, { status: 404 });
    const data = {
        ...parsed.data,
        ...(parsed.data.dueAt !== undefined ? { dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null } : {}),
        ...(parsed.data.status === "DONE" ? { completedAt: existing.completedAt ?? new Date() } : {}),
        ...(parsed.data.status && parsed.data.status !== "DONE" ? { completedAt: null } : {})
    };
    const task = await prisma.task.update({ where: { id }, data });
    await prisma.auditEvent.create({
        data: { userId: user.id, eventType: "TASK_UPDATED", actor: "USER", resourceId: task.id, metadata: { fields: Object.keys(parsed.data) } }
    });
    return NextResponse.json({ task }, { headers: { "cache-control": "no-store" } });
}
export async function DELETE(_request, context) {
    const user = await getSessionUser();
    if (!user)
        return NextResponse.json({ error: "Connect Google Workspace to sign in." }, { status: 401 });
    const { id } = await context.params;
    const existing = await prisma.task.findFirst({ where: { id, userId: user.id } });
    if (!existing)
        return NextResponse.json({ error: "Task not found." }, { status: 404 });
    // Soft-cancel tasks so the user's audit history remains intact.
    await prisma.task.update({ where: { id }, data: { status: "CANCELLED" } });
    await prisma.auditEvent.create({
        data: { userId: user.id, eventType: "TASK_CANCELLED", actor: "USER", resourceId: id }
    });
    return NextResponse.json({ success: true });
}
