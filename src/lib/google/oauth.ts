import "server-only";
import { randomBytes } from "node:crypto";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly"
];

export function googleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.");
  }
  return { clientId, clientSecret, redirectUri };
}

export function createOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function googleAuthorizationUrl(state: string, scopes: string[] = GOOGLE_SCOPES) {
  const { clientId, redirectUri } = googleOAuthConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleCode(code: string) {
  const { clientId, clientSecret, redirectUri } = googleOAuthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    }),
    cache: "no-store"
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error("Google authorization code exchange failed.");
  }
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : 3600,
    scope: typeof body.scope === "string" ? body.scope.split(" ") : GOOGLE_SCOPES
  };
}

export async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Unable to verify the Google account profile.");
  const profile = await response.json() as {
    id?: string; email?: string; verified_email?: boolean; name?: string; picture?: string;
  };
  if (!profile.id || !profile.email || profile.verified_email !== true) {
    throw new Error("Google did not return a verified email address.");
  }
  return { id: profile.id, email: profile.email, name: profile.name ?? null, imageUrl: profile.picture ?? null };
}
