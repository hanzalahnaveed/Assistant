import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/token-crypto";
async function refreshAccessToken(refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.access_token !== "string") {
    const error = new Error(
      body.error === "invalid_grant"
        ? "Google access was revoked or expired. Reconnect your Google account."
        : "Google access token refresh failed. Please try again.",
    );
    if (body.error === "invalid_grant") error.code = "GOOGLE_REAUTH_REQUIRED";
    throw error;
  }
  return {
    accessToken: body.access_token,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : 3600,
  };
}
export async function getGoogleAccessToken(userId) {
  const integration = await prisma.integration.findFirst({
    where: { userId, provider: "GOOGLE", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
  });
  if (!integration?.accessTokenEnc) return null;
  if (integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    return { accessToken: decryptSecret(integration.accessTokenEnc), email: integration.email };
  }
  if (!integration.refreshTokenEnc) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: "REAUTH_REQUIRED" },
    });
    return null;
  }
  const refreshToken = decryptSecret(integration.refreshTokenEnc);
  let refreshed;
  try {
    refreshed = await refreshAccessToken(refreshToken);
  } catch (error) {
    if (error instanceof Error && error.code === "GOOGLE_REAUTH_REQUIRED") {
      await prisma.integration.updateMany({
        where: { id: integration.id, status: "CONNECTED" },
        data: { status: "REAUTH_REQUIRED" },
      });
    }
    throw error;
  }
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      accessTokenEnc: encryptSecret(refreshed.accessToken),
      tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
      status: "CONNECTED",
    },
  });
  return { accessToken: refreshed.accessToken, email: integration.email };
}
export async function googleApiGet(accessToken, url) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (response.status === 401)
    throw new Error("Google access was rejected. Please reconnect your account.");
  if (response.status === 403)
    throw new Error("Google has not granted the required read-only scope or API access.");
  if (!response.ok) throw new Error("Google Workspace request failed.");
  return response.json();
}
