"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw, Save, ShieldCheck } from "lucide-react";

const initial = {
  enabled: false,
  autoReplyEnabled: false,
  tone: "professional",
  style: "concise",
  signature: "",
};

export default function EmailAgentSettings() {
  const [settings, setSettings] = useState(initial);
  const [automationPaused, setAutomationPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/email-agent/settings", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load email-agent settings.");
        if (active) {
          setSettings({ ...initial, ...data.settings });
          setAutomationPaused(data.automationPaused === true);
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load settings.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function change(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
    setNotice("");
    setRunResult("");
  }

  async function runInboxNow() {
    setRunning(true);
    setError("");
    setNotice("");
    setRunResult("");
    try {
      const response = await fetch("/api/email-agent/run", { method: "POST", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.reason || "Inbox processing failed.");
      const summary = `Inbox check complete: ${data.processed || 0} processed, ${data.drafted || 0} drafts created, ${data.sent || 0} sent, ${data.skipped || 0} skipped, ${data.failed || 0} failed.`;
      setRunResult(summary + (data.reason ? " " + data.reason : ""));
      if (data.failed > 0) setError((data.failures?.[0]?.error || data.reason || "One or more messages failed. Check inbound email activity for details."));
      window.dispatchEvent(new CustomEvent("email-agent-refresh"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Inbox processing failed.");
    } finally {
      setRunning(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/email-agent/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save email-agent settings.");
      setSettings({ ...initial, ...data.settings });
      setAutomationPaused(data.automationPaused === true);
      setNotice("Email-agent settings saved.");
      setRunResult("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-5 rounded-[18px] border border-[#E3E7ED] bg-white p-5 shadow-[0_2px_4px_rgb(35_48_68/5%)]">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-xl bg-[#e8f3ec] p-2 text-[#24563c]"><ShieldCheck size={19} /></div>
        <div className="flex-1">
          <h2 className="font-semibold text-[#233044]">Inbound email agent</h2>
          <p className="mt-1 text-sm leading-6 text-[#6B7280]">
            The agent checks Gmail when the email worker runs, prepares replies, and routes sensitive or action-related messages for review.
          </p>
        </div>
      </div>
      {error && <p role="alert" className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle size={16} />{error}</p>}
      {notice && <p role="status" className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 size={16} />{notice}</p>}
      {runResult && <p role="status" className="mb-3 rounded-lg border border-[#DDE6F0] bg-[#F7FAFC] p-3 text-sm leading-5 text-[#344256]">{runResult}</p>}
      {automationPaused && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Global automation is paused. Automatic replies will not be sent while it remains paused.</p>}
      {loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-[#6B7280]"><LoaderCircle size={16} className="animate-spin" />Loading settings…</div>
      ) : (
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E3E7ED] p-3">
              <input type="checkbox" checked={settings.enabled} onChange={(event) => change("enabled", event.target.checked)} className="mt-1" />
              <span><span className="block text-sm font-semibold">Enable email agent</span><span className="mt-1 block text-xs leading-5 text-[#6B7280]">Read new inbox messages and create reply drafts. Off by default.</span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E3E7ED] p-3">
              <input type="checkbox" checked={settings.autoReplyEnabled} onChange={(event) => change("autoReplyEnabled", event.target.checked)} className="mt-1" />
              <span><span className="block text-sm font-semibold">Auto-send routine replies</span><span className="mt-1 block text-xs leading-5 text-[#6B7280]">Only non-sensitive routine replies. Meeting/task requests and sensitive mail always stay in review.</span></span>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">Reply tone
              <select value={settings.tone} onChange={(event) => change("tone", event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#D8DEE7] bg-white px-3 py-2.5 text-sm">
                <option value="professional">Professional</option><option value="warm">Warm</option><option value="direct">Direct</option><option value="formal">Formal</option><option value="friendly">Friendly</option>
              </select>
            </label>
            <label className="block text-sm font-medium">Reply style
              <select value={settings.style} onChange={(event) => change("style", event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#D8DEE7] bg-white px-3 py-2.5 text-sm">
                <option value="concise">Concise</option><option value="detailed">Detailed</option><option value="bullet_points">Bullet points</option>
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium">Email signature (optional)
            <textarea value={settings.signature} onChange={(event) => change("signature", event.target.value)} maxLength={2000} rows={2} placeholder="Best regards,&#10;Your name" className="mt-1.5 w-full rounded-xl border border-[#D8DEE7] px-3 py-2.5 text-sm" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EDF0EC] pt-4">
            <p className="max-w-2xl text-xs leading-5 text-[#6B7280]">Automatic replies require both this setting and the existing global automation to be unpaused. Sensitive messages never auto-send.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void runInboxNow()} disabled={running || saving || loading || !settings.enabled} className="inline-flex items-center gap-2 rounded-xl border border-[#D8DEE7] bg-white px-4 py-2.5 text-sm font-semibold text-[#233044] disabled:opacity-50"><RefreshCw size={15} className={running ? "animate-spin" : ""} />{running ? "Checking inbox…" : "Process inbox now"}</button>
              <button type="submit" disabled={saving || running} className="inline-flex items-center gap-2 rounded-xl bg-[#FA8500] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save size={15} />{saving ? "Saving…" : "Save settings"}</button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
