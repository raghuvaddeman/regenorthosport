// lib/auth/session.ts
// Server-only: derives the signed-in tenant (client_id) and role from the
// Clerk session for API routes. NEVER trust a client-supplied clientId/role —
// accepting one from a query param or request body would let any logged-in
// user read another tenant's data, or grant themselves a higher role, just
// by editing the request (classic IDOR / privilege-escalation hole).

import { auth, clerkClient } from "@clerk/nextjs/server";
import { DEFAULT_ROLE, isRole, roleOf, type Role } from "@/lib/roles";

export type SessionInfo = { userId: string; clientId: string; role: Role };

// The JWT's sessionClaims.metadata claim can go stale until the user's next
// sign-in (e.g. right after a role change), so fall back to a live Clerk
// lookup for whichever field is missing from the token.
export async function getSessionInfo(): Promise<SessionInfo | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const tokenMeta = sessionClaims?.metadata as { clientId?: string; role?: string } | undefined;
  let clientId = tokenMeta?.clientId;
  let role = isRole(tokenMeta?.role) ? tokenMeta.role : undefined;

  if (!clientId || !role) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    clientId = clientId ?? (user.publicMetadata.clientId as string | undefined);
    role = role ?? roleOf(user.publicMetadata);
  }

  if (!clientId) return null;
  return { userId, clientId, role: role ?? DEFAULT_ROLE };
}
