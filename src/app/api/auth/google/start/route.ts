import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createOAuthState, googleAuthorizationUrl } from "@/lib/google/oauth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const state = createOAuthState();
    const response = NextResponse.redirect(googleAuthorizationUrl(state));
    response.cookies.set("google_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/integrations?error=google_not_configured", process.env.APP_URL ?? "http://localhost:3000"));
  }
}
