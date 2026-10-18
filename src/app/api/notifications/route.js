import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const readSchema = z
  .object({
    notificationId: z.string().min(1).optional(),
    markAllRead: z.boolean().optional(),
  })
  .refine(
    (value) => Boolean(value.notificationId) || value.markAllRead === true,
    "Choose a notification or mark all as read.",
  );
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to view notifications." }, { status: 401 });
  const [notifications, briefings, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        payload: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.dailyBriefing.findMany({
      where: { userId: user.id },
      orderBy: { generatedAt: "desc" },
      take: 7,
      select: {
        id: true,
        localDate: true,
        timezone: true,
        summary: true,
        content: true,
        generatedAt: true,
        readAt: true,
      },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return NextResponse.json(
    { notifications, briefings, unreadCount },
    { headers: { "cache-control": "no-store" } },
  );
}
export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Sign in to update notifications." }, { status: 401 });
  const parsed = readSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid notification update.", details: parsed.error.flatten() },
      { status: 400 },
    );
  if (parsed.data.markAllRead) {
    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    await prisma.dailyBriefing.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  } else if (parsed.data.notificationId) {
    const result = await prisma.notification.updateMany({
      where: { id: parsed.data.notificationId, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await prisma.notification.findFirst({
        where: { id: parsed.data.notificationId, userId: user.id },
        select: { id: true },
      });
      if (!exists) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
