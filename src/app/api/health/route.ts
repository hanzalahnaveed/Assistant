import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "assistant",
    timestamp: new Date().toISOString()
  });
}
