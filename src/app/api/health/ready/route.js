import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

const requiredConfiguration = [
  "DATABASE_URL",
  "APP_URL",
  "AUTH_SECRET",
  "CRON_SECRET",
];

export async function GET() {
  const dummyClassifier = process.env.EMAIL_AGENT_CLASSIFIER_MODE?.toLowerCase() === "dummy";
  const requiredKeys = dummyClassifier
    ? requiredConfiguration
    : [...requiredConfiguration, "OPENAI_API_KEY"];
  const missingConfiguration = requiredKeys.filter((key) => {
    const value = process.env[key];
    return !value || value.trim().length === 0;
  });
  let database = "not_configured";
  if (process.env.DATABASE_URL) {
    try {
      await prisma.$queryRaw`SELECT 1 FROM "User" LIMIT 0`;
      database = "ok";
    } catch {
      database = "error";
    }
  }
  const ready = database === "ok" && missingConfiguration.length === 0;
  return NextResponse.json(
    {
      status: ready ? "ok" : "not_ready",
      service: "assistant",
      checks: {
        database,
        classifier: dummyClassifier ? "dummy" : "live",
        configuration: missingConfiguration.length === 0 ? "ok" : "missing",
        missingConfiguration,
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
