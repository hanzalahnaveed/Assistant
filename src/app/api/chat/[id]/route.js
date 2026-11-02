import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
export const runtime = "nodejs";
export async function GET(_request, context) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const { id } = await context.params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      messages: {
        orderBy: { createdAt: "asc" },
        take: 100,
        select: { id: true, role: true, content: true, metadata: true, createdAt: true },
      },
    },
  });
  if (!conversation)
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  return NextResponse.json({ conversation }, { headers: { "cache-control": "no-store" } });
}


const renameSchema = z.object({
  title: z.string().trim().min(1).max(100),
});

export async function PATCH(request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to rename conversations." }, { status: 401 });
  const { id } = await context.params;
  const parsed = renameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Conversation titles must be between 1 and 100 characters." }, { status: 400 });

  const result = await prisma.conversation.updateMany({
    where: { id, userId: user.id },
    data: { title: parsed.data.title },
  });
  if (!result.count) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: user.id },
    select: { id: true, title: true, updatedAt: true },
  });
  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      eventType: "AI_CONVERSATION_RENAMED",
      actor: "USER",
      resourceId: id,
      metadata: { title: parsed.data.title },
    },
  });
  return NextResponse.json({ conversation }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to delete conversations." }, { status: 401 });
  const { id } = await context.params;

  const deleted = await prisma.$transaction(async (tx) => {
    const existing = await tx.conversation.findFirst({
      where: { id, userId: user.id },
      select: { id: true, title: true },
    });
    if (!existing) return false;
    await tx.conversation.delete({ where: { id: existing.id } });
    await tx.auditEvent.create({
      data: {
        userId: user.id,
        eventType: "AI_CONVERSATION_DELETED",
        actor: "USER",
        resourceId: id,
        metadata: { title: existing.title || "" },
      },
    });
    return true;
  });

  if (!deleted) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
