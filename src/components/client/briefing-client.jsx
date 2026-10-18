"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarDays, Clock3, Inbox, ListTodo, LoaderCircle, RefreshCw, Target } from "lucide-react";
function Metric({ label, value, icon }) {
    return _jsxs("div", { className: "rounded-2xl border border-[#e7ebe7] bg-white p-5", children: [_jsxs("div", { className: "flex items-center justify-between text-[#76817c]", children: [_jsx("span", { className: "text-xs font-medium", children: label }), icon] }), _jsx("div", { className: "mt-4 text-3xl font-semibold tracking-tight text-[#18211f]", children: value })] });
}
export default function BriefingClient() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(async (refresh = false) => {
        if (refresh)
            setRefreshing(true);
        else
            setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/workspace/briefing", { cache: "no-store" });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error || "Could not load your overview.");
            setData(body);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not load your overview.");
        }
        finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);
    return _jsxs("main", { className: "min-h-screen bg-[#f8faf7] text-[#18211f]", children: [_jsxs("div", { className: "mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10", children: [_jsxs("div", { className: "mb-8 flex flex-wrap items-end justify-between gap-4", children: [_jsxs("div", { children: [_jsx("div", { className: "mb-2 text-xs font-semibold uppercase tracking-[.14em] text-[#176b52]", children: "Overview" }), _jsxs("h1", { className: "text-3xl font-semibold tracking-tight", children: [data?.greeting ?? "Your day, under control", "."] }), _jsx("p", { className: "mt-2 max-w-2xl text-sm leading-6 text-[#76817c]", children: data?.summary ?? "A clear summary of your tasks, calendar, and inbox." })] }), _jsxs("button", { onClick: () => void load(true), disabled: refreshing || loading, className: "inline-flex items-center gap-2 rounded-xl border border-[#dfe6dd] bg-white px-4 py-2.5 text-sm font-medium hover:bg-[#fafbf9] disabled:opacity-50", children: [_jsx(RefreshCw, { size: 15, className: refreshing ? "animate-spin" : "" }), " Refresh"] })] }), error && _jsxs("div", { role: "alert", className: "mb-5 flex gap-2 rounded-xl border border-[#f0d6cc] bg-[#fff5f0] px-4 py-3 text-sm text-[#994b36]", children: [_jsx(AlertCircle, { size: 17, className: "mt-0.5 shrink-0" }), error] }), data?.workspaceError && _jsxs("div", { role: "status", className: "mb-5 rounded-xl border border-[#eadfc7] bg-[#fffaf0] px-4 py-3 text-sm text-[#87642c]", children: ["Some Google Workspace data could not be refreshed. ", _jsx("a", { href: "/integrations", className: "ml-1 font-semibold underline", children: "Check connection" })] }), loading && !data
                        ? _jsxs("div", { className: "flex items-center gap-3 rounded-2xl border border-[#e7ebe7] bg-white p-8 text-sm text-[#76817c]", children: [_jsx(LoaderCircle, { size: 18, className: "animate-spin" }), " Building your overview\u2026"] })
                        : data && _jsxs("section", { "aria-label": "Today's summary", className: "grid gap-4 sm:grid-cols-2 xl:grid-cols-3", children: [_jsx(Metric, { label: "Open tasks", value: data.metrics.openTasks, icon: _jsx(ListTodo, { size: 18 }) }), _jsx(Metric, { label: "Overdue", value: data.metrics.overdueTasks, icon: _jsx(AlertCircle, { size: 18 }) }), _jsx(Metric, { label: "Due today", value: data.metrics.dueTodayTasks, icon: _jsx(Clock3, { size: 18 }) }), _jsx(Metric, { label: "High priority", value: data.metrics.highPriorityTasks, icon: _jsx(Target, { size: 18 }) }), _jsx(Metric, { label: "Today's events", value: data.metrics.events, icon: _jsx(CalendarDays, { size: 18 }) }), _jsx(Metric, { label: "Follow-up emails", value: data.metrics.followUps, icon: _jsx(Inbox, { size: 18 }) })] })] })] });
}
