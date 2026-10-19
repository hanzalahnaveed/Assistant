import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json(
      { error: "invalid_request", message: "The request could not be verified. Refresh the page and try again." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  await clearSession();
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
