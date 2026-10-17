import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export const runtime = "nodejs";

const signupSchema = z.object({
  name: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128)
});

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "invalid_request" }, { status: 415 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }

  let input: z.infer<typeof signupSchema>;
  try {
    input = signupSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "account_exists", message: "An account with this email already exists. Sign in or use Google if that account was created with Google." }, { status: 409 });
  }

  try {
    const user = await prisma.user.create({
      data: {
        email,
        name: input.name?.trim() || null,
        passwordHash: await hashPassword(input.password),
        preferences: { create: {} }
      },
      select: { id: true, email: true, name: true, imageUrl: true, timezone: true }
    });
    await prisma.auditEvent.create({
      data: { userId: user.id, eventType: "USER_SIGNUP", actor: "USER", metadata: { provider: "CREDENTIALS" } }
    });
    await createSession(user);
    return NextResponse.json({ ok: true, user }, {
      status: 201,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "account_exists", message: "An account with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "signup_failed", message: "We couldn't create your account. Please try again." }, { status: 500 });
  }
}
