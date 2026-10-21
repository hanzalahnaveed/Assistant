"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw, Save, Settings2 } from "lucide-react";

const initial = { enabled: false, autoReplyEnabled: false, tone: "professional", style: "concise", signature: "" };

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
        if (!response.ok) throw new Error(data.error || "Could not load settings.");
        if (active) { setSettings({ ...initial, ...data.settings }); setAutomationPaused(data.automationPaused === true); }
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load settings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function runInboxNow() {
    setRunning(true); setError(""); setNotice(""); setRunResult("");
    try {
      const response = await fetch("/api/email-agent/run", { method: "POST", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.reason || "Inbox check failed.");
      setRunResult(`Checked inbox: ${data.processed || 0} processed · ${data.drafted || 0} replies prepared · ${data.failed || 0} errors.`);
      if (data.failed > 0) setError(data.failures?.[0]?.error || data.reason || "Some messages need attention.");
      window.dispatchEvent(new CustomEvent("email-agent-refresh"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Inbox check failed."); }
    finally { setRunning(false); }
  }

  async function save(event) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/email-agent/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save settings.");
      setSettings({ ...initial, ...data.settings }); setAutomationPaused(data.automationPaused === true); setNotice("Settings saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save settings."); }
    finally { setSaving(false); }
  }

  return (
    <details className="mb-4 rounded-xl border border-[#E3E7ED] bg-white p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[#233044]"><Settings2 size={17} /> Email permissions & settings <span className="ml-auto text-xs font-normal text-[#6B7280]">{settings.enabled ? "Agent on" : "Agent off"}</span></summary>
      <div className="mt-4 border-t pt-4">
        {error && <p role="alert" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle size={15} className="mr-1 inline" />{error}</p>}
        {notice && <p role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 size={15} className="mr-1 inline" />{notice}</p>}
        {runResult && <p role="status" className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{runResult}</p>}
        {automationPaused && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Automation is paused globally. Automatic replies will stay off.</p>}
        {loading ? <p className="flex items-center gap-2 py-3 text-sm text-[#6B7280]"><LoaderCircle size={15} className="animate-spin" />Loading…</p> : (
          <form onSubmit={(event) => void save(event)} className="space-y-4">
            <label className="flex items-start gap-3 rounded-lg border p-3"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked, ...(event.target.checked ? {} : { autoReplyEnabled: false }) }))} className="mt-1" /><span><strong className="block text-sm">Check incoming email</strong><span className="mt-1 block text-xs leading-5 text-[#6B7280]">Classify inbox messages and create replies or tasks.</span></span></label>
            <label className="flex items-start gap-3 rounded-lg border p-3"><input type="checkbox" checked={settings.autoReplyEnabled} disabled={!settings.enabled || automationPaused} onChange={(event) => setSettings((current) => ({ ...current, autoReplyEnabled: event.target.checked }))} className="mt-1" /><span><strong className="block text-sm">Automatically send routine replies</strong><span className="mt-1 block text-xs leading-5 text-[#6B7280]">Only safe routine replies. Meetings, tasks, sensitive messages, and uncertain classifications require your review.</span></span></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">Reply tone<select value={settings.tone} onChange={(event) => setSettings((current) => ({ ...current, tone: event.target.value }))} className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm font-normal"><option value="professional">Professional</option><option value="warm">Warm</option><option value="direct">Direct</option><option value="formal">Formal</option><option value="friendly">Friendly</option></select></label>
              <label className="text-xs font-semibold">Reply style<select value={settings.style} onChange={(event) => setSettings((current) => ({ ...current, style: event.target.value }))} className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm font-normal"><option value="concise">Concise</option><option value="detailed">Detailed</option><option value="bullet_points">Bullet points</option></select></label>
            </div>
            <label className="block text-xs font-semibold">Email signature<textarea rows={2} maxLength={2000} value={settings.signature} onChange={(event) => setSettings((current) => ({ ...current, signature: event.target.value }))} placeholder="Best regards," className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal" /></label>
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <button type="button" onClick={() => void runInboxNow()} disabled={running || saving || loading || !settings.enabled} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw size={14} className={running ? "animate-spin" : ""} />{running ? "Checking inbox…" : "Check inbox now"}</button>
              <button type="submit" disabled={saving || running || loading} className="inline-flex items-center gap-2 rounded-lg bg-[#FA8500] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save size={14} />{saving ? "Saving…" : "Save permissions"}</button>
            </div>
          </form>
        )}
      </div>
    </details>
  );
}
