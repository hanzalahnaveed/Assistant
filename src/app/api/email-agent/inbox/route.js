import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to view inbound email activity." }, { status: 401 });
  const messages = await prisma.inboundEmail.findMany({
    where: { userId: user.id },
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      gmailMessageId: true,
      gmailThreadId: true,
      fromEmail: true,
      subject: true,
      receivedAt: true,
      status: true,
      category: true,
      sensitive: true,
      summary: true,
      classification: true,
      draftId: true,
      processedAt: true,
      lastError: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ messages }, { headers: { "cache-control": "no-store" } });
}
