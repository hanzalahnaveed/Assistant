"use client";


import { Button } from "antd";
import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, MessageCircle, Plus, Send, Sparkles } from "lucide-react";
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
      const response = await fetch("/api/chat", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load conversations.");
      setConversations(body.conversations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load conversations.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);
  async function openConversation(id) {
    setError("");
    setConversationId(id);
    try {
      const response = await fetch(`/api/chat/${id}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load conversation.");
      setMessages(body.conversation.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load conversation.");
    }
  }
  function newConversation() {
    setConversationId("");
    setMessages([]);
    setInput("");
    setError("");
  }
  async function sendMessage(event) {
    event.preventDefault();
    const message = input.trim();
    if (!message || sending) return;
    setSending(true);
    setError("");
    setInput("");
    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        role: "user",
        content: message,
      },
    ]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message,
          ...(conversationId
            ? {
                conversationId,
              }
            : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.conversationId) setConversationId(body.conversationId);
        throw new Error(body.error || "The assistant could not respond.");
      }
      setConversationId(body.conversationId);
      setMessages((current) => [
        ...current.filter((item) => !item.id.startsWith("local-")),
        body.userMessage,
        body.assistantMessage,
      ]);
      await loadConversations();
    } catch (e) {
      setMessages((current) => current.filter((item) => !item.id.startsWith("local-")));
      setInput(message);
      setError(
        e instanceof Error
          ? e.message
          : "The assistant could not respond. Your draft has been restored so you can retry.",
      );
    } finally {
      setSending(false);
    }
  }
  return (
    <main className="min-h-screen bg-[#f7f8f5] text-[#18211f] pl-[58px] min-[421px]:pl-[72px] min-[761px]:pl-[252px]">
      <div className="mx-auto grid max-w-7xl gap-5 px-4 sm:px-7 lg:grid-cols-[260px_minmax(0,1fr)] pt-[26px] min-[761px]:pt-[clamp(26px,4vw,48px)] pb-14">
        <aside className="rounded-[18px] border border-[#e4e9e4] p-4 shadow-[0_2px_4px_rgb(25_48_36/2%),0_12px_34px_rgb(25_48_36/3%)] bg-white">
          <div className="mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#5d7d43]">
            <Sparkles size={14} /> Your conversations
          </div>
          <Button
            onClick={newConversation}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#7ba05b] shadow-[0_4px_10px_rgb(93_125_67/18%)] px-3 py-2.5 text-sm font-semibold text-white"
          >
            <Plus size={15} /> New conversation
          </Button>
          <h2 className="mb-2 text-[11px] font-semibold uppercase text-[#87918b] tracking-[-0.025em]">
            Recent conversations
          </h2>
          {loading ? (
            <p className="py-4 text-xs text-[#87918b] text-pretty">Loading…</p>
          ) : conversations.length ? (
            <div className="space-y-1">
              {conversations.map((item) => (
                <Button
                  key={item.id}
                  onClick={() => void openConversation(item.id)}
                  className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2.5 text-left text-xs ${conversationId === item.id ? "bg-[#e7f3ed] text-[#5d7d43]" : "text-[#59665e] hover:bg-[#f7f8f5]"}`}
                >
                  <MessageCircle size={14} className="mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{item.title || "New conversation"}</span>
                </Button>
              ))}
            </div>
          ) : (
            <p className="py-3 text-xs leading-5 text-[#87918b] text-pretty">
              Your saved chats will appear here.
            </p>
          )}
        </aside>
        <section className="flex min-h-[78vh] flex-col overflow-hidden rounded-[18px] border border-[#e4e9e4] shadow-[0_2px_4px_rgb(25_48_36/2%),0_12px_34px_rgb(25_48_36/3%)] bg-white">
          <header className="flex items-center gap-3 border-b border-[#e4e9e4] bg-[#fbfcfa] px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7ba05b] shadow-[0_4px_10px_rgb(93_125_67/18%)] text-white">
              <Sparkles size={17} />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-[-0.045em] leading-[1.13]">
                Your executive assistant
              </h1>
              <p className="mt-1 text-[11px] text-[#68766d] text-pretty">
                AI chat with persistent conversation history and task context
              </p>
            </div>
          </header>
          {error && (
            <div
              role="alert"
              className="mx-5 mt-4 border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900 rounded-[13px]"
            >
              {error}
              {error.toLowerCase().includes("connect google") && (
                <a href="/api/auth/google/start" className="ml-1 font-semibold underline">
                  Connect Google
                </a>
              )}
            </div>
          )}
          <div className="flex-1 space-y-4 p-5 sm:p-7">
            {messages.length === 0 && (
              <div className="mx-auto max-w-lg py-12 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#e7f3ed] text-[#5d7d43]">
                  <Sparkles size={22} />
                </div>
                <h2 className="text-lg font-semibold tracking-[-0.025em]">
                  What would you like to move forward?
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#68766d] text-pretty">
                  Ask for help prioritizing tasks, preparing for a meeting, planning your week, or
                  drafting a message. Replies use your open-task context.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {[
                    "Help me prioritize my tasks",
                    "Plan a productive day",
                    "Draft a concise follow-up",
                  ].map((suggestion) => (
                    <Button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="rounded-full border border-[#dfe6dd] px-3 py-2 text-xs text-[#59665e] hover:border-[#a9c8b4] tracking-[0.01em]"
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((item) => (
              <div
                key={item.id}
                className={`flex gap-3 ${item.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {item.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e7f3ed] text-[#5d7d43]">
                    <Sparkles size={15} />
                  </div>
                )}
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-[18px] px-4 py-3 text-sm leading-6 ${item.role === "user" ? "bg-[#7ba05b] shadow-[0_4px_10px_rgb(93_125_67/18%)] text-white" : "bg-[#f5f7f3] text-[#47534c]"}`}
                >
                  {item.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-[#68766d]">
                <LoaderCircle size={15} className="animate-[spin_0.9s_linear_infinite]" />
                Thinking…
              </div>
            )}
          </div>
          <form
            onSubmit={sendMessage}
            className="m-4 flex items-end gap-2 rounded-xl border border-[#dfe6dd] p-2 focus-within:border-[#a4c8b0] sm:m-5"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !sending) void sendMessage(e);
                }
              }}
              rows={2}
              maxLength={8000}
              placeholder="Ask your assistant anything…"
              className="min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-[#a1aaa4]"
            />
            <Button
              aria-label="Send message"
              htmlType="submit"
              disabled={!input.trim() || sending}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#7ba05b] shadow-[0_4px_10px_rgb(93_125_67/18%)] text-white disabled:opacity-40"
            >
              <Send size={15} />
            </Button>
          </form>
          <p className="px-5 pb-4 text-center text-[10px] text-[#929c95] text-pretty">
            Chat can plan and draft; it does not send emails or modify your calendar.
          </p>
        </section>
      </div>
    </main>
  );
}
