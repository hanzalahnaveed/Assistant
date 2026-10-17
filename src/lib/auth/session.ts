import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "assistant_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function secretKey(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters.");
  }
  return secret;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function sign(unsignedToken: string): string {
  return createHmac("sha256", secretKey()).update(unsignedToken).digest("base64url");
}

function createToken(user: { id: string; email: string; name: string | null }): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    sub: user.id,
    email: user.email,
    name: user.name,
    iat: now,
    exp: now + SESSION_SECONDS
  }));
  const unsignedToken = `${header}.${payload}`;
  return `${unsignedToken}.${sign(unsignedToken)}`;
}

function verifyToken(token: string): { sub: string; email: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerPart, payloadPart, signaturePart] = parts;
  const unsignedToken = `${headerPart}.${payloadPart}`;
  const expectedSignature = Buffer.from(sign(unsignedToken), "base64url");
  const actualSignature = Buffer.from(signaturePart, "base64url");

  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) return null;

  try {
    const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")) as {
      alg?: string;
      typ?: string;
    };
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as {
      sub?: unknown;
      email?: unknown;
      exp?: unknown;
    };

    if (
      header.alg !== "HS256" ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) return null;

    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export async function createSession(user: { id: string; email: string; name: string | null }) {
  const token = createToken(user);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}

export async function getSessionUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const payload = verifyToken(token);
    if (!payload) return null;

    return await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, imageUrl: true, timezone: true }
    });
  } catch {
    return null;
  }
}
