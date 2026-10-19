import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to export your data." }, { status: 401 });
  }

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      imageUrl: true,
      timezone: true,
      createdAt: true,
      updatedAt: true,
      preferences: {
        select: {
          dailyBriefingEnabled: true,
          briefingHour: true,
          defaultApprovalMode: true,
          automationPaused: true,
          preferencesJson: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      integrations: {
        select: {
          provider: true,
          providerAccountId: true,
          email: true,
          scopes: true,
          lastSyncedAt: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      tasks: { orderBy: { createdAt: "desc" } },
      conversations: {
        orderBy: { updatedAt: "desc" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      },
      automationRules: { orderBy: { updatedAt: "desc" } },
      actions: { orderBy: { createdAt: "desc" } },
      auditEvents: { orderBy: { createdAt: "desc" } },
      dailyBriefings: { orderBy: { generatedAt: "desc" } },
      notifications: { orderBy: { createdAt: "desc" } },
      emailDrafts: { orderBy: { createdAt: "desc" } },
      meetingDrafts: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const exportedAt = new Date();
  const filenameDate = exportedAt.toISOString().slice(0, 10);
  return NextResponse.json(
    {
      formatVersion: 1,
      exportedAt: exportedAt.toISOString(),
      account,
    },
    {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="assistant-data-export-${filenameDate}.json"`,
        "x-content-type-options": "nosniff",
      },
    },
  );
}
