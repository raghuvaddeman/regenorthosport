// components/team-modal.tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, Send, ShieldAlert, UserPlus, UserRound, X, XCircle } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/lib/roles";

type Member = {
  id: string;
  name: string;
  email: string;
  imageUrl: string;
  isYou: boolean;
  role: Role;
  createdAt: number;
};

type Invitation = { id: string; email: string; role: Role; createdAt: number };

const ROLE_BADGE_STYLES: Record<Role, string> = {
  super_admin: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400",
  manager: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400",
  agent: "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300",
};

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${ROLE_BADGE_STYLES[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

export function TeamModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [callerRole, setCallerRole] = useState<Role | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("manager");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function loadTeam() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/team");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load team.");
      setMembers(json.data.members);
      setInvitations(json.data.invitations);
      setCallerRole(json.data.callerRole);
    } catch (err: any) {
      setLoadError(err.message || "Failed to load team.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTeam();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleInvite() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", email: trimmed, role }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to send invite.");
      setEmail("");
      await loadTeam();
    } catch (err: any) {
      setSendError(err.message || "Failed to send invite.");
    } finally {
      setSending(false);
    }
  }

  async function handleRevoke(invitationId: string) {
    setRevokingId(invitationId);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", invitationId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to revoke invite.");
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
    } catch (err: any) {
      setLoadError(err.message || "Failed to revoke invite.");
    } finally {
      setRevokingId(null);
    }
  }

  const canManage = callerRole === "super_admin";

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invite team members"
        className="fixed inset-0 z-50 grid place-items-center p-4"
      >
        <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-600 dark:bg-zinc-800">
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-700">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                <UserPlus className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Team members</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5 p-6">
            {/* Invite form — Super Admins only */}
            {!loading && !canManage ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-xs">Only Super Admins can invite or remove teammates.</p>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Invite by email
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleInvite();
                    }}
                    placeholder="teammate@example.com"
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-zinc-600 dark:bg-zinc-900"
                  />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-zinc-600 dark:bg-zinc-900"
                  >
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleInvite}
                    disabled={sending || !email.trim()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Invite
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-zinc-400">
                  Super Admin sees and manages everything. Manager gets day-to-day operations but not Billing or Invite
                  Team. Agent only sees calls, patients, transcripts, and sentiment.
                </p>
                {sendError && <p className="mt-1.5 text-xs text-rose-500">{sendError}</p>}
              </div>
            )}

            {loadError && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-500">
                {loadError}
              </div>
            )}

            {loading ? (
              <p className="py-6 text-center text-xs text-zinc-400">Loading your team…</p>
            ) : (
              <>
                {/* Members */}
                <div>
                  <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                    Members ({members.length})
                  </h4>
                  <ul className="space-y-1.5">
                    {members.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center gap-2.5 rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-700"
                      >
                        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300">
                          <UserRound className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-100">
                            {m.name} {m.isYou && <span className="font-normal text-zinc-400">(You)</span>}
                          </p>
                          <p className="truncate text-[11px] text-zinc-400">{m.email}</p>
                        </div>
                        <RoleBadge role={m.role} />
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Pending invitations */}
                {invitations.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                      Pending invitations ({invitations.length})
                    </h4>
                    <ul className="space-y-1.5">
                      {invitations.map((i) => (
                        <li
                          key={i.id}
                          className="flex items-center gap-2.5 rounded-lg border border-dashed border-zinc-200 px-3 py-2 dark:border-zinc-600"
                        >
                          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-400">
                            <Mail className="h-3.5 w-3.5" />
                          </div>
                          <p className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-600 dark:text-zinc-300">
                            {i.email}
                          </p>
                          <RoleBadge role={i.role} />
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => handleRevoke(i.id)}
                              disabled={revokingId === i.id}
                              aria-label={`Revoke invitation for ${i.email}`}
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40 dark:hover:bg-rose-500/10"
                            >
                              {revokingId === i.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
