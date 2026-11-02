import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const readSchema = z.object({
  notificationId: z.string().min(1).optional(),
  briefingId: z.string().min(1).optional(),
  markAllRead: z.boolean().optional(),
}).refine(
  (value) => Number(Boolean(value.notificationId)) + Number(Boolean(value.briefingId)) + Number(value.markAllRead === true) === 1,
  "Choose one notification, one briefing, or mark all as read.",
);

const deleteSchema = z.object({
  notificationId: z.string().min(1).optional(),
  briefingId: z.string().min(1).optional(),
  clearRead: z.boolean().optional(),
}).refine(
  (value) => Number(Boolean(value.notificationId)) + Number(Boolean(value.briefingId)) + Number(value.clearRead === true) === 1,
  "Choose one notification, one briefing, or clear read items.",
);

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to view notifications." }, { status: 401 });
  const [notifications, briefings, unreadNotifications, unreadBriefings] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, type: true, title: true, body: true, payload: true, readAt: true, createdAt: true },
    }),
    prisma.dailyBriefing.findMany({
      where: { userId: user.id },
      orderBy: { generatedAt: "desc" },
      take: 7,
      select: { id: true, localDate: true, timezone: true, summary: true, content: true, generatedAt: true, readAt: true },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.dailyBriefing.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return NextResponse.json(
    { notifications, briefings, unreadCount: unreadNotifications, unreadBriefingCount: unreadBriefings },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PATCH(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to update notifications." }, { status: 401 });
  const parsed = readSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid notification update.", details: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.markAllRead) {
    await prisma.$transaction([
      prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } }),
      prisma.dailyBriefing.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } }),
    ]);
  } else if (parsed.data.notificationId) {
    const result = await prisma.notification.updateMany({
      where: { id: parsed.data.notificationId, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (!result.count) {
      const exists = await prisma.notification.findFirst({ where: { id: parsed.data.notificationId, userId: user.id }, select: { id: true } });
      if (!exists) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }
  } else if (parsed.data.briefingId) {
    const result = await prisma.dailyBriefing.updateMany({
      where: { id: parsed.data.briefingId, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (!result.count) {
      const exists = await prisma.dailyBriefing.findFirst({ where: { id: parsed.data.briefingId, userId: user.id }, select: { id: true } });
      if (!exists) return NextResponse.json({ error: "Briefing not found." }, { status: 404 });
    }
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to delete notifications." }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a notification, briefing, or clear read items.", details: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.notificationId) {
    const result = await prisma.notification.deleteMany({ where: { id: parsed.data.notificationId, userId: user.id } });
    if (!result.count) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  }
  if (parsed.data.briefingId) {
    const result = await prisma.dailyBriefing.deleteMany({ where: { id: parsed.data.briefingId, userId: user.id } });
    if (!result.count) return NextResponse.json({ error: "Briefing not found." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  }

  const [notifications, briefings] = await prisma.$transaction([
    prisma.notification.deleteMany({ where: { userId: user.id, readAt: { not: null } } }),
    prisma.dailyBriefing.deleteMany({ where: { userId: user.id, readAt: { not: null } } }),
  ]);
  return NextResponse.json({ deletedNotifications: notifications.count, deletedBriefings: briefings.count });
}
