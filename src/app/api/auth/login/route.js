import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
export const runtime = "nodejs";
const loginSchema = z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(128)
});
export async function POST(request) {
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
        return NextResponse.json({ error: "invalid_request" }, { status: 415 });
    }
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) {
        return NextResponse.json({ error: "invalid_request" }, { status: 403 });
    }
    let input;
    try {
        input = loginSchema.parse(await request.json());
    }
    catch {
        return NextResponse.json({ error: "invalid_credentials", message: "Email or password is incorrect." }, { status: 400 });
    }
    const user = await prisma.user.findUnique({
        where: { email: input.email.toLowerCase() },
        select: { id: true, email: true, name: true, imageUrl: true, timezone: true, passwordHash: true }
    });
    const valid = user?.passwordHash ? await verifyPassword(input.password, user.passwordHash) : false;
    if (!user || !valid) {
        return NextResponse.json({ error: "invalid_credentials", message: "Email or password is incorrect. If you created your account with Google, continue with Google." }, { status: 401 });
    }
    await prisma.auditEvent.create({
        data: { userId: user.id, eventType: "USER_LOGIN", actor: "USER", metadata: { provider: "CREDENTIALS" } }
    });
    await createSession(user);
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return NextResponse.json({ ok: true, user: safeUser }, {
        headers: { "cache-control": "no-store" }
    });
}
