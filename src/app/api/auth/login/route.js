import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request) {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    return NextResponse.json(
      {
        error: "server_misconfigured",
        message:
          "Authentication is not configured on the server. Set AUTH_SECRET to a random value at least 32 characters long, then restart or redeploy the app.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "invalid_request", message: "Please submit the form again." },
      { status: 415, headers: { "cache-control": "no-store" } },
    );
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json(
      { error: "invalid_request", message: "The request could not be verified. Refresh the page and try again." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  let input;
  try {
    input = loginSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "invalid_credentials", message: "Enter a valid email address and password." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      select: {
        id: true,
        email: true,
        name: true,
        imageUrl: true,
        timezone: true,
        passwordHash: true,
      },
    });

    const valid = user?.passwordHash
      ? await verifyPassword(input.password, user.passwordHash)
      : false;

    if (!user || !valid) {
      return NextResponse.json(
        {
          error: "invalid_credentials",
          message:
            "Email or password is incorrect. If you created your account with Google, continue with Google.",
        },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }

    await createSession(user);

    // Audit logging should not prevent a valid user from signing in.
    try {
      await prisma.auditEvent.create({
        data: {
          userId: user.id,
          eventType: "USER_LOGIN",
          actor: "USER",
          metadata: { provider: "CREDENTIALS" },
        },
      });
    } catch (auditError) {
      console.error("[auth/login] Audit event could not be recorded:", auditError);
    }

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return NextResponse.json(
      { ok: true, user: safeUser },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "[auth/login] Sign-in failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      {
        error: "login_failed",
        message: "We couldn't complete sign-in because of a server problem. Please try again shortly.",
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
