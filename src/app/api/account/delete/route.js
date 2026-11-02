import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, clearSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { decryptSecret } from "@/lib/security/token-crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().max(128).optional().default(""),
  confirmation: z.literal("DELETE MY ACCOUNT"),
});

async function revokeGoogleAccess(userId) {
  const integrations = await prisma.integration.findMany({
    where: { userId, provider: "GOOGLE" },
    select: { accessTokenEnc: true, refreshTokenEnc: true },
  });
  for (const integration of integrations) {
    const encrypted = integration.refreshTokenEnc || integration.accessTokenEnc;
    if (!encrypted) continue;
    try {
      const token = decryptSecret(encrypted);
      await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(token), {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Provider revocation is best-effort; local account deletion remains authoritative.
    }
  }
}

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "The request could not be verified." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Submit the account deletion request again." }, { status: 415 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in before deleting your account." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "Enter your account email and the exact confirmation phrase." }, { status: 400 });
  }
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (!account.passwordHash) {
    return NextResponse.json({
      code: "GOOGLE_REAUTH_REQUIRED",
      error: "Verify your Google identity to delete this account.",
    }, { status: 409 });
  }
  if (!parsed.data.password || !(await verifyPassword(parsed.data.password, account.passwordHash))) {
    return NextResponse.json({ error: "The current password is incorrect." }, { status: 401 });
  }
  await revokeGoogleAccess(user.id);
  await prisma.user.delete({ where: { id: user.id } });
  await clearSession();
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
