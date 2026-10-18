import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/security/token-crypto";
export const runtime = "nodejs";
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const integrations = await prisma.integration.findMany({
    where: { userId: user.id, provider: "GOOGLE" },
    select: { id: true, accessTokenEnc: true, refreshTokenEnc: true },
  });
  for (const integration of integrations) {
    const token = integration.refreshTokenEnc ?? integration.accessTokenEnc;
    if (token) {
      try {
        const rawToken = decryptSecret(token);
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rawToken)}`, {
          method: "POST",
          cache: "no-store",
        });
      } catch {
        // Revoke best-effort; local credentials are still removed below.
      }
    }
  }
  await prisma.integration.deleteMany({ where: { userId: user.id, provider: "GOOGLE" } });
  await prisma.auditEvent.create({
    data: { userId: user.id, eventType: "GOOGLE_DISCONNECTED", actor: "USER" },
  });
  return NextResponse.json({ ok: true });
}
