"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, Save, Settings2 } from "lucide-react";

const initial = { enabled: false, autoReplyEnabled: false, tone: "professional", style: "concise", signature: "" };

export default function EmailAgentSettings() {
  const [settings, setSettings] = useState(initial);
  const [automationPaused, setAutomationPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/email-agent/settings", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load settings.");
        if (active) {
          setSettings({ ...initial, ...data.settings });
          setAutomationPaused(data.automationPaused === true);
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load settings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
      if (!response.ok) throw new Error(data.error || "Could not save settings.");
      setSettings({ ...initial, ...data.settings });
      setAutomationPaused(data.automationPaused === true);
      setNotice("Settings saved.");
      // Let the inbox queue know settings changed (e.g. agent enabled/disabled)
      window.dispatchEvent(new CustomEvent("email-agent-refresh"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  const update = (patch) => setSettings((current) => ({ ...current, ...patch }));

  return (
    <details className="mb-4 rounded-xl border border-[#E3E7ED] bg-white p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[#233044]">
        <Settings2 size={17} /> Email permissions & settings
        <span className="ml-auto text-xs font-normal text-[#6B7280]">{settings.enabled ? "Agent on" : "Agent off"}</span>
      </summary>

      <div className="mt-4 border-t pt-4">
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle size={15} className="mr-1 inline" />
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
            <CheckCircle2 size={15} className="mr-1 inline" />
            {notice}
          </p>
        )}
        {automationPaused && (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Automation is paused globally. Automatic replies will stay off.
          </p>
        )}

        {loading ? (
          <p className="flex items-center gap-2 py-3 text-sm text-[#6B7280]">
            <LoaderCircle size={15} className="animate-spin" />
            Loading…
          </p>
        ) : (
          <form onSubmit={(event) => void save(event)} className="space-y-4">
<<<<<<< HEAD
=======
<<<<<<< HEAD
            <label className="flex items-start gap-3 rounded-lg border p-3"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked, ...(event.target.checked ? {} : { autoReplyEnabled: false }) }))} className="mt-1" /><span><strong className="block text-sm">Check incoming email</strong><span className="mt-1 block text-xs leading-5 text-[#6B7280]">Classify inbox messages and create replies or tasks.</span></span></label>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950"><strong className="block">AI-generated replies are saved as drafts</strong><span className="mt-1 block text-xs leading-5">Groq reviews each new email and prepares a reply for you to review. Nothing is sent automatically; use the draft controls in the inbox when you are ready.</span></div>
=======
>>>>>>> temp-fixes
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) =>
                  update({
                    enabled: event.target.checked,
                    ...(event.target.checked ? {} : { autoReplyEnabled: false }),
                  })
                }
                className="mt-1"
              />
              <span>
                <strong className="block text-sm">Check incoming email</strong>
                <span className="mt-1 block text-xs leading-5 text-[#6B7280]">
                  Classify inbox messages and create replies or tasks.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={settings.autoReplyEnabled}
                disabled={!settings.enabled || automationPaused}
                onChange={(event) => update({ autoReplyEnabled: event.target.checked })}
                className="mt-1"
              />
              <span>
                <strong className="block text-sm">Automatically send routine replies</strong>
                <span className="mt-1 block text-xs leading-5 text-[#6B7280]">
                  Only safe routine replies. Meetings, tasks, sensitive messages, and uncertain classifications require your review.
                </span>
              </span>
            </label>

<<<<<<< HEAD
=======
>>>>>>> dd9c023 (UI Fixes)
>>>>>>> temp-fixes
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">
                Reply tone
                <select
                  value={settings.tone}
                  onChange={(event) => update({ tone: event.target.value })}
                  className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm font-normal"
                >
                  <option value="professional">Professional</option>
                  <option value="warm">Warm</option>
                  <option value="direct">Direct</option>
                  <option value="formal">Formal</option>
                  <option value="friendly">Friendly</option>
                </select>
              </label>

              <label className="text-xs font-semibold">
                Reply style
                <select
                  value={settings.style}
                  onChange={(event) => update({ style: event.target.value })}
                  className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm font-normal"
                >
                  <option value="concise">Concise</option>
                  <option value="detailed">Detailed</option>
                  <option value="bullet_points">Bullet points</option>
                </select>
              </label>
            </div>

            <label className="block text-xs font-semibold">
              Email signature
              <textarea
                rows={2}
                maxLength={2000}
                value={settings.signature}
                onChange={(event) => update({ signature: event.target.value })}
                placeholder="Best regards,"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              />
            </label>

            <div className="flex flex-wrap gap-2 border-t pt-4">
              <button
                type="submit"
                disabled={saving || loading}
                className="inline-flex items-center gap-2 rounded-lg bg-[#FA8500] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? "Saving…" : "Save permissions"}
              </button>
            </div>
          </form>
        )}
      </div>
    </details>
  );
}