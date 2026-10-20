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
    href: "/dashboard/briefing",
    label: "Briefing",
    page: "src/app/dashboard/briefing/page.jsx",
    client: "src/components/client/briefing-client.jsx",
    endpoints: ["/api/workspace/briefing"],
    workflow: /next actions|daily briefing|priority/i,
  },
  {
    href: "/dashboard/tasks",
    label: "Tasks",
    page: "src/app/dashboard/tasks/page.jsx",
    client: "src/components/client/tasks-client.jsx",
    endpoints: ["/api/tasks"],
    workflow: /addTask|priorityFilter|dueFilter|sortBy/i,
  },
  {
    href: "/dashboard",
    label: "AI assistant",
    page: "src/app/dashboard/page.jsx",
    client: "src/components/client/assistant-client.jsx",
    endpoints: ["/api/chat"],
    workflow: /sendMessage|openConversation|newConversation/i,
  },
  {
    href: "/dashboard/calendar",
    label: "Calendar & Schedule",
    page: "src/app/dashboard/calendar/page.jsx",
    client: "src/components/client/calendar-client.jsx",
    endpoints: ["/api/meeting-drafts"],
    workflow: /save|approve|cancel|proposalStatusFilter/i,
  },
  {
    href: "/dashboard/email",
    label: "Email outreach",
    page: "src/app/dashboard/email/page.jsx",
    client: "src/components/client/email-client.jsx",
    endpoints: ["/api/email-drafts"],
    workflow: /save|generate|statusFilter|approve|send/i,
  },
  {
    href: "/dashboard/actions",
    label: "Action center",
    page: "src/app/dashboard/actions/page.jsx",
    client: "src/components/client/actions-client.jsx",
    endpoints: ["/api/actions", "/api/automation-rules"],
    workflow: /automationPaused|approve|reject|ruleMode/i,
  },
  {
    href: "/dashboard/integrations",
    label: "Integrations",
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

  if (route.href === "/dashboard/tasks") {
    assert.match(client, /completeSelectedTasks/, "task workflow must support completing selected tasks");
    assert.match(client, /Select all visible active tasks/, "task workflow must support selecting visible tasks");
    assert.match(client, /Retry the remaining selection/i, "bulk completion must report partial failures");
    assert.match(client, /id: "in_progress"/, "task workflow must expose an in-progress view");
    assert.match(client, /task\.status === "IN_PROGRESS"/, "in-progress view must filter by task status");
    assert.match(client, /aria-pressed=\{view === tab\.id\}/, "task status tabs must expose their selected state");
  }

  if (route.href === "/dashboard/calendar") {
    assert.match(client, /validateMeetingForm/, "meeting workflow must validate before saving");
    assert.match(client, /Meeting end must be after its start/, "meeting workflow must reject invalid time ranges");
    assert.match(client, /valid IANA timezone/, "meeting workflow must validate the selected timezone");
    assert.match(client, /Check attendee emails/, "meeting workflow must validate attendee email addresses");
    assert.match(client, /localDateTimeToIso/, "meeting workflow must interpret form times in the selected timezone");
    assert.match(client, /toLocalDateTime/, "meeting edits must restore wall-clock values in the selected timezone");
    const timezoneUtility = await read("src/lib/calendar-timezone.mjs");
    assert.match(timezoneUtility, /daylight-saving|verified/, "timezone conversion must reject nonexistent local times");
    const createApi = await read("src/app/api/meeting-drafts/route.js");
    const detailApi = await read("src/app/api/meeting-drafts/[id]/route.js");
    for (const [api, label] of [[createApi, "meeting proposal creation API"], [detailApi, "meeting proposal detail API"]]) {
      assert.match(api, /valid IANA timezone/, label + " must validate timezones server-side");
      assert.match(api, /Meeting end must be after its start/, label + " must reject reversed meeting times");
    }
    const e2e = await read("scripts/e2e-test.mjs");
    assert.match(e2e, /meeting proposal API rejects invalid timezone/, "E2E must cover invalid meeting input");
    assert.match(e2e, /meeting proposals require approval before creation/, "E2E must cover the approval and safe creation lifecycle");
    assert.match(e2e, /meeting proposal edits persist/, "E2E must cover meeting proposal editing");
  }

  console.log(`PASS ${route.href}: ${route.label} page, client workflow, and API coverage`);
}

console.log(`PASS sidebar route coverage: ${routes.length} routes checked`);
