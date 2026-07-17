// lib/roles.ts
// Shared role definitions for dashboard access control. Roles live in each
// Clerk user's publicMetadata (alongside clientId), set at invite time via
// /api/team and read back in the sidebar, the portal layout guard, and any
// API route that needs to gate a mutation to a specific role.

export type Role = "super_admin" | "manager" | "agent";

export const ROLES: Role[] = ["super_admin", "manager", "agent"];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  agent: "Agent",
};

// Members and invitations created before roles existed have no `role` in
// publicMetadata — treat them as Super Admin so nobody who already had full
// access gets locked out by this change.
export const DEFAULT_ROLE: Role = "super_admin";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

export function roleOf(publicMetadata: Record<string, unknown> | null | undefined): Role {
  const role = (publicMetadata as { role?: unknown } | null | undefined)?.role;
  return isRole(role) ? role : DEFAULT_ROLE;
}

// Every dashboard path currently in the sidebar (components/sidebar.tsx).
const ALL_DASHBOARD_PATHS = [
  "/dashboard",
  "/dashboard/calls",
  "/dashboard/patients",
  "/dashboard/transcripts",
  "/dashboard/sentiment",
  "/dashboard/campaigns/bulk-call",
  "/dashboard/campaigns/broadcast",
  "/dashboard/agent-settings",
  "/dashboard/agent-actions",
  "/dashboard/knowledge-base",
  "/dashboard/routing",
  "/dashboard/audit-logs",
  "/dashboard/providers",
  "/dashboard/ehr-sync",
  "/dashboard/numbers",
  "/dashboard/performance",
  "/dashboard/billing",
];

// Agents only handle day-to-day calls — no settings, campaigns, integrations,
// billing, or team management.
const AGENT_PATHS = [
  "/dashboard",
  "/dashboard/calls",
  "/dashboard/patients",
  "/dashboard/transcripts",
  "/dashboard/sentiment",
];

// Managers get every operational page but not Billing (financial) — team
// management is gated separately via canManageTeam, not by path.
const MANAGER_PATHS = ALL_DASHBOARD_PATHS.filter((p) => p !== "/dashboard/billing");

const ROLE_PATHS: Record<Role, string[] | "all"> = {
  super_admin: "all",
  manager: MANAGER_PATHS,
  agent: AGENT_PATHS,
};

export function canAccessPath(role: Role, pathname: string): boolean {
  const allowed = ROLE_PATHS[role];
  if (allowed === "all") return true;
  return allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// Only Super Admins can invite or remove teammates.
export function canManageTeam(role: Role): boolean {
  return role === "super_admin";
}
