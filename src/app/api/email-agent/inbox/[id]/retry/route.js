import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request, context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in before retrying this email." }, { status: 401 });
  const { id } = await context.params;
  const inbound = await prisma.inboundEmail.findFirst({ where: { id, userId: user.id } });
  if (!inbound) return NextResponse.json({ error: "Inbound email was not found." }, { status: 404 });
  if (inbound.status !== "FAILED") {
    return NextResponse.json({ error: "Only messages that exhausted automatic retries can be restarted manually." }, { status: 409 });
  }
  const reset = await prisma.inboundEmail.updateMany({
    where: { id, userId: user.id, status: "FAILED" },
    data: { status: "RECEIVED", processingAttempts: 0, nextAttemptAt: null, processedAt: null, lastError: null },
  });
  if (!reset.count) return NextResponse.json({ error: "This message was updated concurrently. Refresh the inbox." }, { status: 409 });
  await prisma.auditEvent.create({
    data: { userId: user.id, eventType: "EMAIL_AGENT_MESSAGE_RETRY_REQUESTED", actor: "USER", resourceId: id },
  });
  return NextResponse.json({ success: true, status: "RECEIVED" }, { headers: { "cache-control": "no-store" } });
}
