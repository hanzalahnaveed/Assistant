"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, MessageCircle, Plus, Send, Sparkles } from "lucide-react";
import WorkspaceHeader from "@/components/workspace-header";
export default function AssistantClient() {
    const [conversations, setConversations] = useState([]);
    const [conversationId, setConversationId] = useState("");
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const loadConversations = useCallback(async () => {
        try {
            const response = await fetch("/api/chat", { cache: "no-store" });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error || "Could not load conversations.");
            setConversations(body.conversations);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not load conversations.");
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void loadConversations(); }, [loadConversations]);
    async function openConversation(id) {
        setError("");
        setConversationId(id);
        try {
            const response = await fetch(`/api/chat/${id}`, { cache: "no-store" });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error || "Could not load conversation.");
            setMessages(body.conversation.messages);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not load conversation.");
        }
    }
    function newConversation() { setConversationId(""); setMessages([]); setInput(""); setError(""); }
    async function sendMessage(event) {
        event.preventDefault();
        const message = input.trim();
        if (!message || sending)
            return;
        setSending(true);
        setError("");
        setInput("");
        setMessages(current => [...current, { id: `local-${Date.now()}`, role: "user", content: message }]);
        try {
            const response = await fetch("/api/chat", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) })
            });
            const body = await response.json();
            if (!response.ok) {
                if (body.conversationId)
                    setConversationId(body.conversationId);
                throw new Error(body.error || "The assistant could not respond.");
            }
            setConversationId(body.conversationId);
            setMessages(current => [...current.filter(item => !item.id.startsWith("local-")), body.userMessage, body.assistantMessage]);
            await loadConversations();
        }
        catch (e) {
            setMessages(current => current.filter(item => !item.id.startsWith("local-")));
            setInput(message);
            setError(e instanceof Error ? e.message : "The assistant could not respond. Your draft has been restored so you can retry.");
        }
        finally {
            setSending(false);
        }
    }
    return _jsxs("main", { className: "min-h-screen bg-[#f7f8f5] text-[#18211f]", children: [_jsx(WorkspaceHeader, {}), _jsxs("div", { className: "mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-7 lg:grid-cols-[260px_minmax(0,1fr)]", children: [_jsxs("aside", { className: "rounded-2xl border border-[#e2e8e0] bg-white p-4", children: [_jsxs("div", { className: "mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#176b52]", children: [_jsx(Sparkles, { size: 14 }), " Your conversations"] }), _jsxs("button", { onClick: newConversation, className: "mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#176b52] px-3 py-2.5 text-sm font-semibold text-white", children: [_jsx(Plus, { size: 15 }), " New conversation"] }), _jsx("h2", { className: "mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[#87918b]", children: "Recent conversations" }), loading ? _jsx("p", { className: "py-4 text-xs text-[#87918b]", children: "Loading\u2026" }) : conversations.length ? _jsx("div", { className: "space-y-1", children: conversations.map(item => _jsxs("button", { onClick: () => void openConversation(item.id), className: `flex w-full items-start gap-2 rounded-lg px-2.5 py-2.5 text-left text-xs ${conversationId === item.id ? "bg-[#e7f3ed] text-[#176b52]" : "text-[#59665e] hover:bg-[#f7f8f5]"}`, children: [_jsx(MessageCircle, { size: 14, className: "mt-0.5 shrink-0" }), _jsx("span", { className: "line-clamp-2", children: item.title || "New conversation" })] }, item.id)) }) : _jsx("p", { className: "py-3 text-xs leading-5 text-[#87918b]", children: "Your saved chats will appear here." })] }), _jsxs("section", { className: "flex min-h-[78vh] flex-col overflow-hidden rounded-2xl border border-[#e2e8e0] bg-white", children: [_jsxs("header", { className: "flex items-center gap-3 border-b border-[#edf0ec] bg-[#fbfcfa] px-5 py-4", children: [_jsx("div", { className: "flex h-9 w-9 items-center justify-center rounded-xl bg-[#176b52] text-white", children: _jsx(Sparkles, { size: 17 }) }), _jsxs("div", { children: [_jsx("h1", { className: "text-sm font-semibold", children: "Your executive assistant" }), _jsx("p", { className: "mt-1 text-[11px] text-[#76817c]", children: "AI chat with persistent conversation history and task context" })] })] }), error && _jsxs("div", { role: "alert", className: "mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900", children: [error, error.toLowerCase().includes("connect google") && _jsx("a", { href: "/api/auth/google/start", className: "ml-1 font-semibold underline", children: "Connect Google" })] }), _jsxs("div", { className: "flex-1 space-y-4 p-5 sm:p-7", children: [messages.length === 0 && _jsxs("div", { className: "mx-auto max-w-lg py-12 text-center", children: [_jsx("div", { className: "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e7f3ed] text-[#176b52]", children: _jsx(Sparkles, { size: 22 }) }), _jsx("h2", { className: "text-lg font-semibold", children: "What would you like to move forward?" }), _jsx("p", { className: "mt-2 text-sm leading-6 text-[#76817c]", children: "Ask for help prioritizing tasks, preparing for a meeting, planning your week, or drafting a message. Replies use your open-task context." }), _jsx("div", { className: "mt-5 flex flex-wrap justify-center gap-2", children: ["Help me prioritize my tasks", "Plan a productive day", "Draft a concise follow-up"].map(suggestion => _jsx("button", { onClick: () => setInput(suggestion), className: "rounded-full border border-[#dfe6dd] px-3 py-2 text-xs text-[#59665e] hover:border-[#a9c8b4]", children: suggestion }, suggestion)) })] }), messages.map(item => _jsxs("div", { className: `flex gap-3 ${item.role === "user" ? "justify-end" : "justify-start"}`, children: [item.role === "assistant" && _jsx("div", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e7f3ed] text-[#176b52]", children: _jsx(Sparkles, { size: 15 }) }), _jsx("div", { className: `max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${item.role === "user" ? "bg-[#176b52] text-white" : "bg-[#f5f7f3] text-[#47534c]"}`, children: item.content })] }, item.id)), sending && _jsxs("div", { className: "flex items-center gap-2 text-xs text-[#76817c]", children: [_jsx(LoaderCircle, { size: 15, className: "animate-spin" }), "Thinking\u2026"] })] }), _jsxs("form", { onSubmit: sendMessage, className: "m-4 flex items-end gap-2 rounded-xl border border-[#dfe6dd] p-2 focus-within:border-[#a4c8b0] sm:m-5", children: [_jsx("textarea", { value: input, onChange: e => setInput(e.target.value), onKeyDown: e => { if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            if (input.trim() && !sending)
                                                void sendMessage(e);
                                        } }, rows: 2, maxLength: 8000, placeholder: "Ask your assistant anything\u2026", className: "min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-[#a1aaa4]" }), _jsx("button", { "aria-label": "Send message", type: "submit", disabled: !input.trim() || sending, className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#176b52] text-white disabled:opacity-40", children: _jsx(Send, { size: 15 }) })] }), _jsx("p", { className: "px-5 pb-4 text-center text-[10px] text-[#929c95]", children: "Chat can plan and draft; it does not send emails or modify your calendar." })] })] })] });
}
