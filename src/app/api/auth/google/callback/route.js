import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionUser, createSession } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/security/token-crypto";
import { exchangeGoogleCode, fetchGoogleProfile } from "@/lib/google/oauth";

export const runtime = "nodejs";

export async function GET(request) {
  const jar = await cookies();
  const intent = jar.get("google_auth_intent")?.value;
  const isAuthentication = intent === "signin" || intent === "signup";
  const isConnection = intent === "connect";
  const url = new URL(isAuthentication ? "/auth" : "/integrations", request.url);
  const expectedState = jar.get("google_oauth_state")?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");

  const clearState = (response) => {
    response.cookies.set("google_oauth_state", "", { path: "/", maxAge: 0 });
    response.cookies.set("google_auth_intent", "", { path: "/", maxAge: 0 });
    return response;
  };
  const redirectError = (destination, error) => {
    const target = new URL(destination, request.url);
    target.searchParams.set("error", error);
    return clearState(NextResponse.redirect(target));
  };

  if (providerError) {
    return redirectError(isAuthentication ? "/auth" : "/integrations", "google_consent_cancelled");
<<<<<<< HEAD
=======
  }
<<<<<<< HEAD
  if (!isAuthentication && !isConnection) {
    return redirectError("/integrations", "invalid_oauth_intent");
>>>>>>> d271763 (fix: link Google Workspace to the active user account)
  }
  if (!state || !expectedState || state !== expectedState || !code) {
    return redirectError(isAuthentication ? "/auth" : "/integrations", "invalid_oauth_state");
  }
<<<<<<< HEAD
  if (!isAuthentication && !isConnection) {
    return redirectError("/integrations", "invalid_oauth_intent");
  }
=======
>>>>>>> d271763 (fix: link Google Workspace to the active user account)
=======
  if (!state || !expectedState || state !== expectedState || !code) {
    return redirectError(isAuthentication ? "/auth" : "/integrations", "invalid_oauth_state");
  }
  if (!isAuthentication && !isConnection) {
    return redirectError("/integrations", "invalid_oauth_intent");
  }
>>>>>>> 0caa0c0 (fix: preserve refresh tokens only for the same Google account)

  try {
    const tokens = await exchangeGoogleCode(code);
    const profile = await fetchGoogleProfile(tokens.accessToken);
    const email = profile.email.toLowerCase();

    if (isConnection) {
      const user = await getSessionUser();
      if (!user) return redirectError("/auth", "sign_in_required");

      const linkedAccount = await prisma.integration.findFirst({
        where: { provider: "GOOGLE", providerAccountId: profile.id },
        select: { userId: true },
      });
      if (linkedAccount && linkedAccount.userId !== user.id) {
        return redirectError("/integrations", "google_account_already_linked");
      }

      const existingIntegration = await prisma.integration.findFirst({
        where: { userId: user.id, provider: "GOOGLE" },
      });
      const integrationData = {
        provider: "GOOGLE",
        providerAccountId: profile.id,
        email,
        accessTokenEnc: encryptSecret(tokens.accessToken),
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 0caa0c0 (fix: preserve refresh tokens only for the same Google account)
        ...(tokens.refreshToken
          ? { refreshTokenEnc: encryptSecret(tokens.refreshToken) }
          : existingIntegration?.providerAccountId === profile.id
            ? {}
            : { refreshTokenEnc: null }),
<<<<<<< HEAD
=======
        ...(tokens.refreshToken ? { refreshTokenEnc: encryptSecret(tokens.refreshToken) } : {}),
>>>>>>> d271763 (fix: link Google Workspace to the active user account)
=======
>>>>>>> 0caa0c0 (fix: preserve refresh tokens only for the same Google account)
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        scopes: tokens.scope,
        status: "CONNECTED",
      };
      if (existingIntegration) {
        await prisma.integration.update({
          where: { id: existingIntegration.id },
          data: integrationData,
        });
      } else {
        await prisma.integration.create({
          data: { userId: user.id, ...integrationData },
        });
      }
      await prisma.auditEvent.create({
        data: {
          userId: user.id,
          eventType: "GOOGLE_CONNECTED",
          actor: "USER",
          metadata: { email, scopes: tokens.scope },
        },
      });
      url.searchParams.set("connected", "google");
      return clearState(NextResponse.redirect(url));
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (intent === "signin" && !existingUser) {
      return redirectError("/auth", "account_not_found");
    }
    if (intent === "signup" && existingUser) {
      return redirectError("/auth", "account_exists");
    }

    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: { name: profile.name, imageUrl: profile.imageUrl },
        })
      : await prisma.user.create({
          data: { email, name: profile.name, imageUrl: profile.imageUrl },
        });

    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        eventType: intent === "signup" ? "USER_SIGNUP" : "USER_LOGIN",
        actor: "USER",
        metadata: { provider: "GOOGLE" },
      },
    });
    await createSession(user);
    return clearState(NextResponse.redirect(new URL("/", request.url)));
  } catch {
    return redirectError(isAuthentication ? "/auth" : "/integrations", "google_connection_failed");
  }
}
