import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { generateBriefingData } from "@/lib/briefing/service";
import { syncFollowUpCandidates } from "@/lib/follow-ups/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { error: "Sign in to generate your daily briefing." },
      { status: 401 },
    );
  try {
    const briefing = await generateBriefingData(user);
    const followUpState = await syncFollowUpCandidates(user.id, briefing.commitments ?? []);
    return NextResponse.json(
      { ...briefing, commitments: followUpState.open, dismissedCommitments: followUpState.dismissed },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to generate daily briefing", error);
    return NextResponse.json(
      { error: "Your briefing could not be generated. Please try again." },
      { status: 500 },
    );
  }
}
