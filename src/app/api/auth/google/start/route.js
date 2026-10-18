import { NextResponse } from "next/server";
import { createOAuthState, googleAuthorizationUrl } from "@/lib/google/oauth";
export const runtime = "nodejs";
const IDENTITY_SCOPES = ["openid", "email", "profile"];
export async function GET(request) {
    const intent = request.nextUrl.searchParams.get("intent");
    const isAuthentication = intent === "signin" || intent === "signup";
    try {
        const state = createOAuthState();
        const response = NextResponse.redirect(googleAuthorizationUrl(state, isAuthentication ? IDENTITY_SCOPES : undefined));
        response.cookies.set("google_oauth_state", state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 600
        });
        if (isAuthentication) {
            response.cookies.set("google_auth_intent", intent, {
                httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600
            });
        }
        else {
            response.cookies.set("google_auth_intent", "", { path: "/", maxAge: 0 });
        }
        return response;
    }
    catch {
        const destination = isAuthentication ? "/auth?error=google_not_configured" : "/integrations?error=google_not_configured";
        return NextResponse.redirect(new URL(destination, process.env.APP_URL ?? "http://localhost:3000"));
    }
}
