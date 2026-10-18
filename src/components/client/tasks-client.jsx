"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Circle, LoaderCircle, Plus, Search, Trash2, X } from "lucide-react";
const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const priorityStyle = {
    LOW: "bg-slate-100 text-slate-600", MEDIUM: "bg-amber-50 text-amber-700",
    HIGH: "bg-orange-50 text-orange-700", URGENT: "bg-rose-50 text-rose-700"
};
export default function TasksClient() {
    const [tasks, setTasks] = useState([]);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState("MEDIUM");
    const [dueAt, setDueAt] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [showComposer, setShowComposer] = useState(false);
    const [view, setView] = useState("open");
    const [query, setQuery] = useState("");
    const [priorityFilter, setPriorityFilter] = useState("ALL");
    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/tasks", { cache: "no-store" });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error || "Could not load tasks.");
            setTasks(body.tasks);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not load tasks.");
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);
    async function addTask(event) {
        event.preventDefault();
        if (!title.trim())
            return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const response = await fetch("/api/tasks", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ title, description: description || null, priority, dueAt: dueAt ? new Date(dueAt).toISOString() : null })
            });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error || "Could not create task.");
            setTasks(current => [body.task, ...current]);
            setTitle("");
            setDescription("");
            setPriority("MEDIUM");
            setDueAt("");
            setShowComposer(false);
            setView("open");
            setQuery("");
            setPriorityFilter("ALL");
            setNotice("Task saved.");
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not create task.");
        }
        finally {
            setBusy(false);
        }
    }
    async function updateTask(task, patch) {
        setError("");
        try {
            const response = await fetch(`/api/tasks/${task.id}`, {
                method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch)
            });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error || "Could not update task.");
            setTasks(current => current.map(item => item.id === task.id ? body.task : item));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not update task.");
        }
    }
    async function removeTask(task) {
        if (!window.confirm(`Remove "${task.title}" from your active tasks?`))
            return;
        try {
            const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error || "Could not remove task.");
            setTasks(current => current.filter(item => item.id !== task.id));
            setNotice("Task archived.");
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not remove task.");
        }
    }
    const open = tasks.filter(task => task.status !== "DONE" && task.status !== "CANCELLED");
    const done = tasks.filter(task => task.status === "DONE");
    const visibleTasks = tasks.filter(task => {
        const matchesView = view === "all" || (view === "completed" ? task.status === "DONE" : task.status !== "DONE" && task.status !== "CANCELLED");
        const needle = query.trim().toLowerCase();
        const matchesQuery = !needle || task.title.toLowerCase().includes(needle) || (task.description ?? "").toLowerCase().includes(needle);
        return matchesView && matchesQuery && (priorityFilter === "ALL" || task.priority === priorityFilter);
    });
    return _jsxs("main", { className: "min-h-screen bg-[#f7f8f5] text-[#18211f]", children: [_jsxs("div", { className: "mx-auto max-w-5xl px-5 py-8 sm:px-8", children: [_jsxs("div", { className: "mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#176b52]", children: [_jsx(Check, { size: 14 }), " Execution center"] }), _jsxs("div", { className: "mb-7", children: [_jsx("p", { className: "mb-2 text-xs font-semibold uppercase tracking-[.16em] text-[#176b52]", children: "Your execution space" }), _jsx("h1", { className: "text-3xl font-semibold tracking-tight", children: "My tasks" }), _jsx("p", { className: "mt-2 text-sm text-[#76817c]", children: "Tasks are saved to your account and stay in sync across sessions." })] }), error && _jsxs("div", { role: "alert", className: "mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800", children: [error, error.toLowerCase().includes("connect google") && _jsx("a", { href: "/api/auth/google/start", className: "ml-2 font-semibold underline", children: "Connect Google" })] }), notice && _jsx("div", { role: "status", className: "mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800", children: notice }), _jsxs("div", { className: "mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e2e8e0] bg-white p-4 sm:p-5", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-semibold", children: "Capture a commitment" }), _jsx("p", { className: "mt-1 text-xs leading-5 text-[#76817c]", children: "Turn a next step into a tracked task with an owner, priority, and deadline." })] }), _jsxs("button", { type: "button", onClick: () => setShowComposer(value => !value), className: "inline-flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#10543f]", children: [showComposer ? _jsx(X, { size: 16 }) : _jsx(Plus, { size: 16 }), " ", showComposer ? "Close form" : "New task"] })] }), showComposer && _jsxs("form", { onSubmit: addTask, className: "mb-7 space-y-3 rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6", children: [_jsx("h2", { className: "font-semibold", children: "New task details" }), _jsx("input", { required: true, maxLength: 200, value: title, onChange: e => setTitle(e.target.value), placeholder: "What needs to get done?", className: "w-full rounded-xl border border-[#dfe6dd] px-3.5 py-3 text-sm outline-none focus:border-[#176b52]" }), _jsx("textarea", { maxLength: 5000, value: description, onChange: e => setDescription(e.target.value), placeholder: "Notes (optional)", rows: 2, className: "w-full resize-y rounded-xl border border-[#dfe6dd] px-3.5 py-3 text-sm outline-none focus:border-[#176b52]" }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [_jsxs("label", { className: "text-xs font-medium text-[#68756d]", children: ["Priority", _jsx("select", { value: priority, onChange: e => setPriority(e.target.value), className: "mt-1.5 block w-full rounded-xl border border-[#dfe6dd] bg-white px-3 py-2.5 text-sm text-[#18211f]", children: priorities.map(item => _jsx("option", { value: item, children: item[0] + item.slice(1).toLowerCase() }, item)) })] }), _jsxs("label", { className: "text-xs font-medium text-[#68756d]", children: ["Due date and time", _jsx("input", { type: "datetime-local", value: dueAt, onChange: e => setDueAt(e.target.value), className: "mt-1.5 block w-full rounded-xl border border-[#dfe6dd] bg-white px-3 py-2.5 text-sm text-[#18211f]" })] })] }), _jsxs("button", { disabled: busy || !title.trim(), className: "inline-flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50", children: [_jsx(Plus, { size: 16 }), busy ? "Saving…" : "Save task"] })] }), _jsxs("section", { className: "mb-6 grid gap-3 sm:grid-cols-3", children: [_jsxs("div", { className: "rounded-2xl border border-[#e2e8e0] bg-white p-4", children: [_jsx("p", { className: "text-xs text-[#76817c]", children: "Active commitments" }), _jsx("div", { className: "mt-2 text-2xl font-semibold", children: open.length })] }), _jsxs("div", { className: "rounded-2xl border border-[#e2e8e0] bg-white p-4", children: [_jsx("p", { className: "text-xs text-[#76817c]", children: "High / urgent" }), _jsx("div", { className: "mt-2 text-2xl font-semibold", children: open.filter(task => task.priority === "HIGH" || task.priority === "URGENT").length })] }), _jsxs("div", { className: "rounded-2xl border border-[#e2e8e0] bg-white p-4", children: [_jsx("p", { className: "text-xs text-[#76817c]", children: "Completed" }), _jsx("div", { className: "mt-2 text-2xl font-semibold", children: done.length })] })] }), _jsxs("section", { className: "mb-6 rounded-2xl border border-[#e2e8e0] bg-white p-5 sm:p-6", children: [_jsxs("div", { className: "mb-4 flex flex-col gap-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-semibold", children: "Your task list" }), _jsx("p", { className: "mt-1 text-xs text-[#76817c]", children: "Search, filter, and update progress without losing your place." })] }), _jsx("button", { onClick: () => void load(), disabled: loading, className: "text-xs font-semibold text-[#176b52] disabled:opacity-50", children: "Refresh" })] }), _jsxs("div", { className: "flex flex-col gap-3 md:flex-row", children: [_jsxs("label", { className: "relative min-w-0 flex-1", children: [_jsx("span", { className: "sr-only", children: "Search tasks" }), _jsx(Search, { size: 16, className: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#87918b]" }), _jsx("input", { value: query, onChange: e => setQuery(e.target.value), placeholder: "Search by task or notes\u2026", className: "w-full py-2.5 pl-9 pr-3 text-sm" })] }), _jsxs("select", { "aria-label": "Filter by priority", value: priorityFilter, onChange: e => setPriorityFilter(e.target.value), className: "md:w-44", children: [_jsx("option", { value: "ALL", children: "All priorities" }), priorities.map(item => _jsx("option", { value: item, children: item[0] + item.slice(1).toLowerCase() }, item))] })] }), _jsx("div", { className: "flex flex-wrap gap-2", role: "group", "aria-label": "Task status filter", children: [{ id: "open", label: "Active", count: open.length }, { id: "completed", label: "Completed", count: done.length }, { id: "all", label: "All tasks", count: tasks.length }].map(tab => _jsxs("button", { type: "button", onClick: () => setView(tab.id), className: `rounded-xl px-3.5 py-2 text-xs font-semibold ${view === tab.id ? "bg-[#e7f3ed] text-[#176b52]" : "border border-[#e2e8e0] text-[#68756d] hover:bg-[#f8faf7]"}`, children: [tab.label, _jsx("span", { className: "ml-2 opacity-70", children: tab.count })] }, tab.id)) })] }), loading ? _jsxs("div", { className: "flex items-center gap-2 py-8 text-sm text-[#76817c]", children: [_jsx(LoaderCircle, { size: 16, className: "animate-spin" }), "Loading tasks\u2026"] }) : visibleTasks.length ? _jsx("div", { className: "divide-y divide-[#edf0ec]", children: visibleTasks.map(task => _jsx(TaskRow, { task: task, updateTask: updateTask, removeTask: removeTask }, task.id)) }) : _jsxs("div", { className: "py-10 text-center", children: [_jsx("div", { className: "text-sm font-semibold", children: query || priorityFilter !== "ALL" ? "No matching tasks" : view === "completed" ? "Nothing completed yet" : "You’re all caught up" }), _jsx("p", { className: "mt-2 text-xs leading-5 text-[#76817c]", children: query || priorityFilter !== "ALL" ? "Try changing your search or filters." : "Create a task when a new commitment comes in." }), (query || priorityFilter !== "ALL") && _jsx("button", { onClick: () => { setQuery(""); setPriorityFilter("ALL"); }, className: "mt-3 text-xs font-semibold text-[#176b52]", children: "Clear filters" })] })] })] })] });
}
function TaskRow({ task, updateTask, removeTask }) {
    return _jsxs("article", { className: "flex flex-wrap items-start gap-3 py-4", children: [_jsx("button", { "aria-label": task.status === "DONE" ? "Reopen task" : "Complete task", onClick: () => void updateTask(task, { status: task.status === "DONE" ? "TODO" : "DONE" }), className: "mt-1 text-[#176b52]", children: task.status === "DONE" ? _jsx(Check, { size: 18 }) : _jsx(Circle, { size: 18 }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: `text-sm font-medium ${task.status === "DONE" ? "text-[#929c95] line-through" : ""}`, children: task.title }), task.description && _jsx("p", { className: "mt-1 whitespace-pre-wrap text-xs leading-5 text-[#76817c]", children: task.description }), task.dueAt && _jsxs("div", { className: "mt-2 flex items-center gap-1.5 text-xs text-[#76817c]", children: [_jsx(CalendarClock, { size: 13 }), new Date(task.dueAt).toLocaleString()] })] }), _jsx("span", { className: `rounded-md px-2 py-1 text-[10px] font-semibold ${priorityStyle[task.priority]}`, children: task.priority }), _jsx("select", { "aria-label": "Task priority", value: task.priority, onChange: e => void updateTask(task, { priority: e.target.value }), className: "rounded-lg border border-[#dfe6dd] bg-white px-2 py-1.5 text-xs", children: priorities.map(p => _jsx("option", { value: p, children: p }, p)) }), _jsx("button", { "aria-label": "Archive task", onClick: () => void removeTask(task), className: "rounded-lg p-1.5 text-[#9b6a60] hover:bg-rose-50", children: _jsx(Trash2, { size: 15 }) })] });
}
