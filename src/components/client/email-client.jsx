"use client";

import { useState } from "react";
import { Mail, RefreshCw } from "lucide-react";
import EmailAgentSettings from "@/components/client/email-agent-settings";
import InboundEmailQueue from "@/components/client/inbound-email-queue";

export default function EmailClient() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <main className="min-h-screen bg-[#F8F9FA] p-4 text-[#212529] sm:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-[#233044]"><Mail size={28} /> Email inbox</h1>
            <p className="mt-2 text-sm text-[#6B7280]">Review replies and tasks extracted from incoming email. Nothing is sent without the configured permission.</p>
          </div>
          <button type="button" onClick={() => setRefreshKey((n) => n + 1)} className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium"><RefreshCw size={15} /> Refresh</button>
        </header>
        <EmailAgentSettings />
        <InboundEmailQueue key={refreshKey} />
      </div>
    </main>
  );
}
