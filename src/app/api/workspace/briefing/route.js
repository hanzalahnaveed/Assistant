import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { generateBriefingData, saveDailyBriefing } from "@/lib/briefing/service";
import { syncFollowUpCandidates } from "@/lib/follow-ups/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user)
      return NextResponse.json(
        { error: "Sign in to generate your daily briefing." },
        { status: 401, headers: { "cache-control": "no-store" } },
      );

    const briefing = await generateBriefingData(user);
    await saveDailyBriefing(user.id, briefing);
    const followUpState = await syncFollowUpCandidates(user.id, briefing.commitments ?? []);
    return NextResponse.json(
      { ...briefing, commitments: followUpState.open, completedCommitments: followUpState.completed, dismissedCommitments: followUpState.dismissed },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "[workspace/briefing] Failed to generate daily briefing:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "Your briefing could not be generated. Please try again." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
