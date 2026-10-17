import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/security/token-crypto";
import { exchangeGoogleCode, fetchGoogleProfile } from "@/lib/google/oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const jar = await cookies();
  const intent = jar.get("google_auth_intent")?.value;
  const isAuthentication = intent === "signin" || intent === "signup";
  const url = new URL(isAuthentication ? "/auth" : "/integrations", request.url);
  const expectedState = jar.get("google_oauth_state")?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");

  const clearState = (response: NextResponse) => {
    response.cookies.set("google_oauth_state", "", { path: "/", maxAge: 0 });
    response.cookies.set("google_auth_intent", "", { path: "/", maxAge: 0 });
    return response;
  };

  if (providerError) {
    url.searchParams.set("error", "google_consent_cancelled");
    return clearState(NextResponse.redirect(url));
  }
  if (!state || !expectedState || state !== expectedState || !code) {
    url.searchParams.set("error", "invalid_oauth_state");
    return clearState(NextResponse.redirect(url));
  }

  try {
    const tokens = await exchangeGoogleCode(code);
    const profile = await fetchGoogleProfile(tokens.accessToken);
    const email = profile.email.toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (isAuthentication && intent === "signin" && !existingUser) {
      url.searchParams.set("error", "account_not_found");
      return clearState(NextResponse.redirect(url));
    }
    if (isAuthentication && intent === "signup" && existingUser) {
      url.searchParams.set("error", "account_exists");
      return clearState(NextResponse.redirect(url));
    }
    const user = existingUser
      ? await prisma.user.update({ where: { id: existingUser.id }, data: { name: profile.name, imageUrl: profile.imageUrl } })
      : await prisma.user.create({ data: { email, name: profile.name, imageUrl: profile.imageUrl } });

    if (isAuthentication) {
      await prisma.auditEvent.create({
        data: { userId: user.id, eventType: intent === "signup" ? "USER_SIGNUP" : "USER_LOGIN", actor: "USER", metadata: { provider: "GOOGLE" } }
      });
      await createSession(user);
      const response = NextResponse.redirect(new URL("/", request.url));
      return clearState(response);
    }

    const existing = await prisma.integration.findFirst({
      where: { userId: user.id, provider: "GOOGLE", providerAccountId: profile.id }
    });
    await prisma.integration.upsert({
      where: { id: existing?.id ?? "__new_google_integration__" },
      create: {
        userId: user.id,
        provider: "GOOGLE",
        providerAccountId: profile.id,
        email: profile.email.toLowerCase(),
        accessTokenEnc: encryptSecret(tokens.accessToken),
        refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        scopes: tokens.scope,
        status: "CONNECTED"
      },
      update: {
        email: profile.email.toLowerCase(),
        accessTokenEnc: encryptSecret(tokens.accessToken),
        ...(tokens.refreshToken ? { refreshTokenEnc: encryptSecret(tokens.refreshToken) } : {}),
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        scopes: tokens.scope,
        status: "CONNECTED"
      }
    });

    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        eventType: "GOOGLE_CONNECTED",
        actor: "USER",
        metadata: { email: profile.email.toLowerCase(), scopes: tokens.scope }
      }
    });
    await createSession(user);
    url.searchParams.set("connected", "google");
    return clearState(NextResponse.redirect(url));
  } catch {
    url.searchParams.set("error", "google_connection_failed");
    return clearState(NextResponse.redirect(url));
  }
}
