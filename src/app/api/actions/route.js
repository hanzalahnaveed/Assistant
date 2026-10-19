import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createTaskActionProposal } from "@/lib/actions/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const proposalSchema = z.object({
  actionType: z.literal("CREATE_TASK"),
  idempotencyKey: z.string().trim().min(8).max(128),
  input: z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional().nullable(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
    dueAt: z.string().datetime().optional().nullable(),
    source: z.enum(["EMAIL", "MEETING"]).optional(),
    sourceRef: z.string().trim().min(1).max(300).optional().nullable(),
  }),
});
export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Sign in to view proposed actions." }, { status: 401 });
  const actions = await prisma.actionRecord.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      actionType: true,
      status: true,
      input: true,
      result: true,
      requiresApproval: true,
      approvedAt: true,
      startedAt: true,
      completedAt: true,
      errorCode: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ actions }, { headers: { "cache-control": "no-store" } });
}
export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to propose an action." }, { status: 401 });
  const parsed = proposalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      {
        error: "Provide a valid task proposal and an idempotency key.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  try {
    const result = await createTaskActionProposal(
      user.id,
      parsed.data.idempotencyKey,
      parsed.data.input,
    );
    return NextResponse.json(result, {
      status: result.reused ? 200 : 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ActionBlockedError") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
