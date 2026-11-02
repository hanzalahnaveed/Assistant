"use client";

import { useState } from "react";
import { Mail, RefreshCw } from "lucide-react";
import EmailAgentSettings from "@/components/client/email-agent-settings";
import InboundEmailQueue from "@/components/client/inbound-email-queue";
import EmailDraftManager from "@/components/client/email-draft-manager";

export default function EmailClient() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <main className="min-h-screen bg-[#F8F9FA] p-4 text-[#212529] sm:p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-[#233044]">
              <Mail size={28} /> Email inbox
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6B7280]">
              Incoming messages appear newest first. Open an email to read its full content and review the prepared reply. Replies are never sent automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((n) => n + 1)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E3E7ED] bg-white px-3 py-2 text-sm font-medium text-[#344054] transition hover:bg-[#F3F5F7]"
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </header>
        <EmailAgentSettings />
        <EmailDraftManager />
        <InboundEmailQueue key={refreshKey} />
      </div>
    </main>
  );
}
