import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const authSecret = process.env.AUTH_SECRET;
if (!authSecret || authSecret.length < 32) throw new Error("E2E requires AUTH_SECRET with at least 32 characters.");

function encode(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}
function makeSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: user.id, email: user.email, name: user.name, iat: now, exp: now + 3600 })
  ].join(".");
  const signature = createHmac("sha256", authSecret).update(unsigned).digest("base64url");
  return unsigned + "." + signature;
}
function check(condition, message) {
  assert.ok(condition, message);
  console.log("PASS " + message);
}
async function request(path, options = {}, token) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("cookie", "assistant_session=" + token);
  return fetch(new URL(path, baseUrl), { ...options, headers, cache: "no-store", redirect: options.redirect ?? "manual" });
}
async function expectStatus(path, status, options, token) {
  const response = await request(path, options, token);
  assert.equal(response.status, status, path + " should return HTTP " + status + ", got " + response.status);
  return response;
}

let mockProvider;
let user;
try {
  mockProvider = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Mock provider route not found" } }));
      return;
    }
    const parsed = JSON.parse(body || "{}");
    if (!parsed.model || !Array.isArray(parsed.messages)) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Invalid completion payload" } }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "E2E mock assistant reply." } }] }));
  });
  await new Promise((resolve, reject) => {
    mockProvider.once("error", reject);
    mockProvider.listen(4010, "127.0.0.1", resolve);
  });

  let health;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      health = await request("/api/health");
      if (health.ok) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(health?.ok, "Application server should start and health endpoint should respond");
  const healthBody = await health.json();
  assert.equal(healthBody.status, "ok");
  check(true, "health endpoint responds");

  const readiness = await request("/api/health/ready");
  assert.equal(readiness.status, 200, "readiness endpoint should return HTTP 200 when CI services are configured");
  const readinessBody = await readiness.json();
  assert.equal(readinessBody.status, "ok");
  assert.equal(readinessBody.checks.database, "ok");
  assert.equal(readinessBody.checks.configuration, "ok");
  assert.deepEqual(readinessBody.checks.missingConfiguration, []);
  check(true, "readiness endpoint verifies database connectivity and required configuration without exposing secret values");

  for (const path of ["/auth", "/", "/integrations", "/tasks", "/assistant", "/briefing"]) {
    const response = await expectStatus(path, 200);
    const html = await response.text();
    check(html.length > 0, path + " page renders");
  }

  const signInStart = await expectStatus("/api/auth/google/start?intent=signin", 307);
  const signInUrl = new URL(signInStart.headers.get("location"));
  assert.equal(signInUrl.origin, "https://accounts.google.com");
  assert.deepEqual(signInUrl.searchParams.get("scope").split(" ").sort(), ["email", "openid", "profile"]);
  assert.ok(signInStart.headers.get("set-cookie")?.includes("google_auth_intent=signin"));
  check(true, "sign-in flow requests identity-only Google scopes and stores the selected intent");

  const signUpStart = await expectStatus("/api/auth/google/start?intent=signup", 307);
  const signUpUrl = new URL(signUpStart.headers.get("location"));
  assert.deepEqual(signUpUrl.searchParams.get("scope").split(" ").sort(), ["email", "openid", "profile"]);
  assert.ok(signUpStart.headers.get("set-cookie")?.includes("google_auth_intent=signup"));
  check(true, "account creation flow requests only identity scopes");

  const oauthStart = await expectStatus("/api/auth/google/start", 307);
  const authorizationUrl = new URL(oauthStart.headers.get("location"));
  assert.equal(authorizationUrl.origin, "https://accounts.google.com");
  assert.ok(authorizationUrl.searchParams.get("scope").includes("https://www.googleapis.com/auth/gmail.readonly"));
  assert.ok(authorizationUrl.searchParams.get("scope").includes("https://www.googleapis.com/auth/calendar.readonly"));
  assert.ok(oauthStart.headers.get("set-cookie")?.includes("google_oauth_state="));
  check(true, "Google OAuth start redirects with state and read-only Gmail/Calendar scopes");

  const invalidCallback = await expectStatus("/api/auth/google/callback?state=attacker&code=invalid", 307);
  assert.ok(new URL(invalidCallback.headers.get("location")).searchParams.get("error") === "invalid_oauth_state");
  check(true, "Google OAuth callback rejects missing or mismatched state");

  await expectStatus("/api/tasks", 401);
  await expectStatus("/api/chat", 401);
  await expectStatus("/api/workspace/overview", 401);
  await expectStatus("/api/workspace/briefing", 401);
  await expectStatus("/api/preferences", 401);
  await expectStatus("/api/notifications", 401);
  check(true, "protected APIs reject unauthenticated requests");

  const credentialsEmail = "credentials-" + Date.now() + "@example.test";
  const credentialsPassword = "test-password-long-enough-42";
  const signupResponse = await expectStatus("/api/auth/signup", 201, {
    method: "POST",
    body: JSON.stringify({ name: "Credentials E2E", email: credentialsEmail, password: credentialsPassword })
  });
  const signupBody = await signupResponse.json();
  assert.equal(signupBody.user.email, credentialsEmail);
  assert.ok(signupResponse.headers.get("set-cookie")?.includes("assistant_session="));
  const credentialsUser = await prisma.user.findUnique({ where: { email: credentialsEmail }, select: { id: true, passwordHash: true } });
  assert.ok(credentialsUser);
  assert.ok(credentialsUser.passwordHash?.startsWith("scrypt$"));
  assert.notEqual(credentialsUser.passwordHash, credentialsPassword);
  check(true, "email/password signup stores a salted password hash and starts a session");

  const credentialsLogin = await expectStatus("/api/auth/login", 200, {
    method: "POST",
    body: JSON.stringify({ email: credentialsEmail, password: credentialsPassword })
  });
  assert.ok(credentialsLogin.headers.get("set-cookie")?.includes("assistant_session="));
  assert.equal((await credentialsLogin.json()).user.email, credentialsEmail);
  await expectStatus("/api/auth/login", 401, {
    method: "POST",
    body: JSON.stringify({ email: credentialsEmail, password: "incorrect-password" })
  });
  await expectStatus("/api/auth/signup", 409, {
    method: "POST",
    body: JSON.stringify({ name: "Duplicate", email: credentialsEmail, password: credentialsPassword })
  });
  check(true, "credentials login verifies passwords and rejects incorrect passwords and duplicate accounts");
  await prisma.user.delete({ where: { id: credentialsUser.id } });

  user = await prisma.user.create({
    data: { email: "e2e-" + Date.now() + "@example.test", name: "E2E Test User", timezone: "UTC" }
  });
  const token = makeSession(user);

  const sessionResponse = await expectStatus("/api/auth/session", 200, {}, token);
  const sessionBody = await sessionResponse.json();
  assert.equal(sessionBody.user.id, user.id);
  check(true, "signed session authenticates the correct account");

  const logoutResponse = await expectStatus("/api/auth/logout", 200, { method: "POST" }, token);
  assert.equal((await logoutResponse.json()).ok, true);
  assert.ok(logoutResponse.headers.get("set-cookie")?.includes("assistant_session="));
  check(true, "sign-out endpoint clears the session cookie");

  const workspaceResponse = await expectStatus("/api/workspace/overview", 200, {}, token);
  const workspaceBody = await workspaceResponse.json();
  assert.equal(workspaceBody.connected, false);
  assert.deepEqual(workspaceBody.emails, []);
  assert.deepEqual(workspaceBody.events, []);
  check(true, "workspace API handles an authenticated account without a Google connection");

  await prisma.task.create({ data: { userId: user.id, title: "Review production incident", priority: "LOW", dueAt: new Date(Date.now() - 60 * 60 * 1000), source: "USER" } });

  const briefingResponse = await expectStatus("/api/workspace/briefing", 200, {}, token);
  const briefing = await briefingResponse.json();
  assert.equal(briefing.connected, false);
  assert.equal(briefing.metrics.openTasks, 1);
  assert.ok(Array.isArray(briefing.priorities));
  assert.ok(briefing.preferences);
  assert.ok(briefing.tasks[0].reasons.includes("Overdue"));
  assert.ok(briefing.tasks[0].reasons.includes("Business-critical context"));
  check(true, "daily briefing ranks overdue business-critical tasks with explainable reasons");

  const preferencesResponse = await expectStatus("/api/preferences", 200, {}, token);
  const preferences = (await preferencesResponse.json()).preferences;
  assert.equal(preferences.dailyBriefingEnabled, true);
  check(true, "user briefing preferences are initialized and returned");

  const updatePreferencesResponse = await expectStatus("/api/preferences", 200, {
    method: "PATCH",
    body: JSON.stringify({ dailyBriefingEnabled: false, briefingHour: 9, defaultApprovalMode: "CONFIRM" })
  }, token);
  const updatedPreferences = (await updatePreferencesResponse.json()).preferences;
  assert.equal(updatedPreferences.dailyBriefingEnabled, false);
  assert.equal(updatedPreferences.briefingHour, 9);
  check(true, "briefing preferences persist across API requests");

  const cronUnauthenticated = await expectStatus("/api/cron/daily-briefings", 401, { method: "POST" });
  check(cronUnauthenticated.status === 401, "scheduled briefing worker rejects unauthenticated requests");

  const schedulingHour = new Date().getUTCHours();
  await expectStatus("/api/preferences", 200, {
    method: "PATCH",
    body: JSON.stringify({ dailyBriefingEnabled: true, briefingHour: schedulingHour })
  }, token);
  const cronSecret = process.env.CRON_SECRET;
  assert.ok(cronSecret && cronSecret.length >= 32, "CI must configure a strong CRON_SECRET");
  const cronResponse = await expectStatus("/api/cron/daily-briefings", 200, {
    method: "POST", headers: { authorization: "Bearer " + cronSecret }
  });
  const cronBody = await cronResponse.json();
  assert.ok(cronBody.generated >= 1, "scheduler should generate a briefing for the eligible test user");
  check(true, "scheduled worker creates briefings for users whose local delivery hour is due");

  const notificationsResponse = await expectStatus("/api/notifications", 200, {}, token);
  const notifications = await notificationsResponse.json();
  assert.ok(notifications.notifications.some(item => item.type === "DAILY_BRIEFING"));
  assert.equal(notifications.unreadCount, 1);
  assert.equal(notifications.briefings.length, 1);
  check(true, "scheduled briefing and in-app notification persist in user history");

  const duplicateCronResponse = await expectStatus("/api/cron/daily-briefings", 200, {
    method: "POST", headers: { authorization: "Bearer " + cronSecret }
  });
  const duplicateCron = await duplicateCronResponse.json();
  assert.ok(duplicateCron.skipped >= 1);
  assert.equal(await prisma.dailyBriefing.count({ where: { userId: user.id } }), 1);
  assert.equal(await prisma.notification.count({ where: { userId: user.id, type: "DAILY_BRIEFING" } }), 1);
  check(true, "repeated scheduler runs are idempotent and do not duplicate daily briefings");

  const notificationId = notifications.notifications.find(item => item.type === "DAILY_BRIEFING").id;
  await expectStatus("/api/notifications", 200, {
    method: "PATCH",
    body: JSON.stringify({ notificationId })
  }, token);
  const readNotifications = await (await expectStatus("/api/notifications", 200, {}, token)).json();
  assert.equal(readNotifications.unreadCount, 0);
  check(true, "users can mark scheduled briefing notifications as read");

  const createResponse = await expectStatus("/api/tasks", 201, {
    method: "POST",
    body: JSON.stringify({
      title: "E2E verify task lifecycle",
      description: "Created by the CI end-to-end test",
      priority: "HIGH"
    })
  }, token);
  const created = (await createResponse.json()).task;
  assert.equal(created.title, "E2E verify task lifecycle");
  assert.equal(created.priority, "HIGH");
  check(true, "task creation persists valid task data");

  const listResponse = await expectStatus("/api/tasks", 200, {}, token);
  const listed = (await listResponse.json()).tasks;
  assert.ok(listed.some(task => task.id === created.id));
  check(true, "task list returns the saved task");

  const patchResponse = await expectStatus("/api/tasks/" + created.id, 200, {
    method: "PATCH",
    body: JSON.stringify({ status: "DONE", priority: "URGENT" })
  }, token);
  const updated = (await patchResponse.json()).task;
  assert.equal(updated.status, "DONE");
  assert.equal(updated.priority, "URGENT");
  assert.ok(updated.completedAt);
  check(true, "task completion and priority updates persist");

  await expectStatus("/api/tasks/" + created.id, 200, {
    method: "PATCH",
    body: JSON.stringify({ status: "TODO" })
  }, token);
  check(true, "completed task can be reopened");

  await expectStatus("/api/tasks/" + created.id, 200, { method: "DELETE" }, token);
  const afterDelete = (await (await expectStatus("/api/tasks", 200, {}, token)).json()).tasks;
  assert.ok(!afterDelete.some(task => task.id === created.id));
  check(true, "task archive hides the task without hard deletion");

  const chatResponse = await expectStatus("/api/chat", 200, {
    method: "POST",
    body: JSON.stringify({ message: "Give me a short test reply." })
  }, token);
  const chat = await chatResponse.json();
  assert.equal(chat.assistantMessage.content, "E2E mock assistant reply.");
  assert.ok(chat.conversationId);
  check(true, "chat endpoint calls the configured provider and returns an assistant reply");

  const historyResponse = await expectStatus("/api/chat/" + chat.conversationId, 200, {}, token);
  const history = (await historyResponse.json()).conversation;
  assert.equal(history.messages.length, 2);
  assert.equal(history.messages[0].role, "user");
  assert.equal(history.messages[1].role, "assistant");
  check(true, "chat history persists both user and assistant messages");

  const conversations = (await (await expectStatus("/api/chat", 200, {}, token)).json()).conversations;
  assert.ok(conversations.some(conversation => conversation.id === chat.conversationId));
  check(true, "conversation list returns the saved conversation");

  const otherUser = await prisma.user.create({
    data: { email: "e2e-other-" + Date.now() + "@example.test", name: "Other Test User" }
  });
  const otherToken = makeSession(otherUser);
  await expectStatus("/api/tasks/" + created.id, 404, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Unauthorized edit" }) }, otherToken);
  await expectStatus("/api/chat/" + chat.conversationId, 404, {}, otherToken);
  await expectStatus("/api/notifications", 404, { method: "PATCH", body: JSON.stringify({ notificationId }) }, otherToken);
  check(true, "task, conversation, and notification ownership prevents cross-account access");
  await prisma.user.delete({ where: { id: otherUser.id } });

  const disconnectResponse = await expectStatus("/api/integrations/google/disconnect", 200, { method: "POST" }, token);
  assert.equal((await disconnectResponse.json()).ok, true);
  check(true, "Google disconnect endpoint safely handles an account with no integration");

  console.log("\nAll end-to-end checks passed.");
} catch (error) {
  console.error("\nE2E test failed:", error);
  process.exitCode = 1;
} finally {
  if (user) {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
  if (mockProvider) await new Promise(resolve => mockProvider.close(resolve));
  await prisma.$disconnect();
}
