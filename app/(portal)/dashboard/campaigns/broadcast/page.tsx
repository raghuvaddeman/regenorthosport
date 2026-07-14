// app/(portal)/dashboard/campaigns/broadcast/page.tsx
"use client";

import { useState } from "react";
import { Inbox, Plus } from "lucide-react";

export default function BroadcastCampaignsPage() {
  const [showNotice, setShowNotice] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp Campaigns</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage and monitor your WhatsApp campaigns.</p>
        </div>
        <button
          onClick={() => setShowNotice(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> New Campaign
        </button>
      </div>

      {showNotice && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400">
          WhatsApp broadcasting isn&apos;t connected yet — it needs a WhatsApp Business API account. Let your developer
          know if you&apos;d like this set up.
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm ring-1 ring-black/[0.02] dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-700">
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Name</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Status</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Mode</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Progress</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Created</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="py-14 text-center">
                  <Inbox className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600" />
                  <p className="mt-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">No WhatsApp campaigns found.</p>
                  <p className="mt-1 text-xs text-zinc-400">Try creating a new campaign to get started.</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
