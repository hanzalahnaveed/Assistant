import { NextResponse } from "next/server";
import { clearSession, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (user) {
    await prisma.auditEvent.create({
      data: { userId: user.id, eventType: "USER_LOGOUT", actor: "USER" }
    }).catch(() => undefined);
  }
  await clearSession();
  return NextResponse.json({ ok: true }, {
    headers: { "cache-control": "no-store" }
  });
}
