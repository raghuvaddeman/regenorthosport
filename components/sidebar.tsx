"use client";
import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import {
  LayoutDashboard, PhoneCall, Users, Settings, Database,
  PhoneForwarded, FileText, BrainCircuit, ShieldAlert, Radio, Phone, CreditCard, Plug, Menu, X,
  UserCog, PhoneOutgoing, MessagesSquare, Gauge, Zap, Plus, UserPlus
} from "lucide-react";
import { TeamModal } from "@/components/team-modal";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  isBeta?: boolean;
  isNew?: boolean;
};

const navigationData: { groupName: string; items: NavItem[] }[] = [
  {
    groupName: "Project Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Call Logs", href: "/dashboard/calls", icon: PhoneCall },
      { label: "Patient Database", href: "/dashboard/patients", icon: Users },
      { label: "Transcripts & Summaries", href: "/dashboard/transcripts", icon: FileText },
      { label: "Sentiment Analysis", href: "/dashboard/sentiment", icon: BrainCircuit },
    ],
  },
  {
    groupName: "Campaigns",
    items: [
      { label: "Bulk Call", href: "/dashboard/campaigns/bulk-call", icon: PhoneOutgoing },
      { label: "Broadcast", href: "/dashboard/campaigns/broadcast", icon: MessagesSquare, isNew: true },
    ],
  },
  {
    groupName: "AI Voice Agent Config",
    items: [
      { label: "Agent Settings", href: "/dashboard/agent-settings", icon: Settings },
      { label: "Agent Actions", href: "/dashboard/agent-actions", icon: Zap },
      { label: "Knowledge Base", href: "/dashboard/knowledge-base", icon: Database },
      { label: "Voicemail & Routing", href: "/dashboard/routing", icon: PhoneForwarded },
    ],
  },
  {
    groupName: "Insights & Compliance",
    items: [
      { label: "Audit Logs", href: "/dashboard/audit-logs", icon: ShieldAlert },
    ],
  },
  {
    groupName: "Platform Integrations",
    items: [
      { label: "Providers", href: "/dashboard/providers", icon: Plug },
      { label: "EHR / EMR Sync", href: "/dashboard/ehr-sync", icon: Radio, isBeta: true },
      { label: "Phone Numbers", href: "/dashboard/numbers", icon: Phone },
      { label: "Call Performance", href: "/dashboard/performance", icon: Gauge },
      { label: "Billing & Usage", href: "/dashboard/billing", icon: CreditCard },
    ],
  },
];

function AddNewMenu() {
  const [open, setOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2 rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10 dark:hover:text-brand-400"
      >
        <Plus className="h-4 w-4" /> Add new
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-zinc-600 dark:bg-zinc-700">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setTeamOpen(true);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-zinc-200 dark:hover:bg-zinc-600/60"
          >
            <UserPlus className="h-4 w-4 text-gray-400 dark:text-zinc-400" /> Invite team member
          </button>
        </div>
      )}

      {teamOpen && <TeamModal onClose={() => setTeamOpen(false)} />}
    </div>
  );
}

function ProfileMenu() {
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || user?.username || "Account";
  const initials = ((firstName[0] ?? fullName[0] ?? "U") + (lastName[0] ?? "")).toUpperCase();
  const email = user?.primaryEmailAddress?.emailAddress ?? "—";
  const phone = user?.primaryPhoneNumber?.phoneNumber ?? "—";

  const fields = [
    { label: "First name", value: firstName || "—" },
    { label: "Last name", value: lastName || "—" },
    { label: "Email", value: email },
    { label: "Phone number", value: phone },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Profile menu"
        className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-zinc-700/50"
      >
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-900 text-[11px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-gray-900 dark:text-white">{fullName}</p>
          <p className="truncate text-[11px] text-gray-400 dark:text-zinc-500">AI Voice Dashboard</p>
        </div>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white py-2 shadow-lg dark:border-zinc-600 dark:bg-zinc-700">
          <p className="px-3 pb-2 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-zinc-500">
            Profile
          </p>
          <div className="space-y-2 px-3 pb-3">
            {fields.map((f) => (
              <div key={f.label}>
                <p className="text-[10px] text-gray-400 dark:text-zinc-500">{f.label}</p>
                <p className="truncate text-xs font-medium text-gray-900 dark:text-white">{f.value}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 px-3 pt-2 dark:border-zinc-600">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openUserProfile();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
            >
              <UserCog className="h-3.5 w-3.5" /> Manage account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 rounded-md border border-gray-200 bg-white p-2 text-gray-600 shadow-sm transition-colors hover:bg-gray-50 md:hidden dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {isOpen && <div onClick={() => setIsOpen(false)} className="fixed inset-0 z-40 bg-gray-950/20 backdrop-blur-xs md:hidden dark:bg-zinc-800/60" />}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col border-r border-gray-200 bg-white transition-transform duration-200 ease-in-out md:translate-x-0 md:static ${isOpen ? "translate-x-0" : "-translate-x-full"} dark:border-zinc-600 dark:bg-zinc-800`}>
        <div className="flex h-16 items-center border-b border-gray-200 px-6 dark:border-zinc-600">
          <Link href="/dashboard" className="flex items-center">
            <div className="rounded-md bg-white px-2 py-1.5">
              <Image
                src="/logo.png"
                alt="RegenOrthoSport"
                width={1676}
                height={220}
                priority
                className="h-6 w-auto"
              />
            </div>
          </Link>
        </div>

        <div className="px-4 pt-4">
          <AddNewMenu />
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-6">
          {navigationData.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1.5">
              <h4 className="px-3 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-zinc-500">{group.groupName}</h4>
              <ul className="space-y-0.5">
                {group.items.map((item, iIdx) => {
                  const isActive = item.href === "/dashboard" ? pathname === "/dashboard" : pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <li key={iIdx}>
                      <Link href={item.href} onClick={() => setIsOpen(false)} aria-current={isActive ? "page" : undefined} className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium transition-all ${isActive ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-zinc-400 dark:hover:bg-zinc-700/50 dark:hover:text-zinc-200"}`}>
                        <div className="flex items-center gap-2.5">
                          <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-brand-600 dark:text-brand-400" : "text-gray-400 dark:text-zinc-500"}`} />
                          <span>{item.label}</span>
                        </div>
                        {item.isBeta && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-gray-600 uppercase dark:bg-zinc-600 dark:text-zinc-400">Beta</span>}
                        {item.isNew && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-brand-600 uppercase dark:bg-brand-500/10 dark:text-brand-400">New</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-4 dark:border-zinc-600">
          <ProfileMenu />
        </div>
      </aside>
    </>
  );
}
