"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, ExternalLink, Inbox, LoaderCircle, LogOut, RefreshCw, ShieldCheck, Sparkles, Unplug } from "lucide-react";
import WorkspaceHeader from "@/components/workspace-header";
function formatDate(value) {
    if (!value)
        return "Time not set";
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    return date.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
}
export default function IntegrationsClient() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/workspace/overview", { cache: "no-store" });
            const body = await response.json();
            if (response.status === 401)
                setData({ connected: false, emails: [], events: [] });
            else {
                setData(body);
                if (!response.ok && body.error)
                    setError(body.error);
                else if (body.error)
                    setError(body.error);
            }
        }
        catch {
            setError("Could not reach the app server. Please retry.");
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);
    async function disconnect() {
        if (!window.confirm("Disconnect Google Workspace and revoke this app's stored Google access?"))
            return;
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/integrations/google/disconnect", { method: "POST" });
            if (!response.ok)
                throw new Error("Disconnect failed. Please retry.");
            setNotice("Google Workspace disconnected. Your app session remains active.");
            await load();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Disconnect failed.");
        }
        finally {
            setBusy(false);
        }
    }
    async function logout() { setBusy(true); await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined); window.location.assign("/"); }
    return _jsxs("main", { className: "min-h-screen bg-[#f7f8f5] text-[#18211f]", children: [_jsx(WorkspaceHeader, {}), _jsxs("div", { className: "mx-auto max-w-6xl px-5 py-8 sm:px-8", children: [_jsxs("div", { className: "mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#176b52]", children: [_jsx(ShieldCheck, { size: 14 }), " Workspace settings"] }), _jsxs("div", { className: "mb-8 flex flex-wrap items-end justify-between gap-4", children: [_jsxs("div", { children: [_jsxs("div", { className: "mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#176b52]", children: [_jsx(Sparkles, { size: 14 }), " Workspace connections"] }), _jsx("h1", { className: "text-3xl font-semibold tracking-tight", children: "Connect your workday." }), _jsx("p", { className: "mt-2 max-w-xl text-sm leading-6 text-[#76817c]", children: "Connect Gmail and Google Calendar to surface the work that matters and send outreach or schedule meetings only after review and explicit confirmation." })] }), _jsxs("button", { onClick: () => void load(), disabled: loading || busy, className: "inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] bg-white px-4 py-2.5 text-sm font-medium hover:bg-[#fafbf9] disabled:opacity-50", children: [_jsx(RefreshCw, { size: 15, className: loading ? "animate-spin" : "" }), " Refresh"] })] }), error && _jsx("div", { role: "alert", className: "mb-5 rounded-xl border border-[#f0d6cc] bg-[#fff5f0] px-4 py-3 text-sm text-[#994b36]", children: error }), notice && _jsx("div", { role: "status", className: "mb-5 rounded-xl border border-[#d8e9dd] bg-[#eef7f0] px-4 py-3 text-sm text-[#24543f]", children: notice }), _jsxs("section", { className: "mb-6 rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-7", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-5", children: [_jsxs("div", { className: "flex items-start gap-4", children: [_jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f0ff] text-[#356ac3]", children: _jsx("span", { className: "text-lg font-bold", children: "G" }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-base font-semibold", children: "Google Workspace" }), _jsx("p", { className: "mt-1 text-sm text-[#76817c]", children: "Gmail inbox and primary calendar" }), _jsxs("div", { className: "mt-3 flex items-center gap-2 text-xs text-[#76817c]", children: [_jsx(ShieldCheck, { size: 14, className: "text-[#176b52]" }), " Gmail read + approved sending \u00B7 Calendar read + approved event creation"] }), data?.connected && _jsxs("div", { className: "mt-3 flex items-center gap-2 text-sm font-medium text-[#176b52]", children: [_jsx(CheckCircle2, { size: 16 }), " Connected as ", data.integration?.email ?? data.user?.email] })] })] }), loading ? _jsxs("div", { className: "flex items-center gap-2 text-sm text-[#76817c]", children: [_jsx(LoaderCircle, { size: 16, className: "animate-spin" }), " Checking connection\u2026"] }) : data?.connected ? _jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { onClick: () => void disconnect(), disabled: busy, className: "inline-flex items-center gap-2 rounded-xl border border-[#e2e8e0] px-3.5 py-2.5 text-sm font-medium hover:bg-[#fafbf9] disabled:opacity-50", children: [_jsx(Unplug, { size: 15 }), " Disconnect"] }), _jsxs("a", { href: "/api/auth/google/start", className: "inline-flex items-center gap-2 rounded-xl bg-[#176b52] px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[#10543f]", children: ["Reconnect ", _jsx(ExternalLink, { size: 14 })] })] }) : _jsxs("a", { href: "/api/auth/google/start", className: "inline-flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#10543f]", children: ["Connect Google ", _jsx(ExternalLink, { size: 14 })] })] }), data?.reauthRequired && _jsx("p", { className: "mt-4 text-sm text-[#9b6425]", children: "Your Google session needs reconnecting. Connect Google again to continue." }), _jsxs("div", { className: "mt-6 grid gap-3 border-t border-[#edf0ec] pt-5 sm:grid-cols-3", children: [_jsx(Permission, { title: "Gmail", description: "Read inbox metadata and send outreach drafts only after approval", icon: _jsx(Inbox, { size: 16 }) }), _jsx(Permission, { title: "Calendar", description: "Read upcoming events and create approved meeting proposals", icon: _jsx(CalendarDays, { size: 16 }) }), _jsx(Permission, { title: "Your control", description: "Disconnect and revoke access at any time", icon: _jsx(ShieldCheck, { size: 16 }) })] })] }), data?.connected && _jsxs("div", { className: "grid gap-5 lg:grid-cols-2", children: [_jsxs("section", { className: "rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-semibold", children: "Recent inbox" }), _jsx("p", { className: "mt-1 text-xs text-[#76817c]", children: "Latest matching messages \u00B7 snippets only" })] }), _jsx(Inbox, { size: 18, className: "text-[#176b52]" })] }), loading ? _jsx(Loading, {}) : data.emails.length ? _jsx("div", { className: "divide-y divide-[#edf0ec]", children: data.emails.map(email => _jsxs("article", { className: "py-3", children: [_jsx("div", { className: "truncate text-xs font-semibold", children: email.subject }), _jsx("div", { className: "mt-1 truncate text-[11px] text-[#76817c]", children: email.from }), _jsx("p", { className: "mt-2 text-xs leading-5 text-[#5d6961]", children: email.snippet }), email.date && _jsx("div", { className: "mt-1 text-[10px] text-[#9aa39e]", children: email.date })] }, email.id)) }) : _jsx(Empty, { text: "No matching messages found in the recent inbox." })] }), _jsxs("section", { className: "rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-semibold", children: "Today\u2019s calendar" }), _jsx("p", { className: "mt-1 text-xs text-[#76817c]", children: "Upcoming events from your primary calendar" })] }), _jsx(CalendarDays, { size: 18, className: "text-[#176b52]" })] }), loading ? _jsx(Loading, {}) : data.events.length ? _jsx("div", { className: "space-y-2", children: data.events.map(event => _jsxs("article", { className: "rounded-xl bg-[#f8faf7] p-3.5", children: [_jsx("div", { className: "text-sm font-semibold", children: event.title }), _jsx("div", { className: "mt-1 text-xs text-[#68756d]", children: formatDate(event.start) }), event.location && _jsx("div", { className: "mt-1 text-xs text-[#87918b]", children: event.location }), event.link && _jsx("a", { className: "mt-2 inline-block text-xs font-semibold text-[#176b52]", href: event.link, target: "_blank", rel: "noreferrer", children: "Open in Google Calendar \u2197" })] }, event.id)) }) : _jsx(Empty, { text: "No upcoming events found for today." })] })] }), _jsxs("div", { className: "mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[#87918b]", children: [_jsx("span", { children: "OAuth credentials stay server-side and stored tokens are encrypted at rest." }), data?.user && _jsxs("button", { onClick: () => void logout(), disabled: busy, className: "inline-flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white", children: [_jsx(LogOut, { size: 14 }), " Sign out ", data.user.email] })] })] })] });
}
function Permission({ title, description, icon }) { return _jsxs("div", { className: "flex gap-3 rounded-xl bg-[#f8faf7] p-3.5", children: [_jsx("div", { className: "mt-0.5 text-[#176b52]", children: icon }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-semibold", children: title }), _jsx("p", { className: "mt-1 text-[11px] leading-5 text-[#76817c]", children: description })] })] }); }
function Loading() { return _jsxs("div", { className: "flex items-center gap-2 py-8 text-sm text-[#76817c]", children: [_jsx(LoaderCircle, { size: 16, className: "animate-spin" }), " Loading live Google data\u2026"] }); }
function Empty({ text }) { return _jsx("p", { className: "py-8 text-sm text-[#76817c]", children: text }); }
