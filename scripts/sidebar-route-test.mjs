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
    href: "/briefing",
    label: "Overview",
    page: "src/app/briefing/page.jsx",
    client: "src/components/client/briefing-client.jsx",
    endpoints: ["/api/workspace/briefing"],
    workflow: /next actions|daily briefing|priority/i,
  },
  {
    href: "/tasks",
    label: "My tasks",
    page: "src/app/tasks/page.jsx",
    client: "src/components/client/tasks-client.jsx",
    endpoints: ["/api/tasks"],
    workflow: /addTask|priorityFilter|dueFilter|sortBy/i,
  },
  {
    href: "/assistant",
    label: "AI assistant",
    page: "src/app/assistant/page.jsx",
    client: "src/components/client/assistant-client.jsx",
    endpoints: ["/api/chat"],
    workflow: /sendMessage|openConversation|newConversation/i,
  },
  {
    href: "/calendar",
    label: "Calendar & meetings",
    page: "src/app/calendar/page.jsx",
    client: "src/components/client/calendar-client.jsx",
    endpoints: ["/api/meeting-drafts"],
    workflow: /save|approve|cancel|proposalStatusFilter/i,
  },
  {
    href: "/email",
    label: "Email outreach",
    page: "src/app/email/page.jsx",
    client: "src/components/client/email-client.jsx",
    endpoints: ["/api/email-drafts"],
    workflow: /save|generate|statusFilter|approve|send/i,
  },
  {
    href: "/actions",
    label: "Action center",
    page: "src/app/actions/page.jsx",
    client: "src/components/client/actions-client.jsx",
    endpoints: ["/api/actions", "/api/automation-rules"],
    workflow: /automationPaused|approve|reject|ruleMode/i,
  },
  {
    href: "/integrations",
    label: "Connections",
    page: "src/app/integrations/page.jsx",
    client: "src/components/client/ui.jsx",
    endpoints: [
      "/api/workspace/overview",
      "/api/preferences",
      "/api/integrations/google/disconnect",
      "/api/auth/google/start",
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

  console.log(`PASS ${route.href}: ${route.label} page, client workflow, and API coverage`);
}

console.log(`PASS sidebar route coverage: ${routes.length} routes checked`);
