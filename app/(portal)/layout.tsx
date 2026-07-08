// app/(portal)/layout.tsx
"use client";

import { useState, useEffect } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { AudioPlayerProvider } from "@/components/audio-player";
import { CallsProvider, useCallsContext } from "@/lib/calls-context";
import Sidebar from "@/components/sidebar";
import { Moon, Sun, LogOut, RefreshCw, AlertCircle } from "lucide-react";

function PortalShell({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(true);

  const { signOut } = useClerk();
  const router = useRouter();
  const { calls, loading, error, refresh } = useCallsContext();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      {/* ---------- Page container ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-1 border-b border-zinc-200 bg-white px-4 dark:border-zinc-600 dark:bg-zinc-800 md:px-6">
          <span className="mr-auto text-xs text-zinc-400">
            {loading
              ? "Syncing from Supabase…"
              : error
                ? "Sync failed"
                : `${calls.length} call${calls.length === 1 ? "" : "s"} loaded`}
          </span>

          <button
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh calls"
            className="rounded-md p-2 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-100"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={() => setDark((d) => !d)}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            className="rounded-md p-2 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-100"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            className="rounded-md p-2 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-100"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
            {error && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Could not load call logs from Supabase</p>
                  <p className="mt-1 text-rose-500/80">{error}</p>
                </div>
              </div>
            )}

            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AudioPlayerProvider>
      <CallsProvider>
        <PortalShell>{children}</PortalShell>
      </CallsProvider>
    </AudioPlayerProvider>
  );
}
