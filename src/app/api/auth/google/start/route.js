import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createOAuthState, googleAuthorizationUrl } from "@/lib/google/oauth";

export const runtime = "nodejs";

const IDENTITY_SCOPES = ["openid", "email", "profile"];

export async function GET(request) {
  const intent = request.nextUrl.searchParams.get("intent");
  const isAuthentication = intent === "signin" || intent === "signup";

  if (!isAuthentication) {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.redirect(new URL("/auth?error=sign_in_required", request.url));
    }
  }

  try {
    const state = createOAuthState();
    const response = NextResponse.redirect(
      googleAuthorizationUrl(state, isAuthentication ? IDENTITY_SCOPES : undefined),
    );
    response.cookies.set("google_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    response.cookies.set("google_auth_intent", isAuthentication ? intent : "connect", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch {
    const destination = isAuthentication
      ? "/auth?error=google_not_configured"
      : "/integrations?error=google_not_configured";
    return NextResponse.redirect(
      new URL(destination, process.env.APP_URL ?? "http://localhost:3000"),
    );
  }
}
