// app/(portal)/layout.tsx
"use client";

import { useState, useEffect } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { AudioPlayerProvider } from "@/components/audio-player";
import { CallLogsView, AnalyticsView, SettingsView } from "@/components/views";
import { CallsProvider, useCallsContext } from "@/lib/calls-context";
import {
  LayoutDashboard,
  PhoneCall,
  BarChart3,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeft,
  Moon,
  Sun,
  Headset,
  LogOut,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "calls", label: "Call logs", icon: PhoneCall },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: SettingsIcon },
] as const;

type TabId = (typeof NAV)[number]["id"];

function PortalShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

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
      {/* ---------- Sidebar ---------- */}
      <aside
        className={`sticky top-0 flex h-screen flex-col border-r border-zinc-200 bg-white transition-[width] duration-200 dark:border-zinc-800 dark:bg-zinc-950 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-zinc-200 px-4 dark:border-zinc-800">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-indigo-600 text-white">
            <Headset className="h-4 w-4" strokeWidth={2} />
          </span>
          {!collapsed && (
            <span className="truncate text-sm font-semibold tracking-tight">
              Callwise
            </span>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-2 py-3" aria-label="Main">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                aria-current={active ? "page" : undefined}
                className={`group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                  active
                    ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-100"
                }`}
                title={collapsed ? label : undefined}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? "text-indigo-600 dark:text-indigo-400" : ""
                  }`}
                  strokeWidth={2}
                />
                {!collapsed && <span className="truncate">{label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-zinc-200 px-2 py-3 dark:border-zinc-800">
          {!collapsed && (
            <div className="px-2.5 py-2 text-xs text-zinc-400">
              {loading
                ? "Syncing from Supabase…"
                : error
                  ? "Sync failed"
                  : `${calls.length} call${calls.length === 1 ? "" : "s"} loaded`}
            </div>
          )}

          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-100"
          >
            <RefreshCw
              className={`h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`}
            />
            {!collapsed && <span>Refresh calls</span>}
          </button>

          <button
            onClick={() => setDark((d) => !d)}
            className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-100"
          >
            {dark ? (
              <Sun className="h-4 w-4 shrink-0" />
            ) : (
              <Moon className="h-4 w-4 shrink-0" />
            )}
            {!collapsed && <span>{dark ? "Light mode" : "Dark mode"}</span>}
          </button>

          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-100"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>

          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-100"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4 shrink-0" />
            ) : (
              <PanelLeftClose className="h-4 w-4 shrink-0" />
            )}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ---------- Page container ---------- */}
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

          {activeTab === "dashboard" ? (
            children
          ) : activeTab === "calls" ? (
            <CallLogsView />
          ) : activeTab === "analytics" ? (
            <AnalyticsView />
          ) : (
            <SettingsView />
          )}
        </div>
      </main>
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
