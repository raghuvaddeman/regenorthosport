import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { isAuthorizedInternalRequest } from '@/lib/telephony/internal-auth';

// The worker is considered "online" if it has reported in within this window.
// Should stay comfortably above the worker's own heartbeat interval (15s).
const ONLINE_THRESHOLD_MS = 45_000;

const HEARTBEAT_TABLE = process.env.SUPABASE_HEARTBEAT_TABLE ?? 'agent_heartbeats';
const WORKER_ID = 'default';

/**
 * GET: Report whether the persistent agent worker has checked in recently,
 * so the dashboard can show an Online/Offline indicator without a terminal.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(HEARTBEAT_TABLE)
      .select('last_seen_at')
      .eq('worker_id', WORKER_ID)
      .maybeSingle();

    if (error) throw error;

    const lastSeenAt = data?.last_seen_at ?? null;
    const online = lastSeenAt
      ? Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS
      : false;

    return NextResponse.json({ success: true, data: { online, lastSeenAt } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST: Called by the standalone agent worker process on an interval to
 * report that it's alive. Authenticated via the shared internal secret
 * since the worker has no Clerk session.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isAuthorizedInternalRequest(request)) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from(HEARTBEAT_TABLE)
      .upsert({ worker_id: WORKER_ID, last_seen_at: new Date().toISOString() });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
