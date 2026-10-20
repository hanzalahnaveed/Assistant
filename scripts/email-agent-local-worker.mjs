import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const baseUrl = (process.env.EMAIL_AGENT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;
const requestedInterval = Number(process.env.EMAIL_AGENT_POLL_INTERVAL_MS || 60000);
const intervalMs = Number.isFinite(requestedInterval)
  ? Math.min(300000, Math.max(15000, requestedInterval))
  : 60000;

if (!secret || secret.length < 32) {
  console.error("Set CRON_SECRET to a separate random secret of at least 32 characters in your local environment.");
  process.exit(1);
}

let stopping = false;
let activeRequest = null;
let wakeSleep = null;

function stop() {
  stopping = true;
  activeRequest?.abort();
  wakeSleep?.();
}

process.once("SIGINT", () => {
  stop();
  console.log("\nStopping local email-agent worker…");
});
process.once("SIGTERM", stop);

const sleep = (milliseconds) => new Promise((resolve) => {
  const timer = setTimeout(() => {
    wakeSleep = null;
    resolve();
  }, milliseconds);
  wakeSleep = () => {
    clearTimeout(timer);
    wakeSleep = null;
    resolve();
  };
});

console.log("Local email-agent worker started for " + baseUrl);
console.log("Polling every " + Math.round(intervalMs / 1000) + " seconds. Press Ctrl+C to stop.");

while (!stopping) {
  const controller = new AbortController();
  activeRequest = controller;
  try {
    const response = await fetch(baseUrl + "/api/cron/email-agent", {
      method: "POST",
      headers: {
        authorization: "Bearer " + secret,
        accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(new Date().toISOString(), "Worker returned HTTP", response.status, result.error || "");
    } else {
      console.log(new Date().toISOString(), JSON.stringify({
        ok: result.ok,
        eligibleUsers: result.eligibleUsers,
        processed: result.processed,
        drafted: result.drafted,
        sent: result.sent,
        skipped: result.skipped,
        failed: result.failed,
      }));
    }
  } catch (error) {
    if (!stopping) console.error(new Date().toISOString(), error instanceof Error ? error.message : "Worker request failed.");
  } finally {
    activeRequest = null;
  }
  if (!stopping) await sleep(intervalMs);
}
