import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const exists = async (relativePath) => {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
};

const routes = [
  {
    href: "/dashboard/schedule",
    label: "Tasks & calendar",
    page: "src/app/dashboard/schedule/page.jsx",
    client: "src/components/client/schedule-client.jsx",
    endpoints: ["/api/calendar-events", "/api/tasks"],
    workflow: /validateForm|idempotencyKey|create calendar event/i,
  },
  {
    href: "/dashboard/email",
    label: "Email",
    page: "src/app/dashboard/email/page.jsx",
    client: "src/components/client/inbound-email-queue.jsx",
    endpoints: ["/api/email-agent/inbox", "/api/email-drafts"],
    workflow: /draftAction|Approve reply|Send reply/i,
  },
  {
    href: "/dashboard/integrations",
    label: "Connections",
    page: "src/app/dashboard/integrations/page.jsx",
    client: "src/components/client/ui.jsx",
    endpoints: [
      "/api/workspace/overview",
      "/api/preferences",
      "/api/integrations/google/disconnect",
      "/api/auth/google/start",
      "/api/integrations/google/verify",
    ],
    workflow: /savePreferences|disconnect|logout|Connect Google/i,
  },
];

const sidebar = await read("src/components/workspace-header.jsx");
assert.match(sidebar, /aria-label="Main navigation"/, "sidebar must expose its main navigation");
const sidebarRoutes = [...sidebar.matchAll(/href:\s*"([^"]+)"[\s\S]*?label:\s*"([^"]+)"/g)]
  .map((match) => ({ href: match[1], label: match[2] }));
assert.equal(sidebarRoutes.length, routes.length, "sidebar route inventory must be fully represented in this test");
assert.equal(new Set(sidebarRoutes.map((route) => route.href)).size, sidebarRoutes.length, "sidebar routes must be unique");

for (const route of routes) {
  const navItem = sidebarRoutes.find((item) => item.href === route.href);
  assert.ok(navItem, `sidebar is missing route ${route.href}`);
  assert.equal(navItem.label, route.label, `sidebar label changed for ${route.href}`);
  assert.ok(await exists(route.page), `${route.href} must have a page module`);
  assert.ok(await exists(route.client), `${route.href} must have a client workflow`);

  const page = await read(route.page);
  assert.ok(
    page.includes(path.basename(route.client, ".jsx")),
    `${route.page} must mount its expected client workflow`,
  );

  const client = await read(route.client);
  assert.match(client, route.workflow, `${route.href} must retain its key interactive workflow`);
  for (const endpoint of route.endpoints) {
    assert.ok(client.includes(endpoint), `${route.href} must call ${endpoint}`);
  }

  if (route.href === "/dashboard/integrations") {
    assert.match(client, /verifyIntegration/, "connections workflow must offer live Google integration verification");
    assert.match(client, /Run integration checks/, "connections workflow must explain the verification action");
    assert.match(client, /Routes powered by Google/, "connections workflow must link to dependent routes");
    const verificationApi = await read("src/app/api/integrations/google/verify/route.js");
    assert.match(verificationApi, /getGoogleAccessToken/, "integration verification must check live Google access");
    assert.match(verificationApi, /gmailRead/, "integration verification must report Gmail read capability");
    assert.match(verificationApi, /calendarRead/, "integration verification must report Calendar read capability");
    assert.match(verificationApi, /gmailSend/, "integration verification must report Gmail send scope");
    assert.match(verificationApi, /calendarWrite/, "integration verification must report Calendar event scope");
  }

  if (route.href === "/dashboard/schedule") {
    assert.match(client, /Add time, location, and attendees in Google Calendar/, "schedule form must offer calendar sync without a separate item category");
    assert.match(client, /data\?\.items/, "list and calendar views must use the unified schedule-item feed");
    assert.match(client, /scheduleEvents=\{visibleEvents\}/, "the list must render calendar-backed schedule items alongside local items");
    assert.match(client, /window\.confirm/, "direct event creation must require explicit confirmation");
    const tasksClient = await read("src/components/client/tasks-client.jsx");
    assert.match(tasksClient, /completeSelectedTasks/, "embedded task workflow must support completing selected tasks");
    assert.match(tasksClient, /Select all visible active items/, "unified schedule list must support selecting visible items");
    assert.match(tasksClient, /Retry the remaining selection/i, "bulk completion must report partial failures");
    assert.match(tasksClient, /id: "in_progress"/, "task workflow must expose an in-progress view");
    assert.match(tasksClient, /task\.status === "IN_PROGRESS"/, "in-progress view must filter by task status");
    assert.match(tasksClient, /aria-pressed=\{view === tab\.id\}/, "task status tabs must expose their selected state");
    const timezoneUtility = await read("src/lib/calendar-timezone.mjs");
    assert.match(timezoneUtility, /daylight-saving|verified/, "timezone conversion must reject nonexistent local times");
    const createApi = await read("src/app/api/calendar-events/route.js");
    const schema = await read("prisma/schema.prisma");
    assert.match(schema, /model ScheduleItem/, "tasks and calendar-backed entries must share the ScheduleItem model");
    assert.match(schema, /calendarEventId\s+String\?/, "schedule items must retain their optional Google Calendar reference");
    assert.match(createApi, /items: scheduleItems\.map\(scheduleItemToJson\)/, "calendar feed must return the unified persisted items");
    assert.match(createApi, /valid IANA timezone/, "calendar event API must validate timezones server-side");
    assert.match(createApi, /automationPaused/, "calendar event API must respect the global automation pause");
    assert.match(createApi, /availability\.nextPageToken/, "calendar event API must fail closed when availability cannot be fully checked");
    assert.match(createApi, /idempotencyKey/, "calendar event API must prevent duplicate creation retries");
    const e2e = await read("scripts/e2e-test.mjs");
    assert.match(e2e, /local and calendar-backed records share one persisted schedule-item feed/, "E2E must verify one shared feed contains both local and calendar-backed items");
    assert.match(e2e, /direct calendar event creation validates input and requires permission/, "E2E must cover calendar sync validation and permission enforcement");
  }

  console.log(`PASS ${route.href}: ${route.label} page, client workflow, and API coverage`);
}

console.log(`PASS sidebar route coverage: ${routes.length} routes checked`);
