import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { canManageTeam, isRole, roleOf } from '@/lib/roles';
import { getSessionInfo } from '@/lib/auth/session';

function clientIdOf(publicMetadata: Record<string, unknown> | null | undefined): string | undefined {
  return (publicMetadata as { clientId?: string } | null | undefined)?.clientId;
}

/**
 * GET: List teammates (Clerk users) and pending invitations that share the
 * signed-in user's tenant, so the dashboard can show who already has access.
 */
export async function GET() {
  try {
    const session = await getSessionInfo();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing valid tenant identifier.' }, { status: 401 });
    }
    const { userId, clientId, role: callerRole } = session;
    if (!canManageTeam(callerRole)) {
      return NextResponse.json({ success: false, error: 'Only Super Admins can view the team.' }, { status: 403 });
    }

    const client = await clerkClient();
    const [userList, invitationList] = await Promise.all([
      client.users.getUserList({ limit: 500 }),
      client.invitations.getInvitationList({ status: 'pending', limit: 500 }),
    ]);

    const members = userList.data
      .filter((u) => clientIdOf(u.publicMetadata) === clientId)
      .map((u) => {
        const primaryEmail = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress
          ?? u.emailAddresses[0]?.emailAddress
          ?? '—';
        return {
          id: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(' ') || primaryEmail,
          email: primaryEmail,
          imageUrl: u.imageUrl,
          isYou: u.id === userId,
          role: roleOf(u.publicMetadata),
          createdAt: u.createdAt,
        };
      });

    const invitations = invitationList.data
      .filter((i) => clientIdOf(i.publicMetadata) === clientId)
      .map((i) => ({ id: i.id, email: i.emailAddress, role: roleOf(i.publicMetadata), createdAt: i.createdAt }));

    return NextResponse.json({ success: true, data: { members, invitations, callerRole } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST: { action: 'invite', email, role } sends a Clerk invitation scoped to
 * the caller's tenant; { action: 'revoke', invitationId } cancels a pending
 * one. Both actions are Super Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionInfo();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing valid tenant identifier.' }, { status: 401 });
    }
    const { clientId, role: callerRole } = session;
    if (!canManageTeam(callerRole)) {
      return NextResponse.json({ success: false, error: 'Only Super Admins can manage the team.' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;
    const client = await clerkClient();

    if (action === 'invite') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 });
      }
      if (!isRole(body.role)) {
        return NextResponse.json({ success: false, error: 'Choose a role for this teammate.' }, { status: 400 });
      }

      const invitation = await client.invitations.createInvitation({
        emailAddress: email,
        publicMetadata: { clientId, role: body.role },
        notify: true,
      });

      return NextResponse.json({
        success: true,
        data: { id: invitation.id, email: invitation.emailAddress, role: body.role, createdAt: invitation.createdAt },
      });
    }

    if (action === 'revoke') {
      const invitationId = String(body.invitationId || '');
      if (!invitationId) {
        return NextResponse.json({ success: false, error: 'Missing invitationId.' }, { status: 400 });
      }

      // Confirm the invitation belongs to this tenant before revoking it —
      // never trust the invitationId alone for a cross-tenant action.
      const invitationList = await client.invitations.getInvitationList({ status: 'pending', limit: 500 });
      const target = invitationList.data.find((i) => i.id === invitationId);
      if (!target || clientIdOf(target.publicMetadata) !== clientId) {
        return NextResponse.json({ success: false, error: 'Invitation not found.' }, { status: 404 });
      }

      await client.invitations.revokeInvitation(invitationId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unknown action.' }, { status: 400 });
  } catch (error: any) {
    const message = /already/i.test(error?.errors?.[0]?.message || error?.message || '')
      ? 'That email has already been invited or already has an account.'
      : (error.message || 'Failed to process request.');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
