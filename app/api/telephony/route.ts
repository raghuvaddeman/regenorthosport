import { NextRequest, NextResponse } from 'next/server';
import { getSessionInfo } from '@/lib/auth/session';
import { isManagerOrAbove } from '@/lib/roles';
import {
  createVobizInboundTrunk,
  createVobizOutboundTrunk,
  createInboundDispatchRule,
  dispatchOutboundCall,
  deleteTrunk,
  addInboundTrunkNumbers,
  listInboundTrunks,
  listOutboundTrunks,
  listDispatchRules,
} from '@/lib/telephony/livekit-sip';
import { isAuthorizedInternalRequest } from '@/lib/telephony/internal-auth';

/**
 * GET: Report the current LiveKit <-> Vobiz SIP infrastructure status
 * (configured trunks + dispatch rules) so the dashboard can show connection health.
 */
export async function GET() {
  try {
    const session = await getSessionInfo();
    if (!session || !isManagerOrAbove(session.role)) {
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
    if (!isAuthorizedInternalRequest(request)) {
      const session = await getSessionInfo();
      if (!session || !isManagerOrAbove(session.role)) {
        return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
      }
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

    if (action === 'add_trunk_numbers') {
      const { sipTrunkId, numbers } = body;
      if (!sipTrunkId || !Array.isArray(numbers) || numbers.length === 0) {
        return NextResponse.json(
          { success: false, error: 'sipTrunkId and a non-empty numbers array are required.' },
          { status: 400 }
        );
      }

      const updated = await addInboundTrunkNumbers(sipTrunkId, numbers);
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'trigger_outbound') {
      const { toNumber, roomName, sipTrunkId } = body;
      if (!toNumber || !roomName) {
        return NextResponse.json(
          { success: false, error: 'toNumber and roomName are required.' },
          { status: 400 }
        );
      }

      const outboundTrunks = await listOutboundTrunks();
      if (outboundTrunks.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No outbound trunk provisioned yet. Run "provision_trunks" first.' },
          { status: 400 }
        );
      }

      const trunk = sipTrunkId
        ? outboundTrunks.find((t) => t.sipTrunkId === sipTrunkId)
        : outboundTrunks[0];
      if (!trunk) {
        return NextResponse.json(
          { success: false, error: `Outbound trunk "${sipTrunkId}" was not found.` },
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
