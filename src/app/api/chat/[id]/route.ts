import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Connect Google Workspace to sign in." }, { status: 401 });
  const { id } = await context.params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true, title: true,
      messages: { orderBy: { createdAt: "asc" }, take: 100, select: { id: true, role: true, content: true, createdAt: true } }
    }
  });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  return NextResponse.json({ conversation }, { headers: { "cache-control": "no-store" } });
}
