"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Check, LoaderCircle, Trash2, X } from "lucide-react";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("The notification service returned an invalid response.");
  }
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [briefings, setBriefings] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not load notifications.");
      setNotifications(data.notifications || []);
      setBriefings(data.briefings || []);
      setUnreadCount(data.unreadCount || 0);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  async function markRead(item, type) {
    const id = type === "briefing" ? item.id : item.id;
    const key = type + ":" + id;
    setBusyId(key);
    setError("");
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(type === "briefing" ? { briefingId: id } : { notificationId: id }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not mark item as read.");
      if (type === "briefing") {
        setBriefings((current) => current.map((entry) => entry.id === id ? { ...entry, readAt: new Date().toISOString() } : entry));
      } else {
        setNotifications((current) => current.map((entry) => entry.id === id ? { ...entry, readAt: new Date().toISOString() } : entry));
      }
      setUnreadCount((count) => Math.max(0, count - (item.readAt ? 0 : 1)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not mark item as read.");
    } finally {
      setBusyId("");
    }
  }

  async function remove(item, type) {
    const label = type === "briefing" ? "briefing" : "notification";
    if (!window.confirm("Delete this " + label + "?")) return;
    const id = item.id;
    const key = type + ":" + id;
    setBusyId(key);
    setError("");
    try {
      const response = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(type === "briefing" ? { briefingId: id } : { notificationId: id }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not delete " + label + ".");
      if (type === "briefing") setBriefings((current) => current.filter((entry) => entry.id !== id));
      else setNotifications((current) => current.filter((entry) => entry.id !== id));
      if (!item.readAt) setUnreadCount((count) => Math.max(0, count - 1));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete " + label + ".");
    } finally {
      setBusyId("");
    }
  }

  async function markAllRead() {
    setBusyId("all");
    setError("");
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not mark everything as read.");
      const now = new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || now })));
      setBriefings((current) => current.map((item) => ({ ...item, readAt: item.readAt || now })));
      setUnreadCount(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not mark everything as read.");
    } finally {
      setBusyId("");
    }
  }

  async function clearRead() {
    if (!window.confirm("Delete all read notifications and briefings?")) return;
    setBusyId("clear");
    setError("");
    try {
      const response = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clearRead: true }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Could not clear read items.");
      setNotifications((current) => current.filter((item) => !item.readAt));
      setBriefings((current) => current.filter((item) => !item.readAt));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not clear read items.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        aria-label={"Notifications" + (unreadCount ? ", " + unreadCount + " unread" : "")}
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void load();
        }}
        className="relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10 max-[760px]:w-10 max-[760px]:justify-center max-[760px]:px-0"
      >
        <Bell size={18} />
        <span className="max-[760px]:hidden">Notifications</span>
        {unreadCount > 0 && (
          <span className="ml-auto rounded-full bg-[#FA8500] px-2 py-0.5 text-[10px] font-bold text-white max-[760px]:absolute max-[760px]:right-0 max-[760px]:top-0">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-5 left-[76px] z-[120] flex max-h-[80vh] w-[min(420px,calc(100vw-88px))] flex-col overflow-hidden rounded-2xl border border-[#E3E7ED] bg-white text-[#344054] shadow-2xl min-[761px]:left-[228px]">
          <div className="flex items-center justify-between gap-3 border-b border-[#E8EBF0] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Notifications</h2>
              <p className="mt-0.5 text-[11px] text-[#7B8492]">{unreadCount} unread</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => void markAllRead()} disabled={unreadCount === 0 || Boolean(busyId)} className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-[#176b52] hover:bg-[#eff7f1] disabled:opacity-40">
                Mark all read
              </button>
              <button type="button" onClick={() => void clearRead()} disabled={Boolean(busyId) || (!notifications.some((item) => item.readAt) && !briefings.some((item) => item.readAt))} title="Delete all read items" aria-label="Delete all read items" className="rounded-lg p-1.5 text-[#8A919C] hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40">
                <Trash2 size={14} />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded-lg p-1.5 text-[#8A919C] hover:bg-[#F3F5F7]">
                <X size={15} />
              </button>
            </div>
          </div>

          {error && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-800">{error}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading ? (
              <p className="flex items-center gap-2 px-2 py-6 text-xs text-[#7B8492]"><LoaderCircle size={14} className="animate-spin" /> Loading…</p>
            ) : notifications.length === 0 && briefings.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs text-[#7B8492]">No notifications or saved briefings.</p>
            ) : (
              <div className="space-y-3">
                {notifications.length > 0 && (
                  <section>
                    <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#98A2B3]">Activity</h3>
                    <div className="space-y-2">
                      {notifications.map((item) => (
                        <article key={item.id} className={"rounded-xl border p-3 " + (item.readAt ? "border-[#E8EBF0] bg-white" : "border-[#F6D9BA] bg-[#FFFAF4]")}>
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold">{item.title}</p>
                              <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#667085]">{item.body}</p>
                              <p className="mt-2 text-[10px] text-[#98A2B3]">{formatDate(item.createdAt)}</p>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              {!item.readAt && <button type="button" aria-label="Mark notification read" onClick={() => void markRead(item, "notification")} disabled={Boolean(busyId)} className="rounded-md p-1.5 text-[#176b52] hover:bg-[#eff7f1] disabled:opacity-40"><Check size={13} /></button>}
                              <button type="button" aria-label="Delete notification" onClick={() => void remove(item, "notification")} disabled={Boolean(busyId)} className="rounded-md p-1.5 text-[#A05A4A] hover:bg-rose-50 disabled:opacity-40"><Trash2 size={13} /></button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {briefings.length > 0 && (
                  <section>
                    <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#98A2B3]">Saved briefings</h3>
                    <div className="space-y-2">
                      {briefings.map((item) => (
                        <article key={item.id} className={"rounded-xl border p-3 " + (item.readAt ? "border-[#E8EBF0] bg-white" : "border-[#F6D9BA] bg-[#FFFAF4]")}>
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold">Daily briefing · {item.localDate}</p>
                              <p className="mt-1 line-clamp-3 text-xs leading-5 text-[#667085]">{item.summary}</p>
                              <p className="mt-2 text-[10px] text-[#98A2B3]">{formatDate(item.generatedAt)}</p>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              {!item.readAt && <button type="button" aria-label="Mark briefing read" onClick={() => void markRead(item, "briefing")} disabled={Boolean(busyId)} className="rounded-md p-1.5 text-[#176b52] hover:bg-[#eff7f1] disabled:opacity-40"><Check size={13} /></button>}
                              <button type="button" aria-label="Delete briefing" onClick={() => void remove(item, "briefing")} disabled={Boolean(busyId)} className="rounded-md p-1.5 text-[#A05A4A] hover:bg-rose-50 disabled:opacity-40"><Trash2 size={13} /></button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
