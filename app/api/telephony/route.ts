import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  createVobizInboundTrunk,
  createVobizOutboundTrunk,
  createInboundDispatchRule,
  dispatchOutboundCall,
  deleteTrunk,
  listInboundTrunks,
  listOutboundTrunks,
  listDispatchRules,
} from '@/lib/telephony/livekit-sip';

/**
 * Allows server-to-server / terminal (curl) callers to authenticate with a
 * shared secret instead of a Clerk session, via the `x-internal-secret`
 * header. Only enabled when INTERNAL_SECRET_KEY is set — never falls open.
 */
function isAuthorizedInternalRequest(request: NextRequest): boolean {
  const secret = process.env.INTERNAL_SECRET_KEY;
  const provided = request.headers.get('x-internal-secret');
  if (!secret || !provided) return false;

  const secretBuf = Buffer.from(secret);
  const providedBuf = Buffer.from(provided);
  if (secretBuf.length !== providedBuf.length) return false;

  return crypto.timingSafeEqual(secretBuf, providedBuf);
}

/**
 * GET: Report the current LiveKit <-> Vobiz SIP infrastructure status
 * (configured trunks + dispatch rules) so the dashboard can show connection health.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const [inboundTrunks, outboundTrunks, dispatchRules] = await Promise.all([
      listInboundTrunks(),
      listOutboundTrunks(),
      listDispatchRules(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        connected: inboundTrunks.length > 0 || outboundTrunks.length > 0,
        inboundTrunks,
        outboundTrunks,
        dispatchRules,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST: Provision the Vobiz <-> LiveKit SIP infrastructure, or trigger an
 * outbound call dispatch.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId && !isAuthorizedInternalRequest(request)) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'provision_trunks') {
      const numbers = body.numbers;
      if (!Array.isArray(numbers) || numbers.length === 0) {
        return NextResponse.json(
          { success: false, error: 'At least one phone number is required to provision trunks.' },
          { status: 400 }
        );
      }

      const inboundTrunk = await createVobizInboundTrunk('Vobiz Inbound Trunk', numbers);
      const dispatchRule = await createInboundDispatchRule(
        { type: 'individual', roomPrefix: 'call' },
        [inboundTrunk.sipTrunkId]
      );
      const outboundTrunk = await createVobizOutboundTrunk('Vobiz Outbound Trunk', numbers);

      return NextResponse.json({
        success: true,
        data: { inboundTrunk, dispatchRule, outboundTrunk },
      });
    }

    if (action === 'delete_trunk') {
      const { sipTrunkId } = body;
      if (!sipTrunkId) {
        return NextResponse.json(
          { success: false, error: 'sipTrunkId is required.' },
          { status: 400 }
        );
      }

      const deleted = await deleteTrunk(sipTrunkId);
      return NextResponse.json({ success: true, data: deleted });
    }

    if (action === 'trigger_outbound') {
      const { toNumber, roomName } = body;
      if (!toNumber || !roomName) {
        return NextResponse.json(
          { success: false, error: 'toNumber and roomName are required.' },
          { status: 400 }
        );
      }

      const outboundTrunks = await listOutboundTrunks();
      const trunk = outboundTrunks[0];
      if (!trunk) {
        return NextResponse.json(
          { success: false, error: 'No outbound trunk provisioned yet. Run "provision_trunks" first.' },
          { status: 400 }
        );
      }

      const participant = await dispatchOutboundCall(trunk.sipTrunkId, toNumber, roomName);
      return NextResponse.json({ success: true, data: participant });
    }

    return NextResponse.json(
      { success: false, error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
