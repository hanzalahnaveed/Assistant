import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
const requiredConfiguration = [
    "DATABASE_URL",
    "APP_URL",
    "AUTH_SECRET",
    "OPENAI_API_KEY",
    "CRON_SECRET"
];
export async function GET() {
    const missingConfiguration = requiredConfiguration.filter((key) => {
        const value = process.env[key];
        return !value || value.trim().length === 0;
    });
    let database = "not_configured";
    if (process.env.DATABASE_URL) {
        try {
            await prisma.$queryRaw `SELECT 1 FROM "User" LIMIT 0`;
            database = "ok";
        }
        catch {
            database = "error";
        }
    }
    const ready = database === "ok" && missingConfiguration.length === 0;
    return NextResponse.json({
        status: ready ? "ok" : "not_ready",
        service: "assistant",
        checks: {
            database,
            configuration: missingConfiguration.length === 0 ? "ok" : "missing",
            missingConfiguration
        },
        timestamp: new Date().toISOString()
    }, {
        status: ready ? 200 : 503,
        headers: { "Cache-Control": "no-store" }
    });
}
