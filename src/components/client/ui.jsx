"use client";


import { Button } from "antd";
import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Inbox,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Unplug,
} from "lucide-react";
import WorkspaceHeader from "@/components/workspace-header";
function formatDate(value) {
  if (!value) return "Time not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}
export default function IntegrationsClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [oauthError, setOauthError] = useState("");
  const [preferences, setPreferences] = useState(null);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesError, setPreferencesError] = useState("");
  const [preferencesNotice, setPreferencesNotice] = useState("");
  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspace/overview", {
        cache: "no-store",
      });
      const body = await response.json();
      if (response.status === 401)
        setData({
          connected: false,
          emails: [],
          events: [],
        });
      else {
        setData(body);
        if (!response.ok && body.error) setError(body.error);
        else if (body.error) setError(body.error);
      }
    } catch {
      setError("Could not reach the app server. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/preferences", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load your preferences.");
        if (!cancelled) setPreferences(body.preferences);
      })
      .catch((cause) => {
        if (!cancelled) setPreferencesError(cause instanceof Error ? cause.message : "Could not load your preferences.");
      })
      .finally(() => {
        if (!cancelled) setPreferencesLoading(false);
      });
    return () => { cancelled = true; };
  }, []);
  async function savePreferences(event) {
    event.preventDefault();
    if (!preferences || preferencesSaving) return;
    setPreferencesSaving(true);
    setPreferencesError("");
    setPreferencesNotice("");
    try {
      const response = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dailyBriefingEnabled: preferences.dailyBriefingEnabled,
          briefingHour: Number(preferences.briefingHour),
          defaultApprovalMode: preferences.defaultApprovalMode,
          timezone: preferences.timezone,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save your preferences.");
      setPreferences(body.preferences);
      setPreferencesNotice("Your briefing and approval preferences have been saved.");
    } catch (cause) {
      setPreferencesError(cause instanceof Error ? cause.message : "Could not save your preferences.");
    } finally {
      setPreferencesSaving(false);
    }
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "google") {
      setNotice("Google Workspace connected. Run the integration checks below to verify Gmail and Calendar access.");
    }
    const code = params.get("error");
    if (!code) return;
    const messages = {
      google_not_configured: "Google Workspace is not configured yet. Please try again after setup is complete.",
      google_consent_cancelled: "Google connection was cancelled. No changes were made.",
      invalid_oauth_state: "The Google connection request expired or could not be verified. Please try connecting again.",
      sign_in_required: "Sign in before connecting Google Workspace.",
      google_account_already_linked: "That Google account is already connected to another Assistant account.",
      google_connection_failed: "Google Workspace could not be connected. Please try again.",
      account_not_found: "No matching Assistant account was found. Sign in or create an account first.",
      account_exists: "An account already exists for that Google email. Sign in instead.",
    };
    setOauthError(messages[code] || "Google Workspace connection failed. Please try again.");
  }, []);
  async function verifyIntegration() {
    if (verifying) return;
    setVerifying(true);
    setVerificationError("");
    try {
      const response = await fetch("/api/integrations/google/verify", {
        method: "POST",
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not verify Google integration.");
      setVerification(body);
      if (body.reauthRequired) {
        setNotice("Google access needs reconnecting. Review the verification results and reconnect.");
      } else if (body.connected) {
        const readChecks = [body.checks?.gmailRead, body.checks?.calendarRead];
        if (readChecks.every((check) => check?.status === "passed")) {
          setNotice("Gmail and Google Calendar API access verified. Sending and event creation remain separately confirmed actions.");
        }
      }
    } catch (cause) {
      setVerificationError(cause instanceof Error ? cause.message : "Could not verify Google integration.");
    } finally {
      setVerifying(false);
    }
  }
  async function disconnect() {
    if (!window.confirm("Disconnect Google Workspace and revoke this app's stored Google access?"))
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/google/disconnect", {
        method: "POST",
      });
      if (!response.ok) throw new Error("Disconnect failed. Please retry.");
      setNotice("Google Workspace disconnected. Your app session remains active.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (!window.confirm("Log out of your Assistant account?"))
      return;
    setLoggingOut(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) {
        let message = "Logout failed. Please retry.";
        try {
          const body = await response.json();
          if (body.message) message = body.message;
        } catch {
          // Keep the explicit fallback when the server response is not JSON.
        }
        throw new Error(message);
      }
      window.location.replace("/auth");
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Logout failed. Please retry.");
      setLoggingOut(false);
    }
  }
  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#212529] pl-[58px] min-[421px]:pl-[72px] min-[761px]:pl-[252px]">
      <WorkspaceHeader />
      <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-[26px] min-[761px]:pt-[clamp(26px,4vw,48px)] pb-14">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#FA8500]">
          <ShieldCheck size={14} /> Workspace settings
        </div>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#FA8500]">
              <Sparkles size={14} /> Workspace connections
            </div>
            <h1 className="text-[clamp(1.8rem,3vw,2.5rem)] font-semibold tracking-[-0.045em] leading-[1.13]">
              Connect your workday.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#6B7280] text-pretty">
              Connect Gmail and Google Calendar to surface the work that matters and send outreach
              or schedule meetings only after review and explicit confirmation.
            </p>
          </div>
          <Button
            onClick={() => void load()}
            disabled={loading || busy || loggingOut}
            className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] bg-white px-4 py-2.5 text-sm font-medium hover:bg-[#fafbf9] disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-[spin_0.9s_linear_infinite]" : ""} />{" "}
            Refresh
          </Button>
        </div>
        {oauthError && (
          <div
            role="alert"
            className="mb-5 border border-[#f0d6cc] bg-[#fff5f0] px-4 py-3 text-sm text-[#994b36] rounded-[13px]"
          >
            {oauthError}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mb-5 border border-[#f0d6cc] bg-[#fff5f0] px-4 py-3 text-sm text-[#994b36] rounded-[13px]"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mb-5 border border-[#d8e9dd] bg-[#eef7f0] px-4 py-3 text-sm text-[#24543f] rounded-[13px]"
          >
            {notice}
          </div>
        )}
        <section className="mb-6 rounded-[18px] border border-[#E3E7ED] p-5 sm:p-7 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] bg-white">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#e8f0ff] text-[#356ac3]">
                <span className="text-lg font-bold">G</span>
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-[-0.025em]">Google Workspace</h2>
                <p className="mt-1 text-sm text-[#6B7280] text-pretty">
                  Gmail inbox and primary calendar
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs text-[#6B7280]">
                  <ShieldCheck size={14} className="text-[#FA8500]" /> Gmail read + approved sending
                  · Calendar read + approved event creation
                </div>
                {data?.connected && (
                  <div className="mt-3 flex items-center gap-2 text-sm font-medium text-[#FA8500]">
                    <CheckCircle2 size={16} /> Connected as{" "}
                    {data.integration?.email ?? data.user?.email}
                  </div>
                )}
              </div>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                <LoaderCircle size={16} className="animate-[spin_0.9s_linear_infinite]" /> Checking
                connection…
              </div>
            ) : data?.connected ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void verifyIntegration()}
                  disabled={verifying || busy || loggingOut}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#dce4dd] bg-white px-3.5 py-2.5 text-sm font-medium hover:bg-[#fafbf9] disabled:opacity-50"
                >
                  <ShieldCheck size={15} /> {verifying ? "Verifying…" : "Verify access"}
                </Button>
                <Button
                  onClick={() => void disconnect()
                  disabled={busy || loggingOut}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#e2e8e0] px-3.5 py-2.5 text-sm font-medium hover:bg-[#fafbf9] disabled:opacity-50"
                >
                  <Unplug size={15} /> Disconnect
                </Button>
                <a
                  href="/api/auth/google/start"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] shadow-[0_4px_10px_rgb(250_133_0/18%)] px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[#001d3d]"
                >
                  Reconnect <ExternalLink size={14} />
                </a>
              </div>
            ) : (
              <a
                href="/api/auth/google/start"
                className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] shadow-[0_4px_10px_rgb(250_133_0/18%)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#001d3d]"
              >
                Connect Google <ExternalLink size={14} />
              </a>
            )}
          </div>
          {data?.reauthRequired && (
            <p className="mt-4 text-sm text-[#9b6425] text-pretty">
              Your Google session needs reconnecting. Connect Google again to continue.
            </p>
          )}
          <div className="mt-6 grid gap-3 border-t border-[#edf0ec] pt-5 sm:grid-cols-3">
            <Permission
              title="Gmail"
              description="Read inbox metadata and send outreach drafts only after approval"
              icon={<Inbox size={16} />}
            />
            <Permission
              title="Calendar"
              description="Read upcoming events and create approved meeting proposals"
              icon={<CalendarDays size={16} />}
            />
            <Permission
              title="Your control"
              description="Disconnect and revoke access at any time"
              icon={<ShieldCheck size={16} />}
            />
          </div>
        </section>
        {data?.connected && (
          <section className="mb-6 rounded-[18px] border border-[#E3E7ED] bg-white p-5 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold tracking-[-0.025em]">Integration health check</h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-[#6B7280]">
                  Verify live read access and check whether the permissions needed by dependent routes were granted.
                  This test does not send email or create calendar events.
                </p>
              </div>
              <Button
                onClick={() => void verifyIntegration()}
                disabled={verifying || loading || busy}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <RefreshCw size={15} className={verifying ? "animate-[spin_0.9s_linear_infinite]" : ""} />
                {verifying ? "Checking Google APIs…" : "Run integration checks"}
              </Button>
            </div>
            {verificationError && (
              <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800">
                {verificationError}
              </div>
            )}
            {verification && (
              <div className="mt-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold">
                    {verification.connected ? "Checked account: " : "Connection status: "}
                    {verification.email || "Google account"}
                  </div>
                  <span className="text-xs text-[#6B7280]">
                    Checked {formatDate(verification.checkedAt)}
                  </span>
                </div>
                {verification.reauthRequired && (
                  <div role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
                    Google access is expired or revoked. Reconnect the account and run these checks again.
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["gmailRead", "Gmail inbox read", "Used by inbox context, briefings, and assistant research."],
                    ["gmailSend", "Gmail sending", "Required for sending a saved draft after approval."],
                    ["calendarRead", "Google Calendar read", "Used by calendar views, briefings, and assistant context."],
                    ["calendarWrite", "Calendar event creation", "Required after meeting approval and separate confirmation."],
                  ].map(([key, title, description]) => {
                    const check = verification.checks?.[key];
                    const status = check?.status || "not_checked";
                    const passed = status === "passed" || status === "granted";
                    const failed = ["failed", "missing_scope", "reauth_required"].includes(status);
                    return (
                      <article key={key} className="rounded-xl border border-[#e8ece8] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-sm font-semibold">{title}</h3>
                          <span className={"shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold " + (passed ? "bg-emerald-50 text-emerald-800" : failed ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-700")}>
                            {status.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[#6B7280]">{check?.detail || description}</p>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}
        <section className="mb-6 rounded-[18px] border border-[#E3E7ED] bg-white p-5 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] sm:p-6">
          <h2 className="font-semibold tracking-[-0.025em]">Routes powered by Google</h2>
          <p className="mt-1 text-xs leading-5 text-[#6B7280]">These pages use the connected account for read context or separately approved external actions.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["/briefing", "Overview", "Combines tasks with Gmail follow-ups and today's calendar."],
              ["/email", "Email outreach", "Drafts stay local; sending needs Gmail send permission and approval."],
              ["/calendar", "Calendar & meetings", "Reads events; creating a meeting requires event permission and confirmation."],
              ["/assistant", "AI assistant", "Uses available inbox and calendar context without sending or editing them."],
            ].map(([href, title, description]) => (
              <a key={href} href={href} className="rounded-xl border border-[#e8ece8] p-4 transition hover:border-[#FA8500] hover:bg-[#fffaf4]">
                <span className="text-sm font-semibold">{title} <ExternalLink size={12} className="inline" /></span>
                <p className="mt-2 text-xs leading-5 text-[#6B7280]">{description}</p>
                <span className="mt-3 inline-block text-xs font-semibold text-[#FA8500]">Open route →</span>
              </a>
            ))}
          </div>
        </section>
        {data?.connected && (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-[18px] border border-[#E3E7ED] p-5 sm:p-6 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] bg-white">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold tracking-[-0.025em]">Recent inbox</h2>
                  <p className="mt-1 text-xs text-[#6B7280] text-pretty">
                    Latest matching messages · snippets only
                  </p>
                </div>
                <Inbox size={18} className="text-[#FA8500]" />
              </div>
              {loading ? (
                <Loading />
              ) : data.emails.length ? (
                <div className="divide-y divide-[#edf1ed]">
                  {data.emails.map((email) => (
                    <article key={email.id} className="py-3 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-xs font-semibold">{email.subject}</div>
                        {email.priority && email.priority !== "NORMAL" && (
                          <span className="rounded-full bg-[#fff3e5] px-2 py-0.5 text-[10px] font-semibold text-[#995500]">
                            {email.priority === "HIGH" ? "High priority" : "Needs attention"}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-[#6B7280]">{email.from}</div>
                      {email.priorityReasons?.length > 0 && (
                        <div className="mt-1 text-[10px] text-[#9a6a2c]">
                          {email.priorityReasons.join(" · ")} · based on Gmail labels
                        </div>
                      )}
                      <p className="mt-2 text-xs leading-5 text-[#5d6961] text-pretty">
                        {email.snippet}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-3">
                        {email.date && (
                          <span className="text-[10px] text-[#9aa39e]">{email.date}</span>
                        )}
                        {email.threadId && (
                          <a
                            className="text-[10px] font-semibold text-[#FA8500] hover:underline"
                            href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(email.threadId)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open source email ↗
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty text="No matching messages found in the recent inbox." />
              )}
            </section>
            <section className="rounded-[18px] border border-[#E3E7ED] p-5 sm:p-6 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] bg-white">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold tracking-[-0.025em]">Today’s calendar</h2>
                  <p className="mt-1 text-xs text-[#6B7280] text-pretty">
                    Upcoming events from your primary calendar
                  </p>
                </div>
                <CalendarDays size={18} className="text-[#FA8500]" />
              </div>
              {loading ? (
                <Loading />
              ) : data.events.length ? (
                <div className="space-y-2">
                  {data.events.map((event) => (
                    <article key={event.id} className="rounded-xl bg-[#f7f9f6] p-3.5 min-w-0">
                      <div className="text-sm font-semibold">{event.title}</div>
                      <div className="mt-1 text-xs text-[#6B7280]">{formatDate(event.start)}</div>
                      {event.location && (
                        <div className="mt-1 text-xs text-[#87918b]">{event.location}</div>
                      )}
                      {event.link && (
                        <a
                          className="mt-2 inline-block text-xs font-semibold text-[#FA8500]"
                          href={event.link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open in Google Calendar ↗
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <Empty text="No upcoming events found for today." />
              )}
            </section>
          </div>
        )}
        <section className="mt-6 rounded-[18px] border border-[#E3E7ED] bg-white p-5 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] sm:p-6">
          <div className="mb-5">
            <h2 className="font-semibold tracking-[-0.025em]">Assistant preferences</h2>
            <p className="mt-1 text-xs leading-5 text-[#6B7280]">Choose when your daily briefing runs and how task proposals are handled by default.</p>
          </div>
          {preferencesError && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800">{preferencesError}</div>}
          {preferencesNotice && <div role="status" className="mb-4 rounded-xl border border-[#d8e9dd] bg-[#eef7f0] px-3.5 py-3 text-sm text-[#24543f]">{preferencesNotice}</div>}
          {preferencesLoading || !preferences ? (
            <div className="flex items-center gap-2 py-4 text-sm text-[#6B7280]">
              <LoaderCircle size={16} className="animate-[spin_0.9s_linear_infinite]" /> Loading preferences…
            </div>
          ) : (
            <form onSubmit={savePreferences} className="grid gap-5 md:grid-cols-2">
              <div className="space-y-4">
                <label className="flex items-start gap-3 rounded-xl bg-[#f7f9f6] p-4">
                  <input
                    type="checkbox"
                    checked={Boolean(preferences.dailyBriefingEnabled)}
                    onChange={(event) => setPreferences((current) => ({ ...current, dailyBriefingEnabled: event.target.checked }))}
                    className="mt-1 h-4 w-4 accent-[#176b52]"
                  />
                  <span>
                    <span className="block text-sm font-semibold">Daily briefing</span>
                    <span className="mt-1 block text-xs leading-5 text-[#6B7280]">Enable the scheduled daily summary of your tasks, calendar, and follow-ups.</span>
                  </span>
                </label>
                <label className="block text-xs font-semibold text-[#526159]">
                  Briefing hour (24-hour clock)
                  <select
                    value={String(preferences.briefingHour)}
                    onChange={(event) => setPreferences((current) => ({ ...current, briefingHour: Number(event.target.value) }))}
                    disabled={!preferences.dailyBriefingEnabled}
                    className="mt-2 w-full rounded-xl border border-[#dce4dd] bg-white px-3 py-3 text-sm font-normal disabled:opacity-50"
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>
                    ))}
                  </select>
                  <span className="mt-1 block font-normal text-[#89938d]">Choose the timezone used for briefing time and calendar context.</span>
                </label>
                <label className="block text-xs font-semibold text-[#526159]">
                  Account timezone (IANA)
                  <input
                    type="text"
                    value={preferences.timezone || "Asia/Karachi"}
                    onChange={(event) => setPreferences((current) => ({ ...current, timezone: event.target.value }))}
                    maxLength={100}
                    required
                    placeholder="Asia/Karachi"
                    className="mt-2 w-full rounded-xl border border-[#dce4dd] bg-white px-3 py-3 text-sm font-normal"
                  />
                  <span className="mt-1 block font-normal text-[#89938d]">Example: Asia/Karachi, Europe/London, or America/New_York.</span>
                </label>
              </div>
              <div className="space-y-4">
                <label className="block text-xs font-semibold text-[#526159]">
                  Default approval mode
                  <select
                    value={preferences.defaultApprovalMode}
                    onChange={(event) => setPreferences((current) => ({ ...current, defaultApprovalMode: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-[#dce4dd] bg-white px-3 py-3 text-sm font-normal"
                  >
                    <option value="CONFIRM">Confirm — ask before acting</option>
                    <option value="AUTO">Auto — execute eligible task actions</option>
                    <option value="BLOCK">Block — prevent task actions</option>
                  </select>
                </label>
                <p className="rounded-xl border border-[#e5ebe5] px-3.5 py-3 text-xs leading-5 text-[#6B7280]">
                  Existing action-specific rules take precedence over this default. Global automation pause still blocks execution.
                </p>
              </div>
              <div className="md:col-span-2">
                <Button
                  htmlType="submit"
                  loading={preferencesSaving}
                  disabled={preferencesSaving || preferencesLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FA8500] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Save preferences
                </Button>
              </div>
            </form>
          )}
        </section>

        {data?.user && (
          <section className="mt-6 flex flex-col gap-4 rounded-[18px] border border-[#E3E7ED] bg-white p-5 shadow-[0_2px_4px_rgb(35_48_68/5%),0_12px_34px_rgb(35_48_68/7%)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h2 className="font-semibold tracking-[-0.025em]">Your account</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#6B7280] text-pretty">
                Export your Assistant data or securely log out of this account.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/api/account/export"
                className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#dfe6dd] bg-white px-4 py-2.5 text-sm font-semibold text-[#526159] hover:bg-[#fafbf9]"
              >
                Download data export <ExternalLink size={14} />
              </a>
              <Button
                onClick={() => void logout()}
                loading={loggingOut}
                disabled={loggingOut || busy}
                className="inline-flex items-center gap-2 rounded-xl border border-[#e2e8e0] px-4 py-2.5 text-sm font-semibold hover:bg-[#fafbf9]"
              >
                Log out
              </Button>
            </div>
          </section>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[#87918b]">
          <span>OAuth credentials stay server-side and stored tokens are encrypted at rest.</span>
        </div>
      </div>
    </main>
  );
}
function Permission({ title, description, icon }) {
  return (
    <div className="flex gap-3 rounded-xl bg-[#f7f9f6] p-3.5">
      <div className="mt-0.5 text-[#FA8500]">{icon}</div>
      <div>
        <div className="text-xs font-semibold">{title}</div>
        <p className="mt-1 text-[11px] leading-5 text-[#6B7280] text-pretty">{description}</p>
      </div>
    </div>
  );
}
function Loading() {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-[#6B7280]">
      <LoaderCircle size={16} className="animate-[spin_0.9s_linear_infinite]" /> Loading live Google
      data…
    </div>
  );
}
function Empty({ text }) {
  return <p className="py-8 text-sm text-[#6B7280] text-pretty">{text}</p>;
}
