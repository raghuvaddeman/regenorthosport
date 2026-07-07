import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto/credentials';

/**
 * GET: Fetch all active/configured providers for the logged-in clinic workspace
 */
export async function GET() {
  try {
    const { sessionClaims } = await auth();
    const clientId = (sessionClaims?.metadata as any)?.clientId;

    // Strict Tenant Isolation Check
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing valid tenant identifier.' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: providers, error } = await supabase
      .from('providers')
      .select('id, client_id, provider_key, provider_name, category, status, config_json, credential_mask, is_default, last_tested_at, created_at')
      .eq('client_id', clientId);

    if (error) throw error;

    return NextResponse.json({ success: true, data: providers });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST: Connect or update a provider credential pair safely
 */
export async function POST(request: NextRequest) {
  try {
    const { sessionClaims, userId } = await auth();
    const clientId = (sessionClaims?.metadata as any)?.clientId;
    const actorUserId = userId || 'unknown_user';

    // Strict Tenant Isolation Check
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing valid tenant identifier.' }, { status: 401 });
    }

    const body = await request.json();
    const { provider_key, provider_name, category, secret_key, config_json } = body;

    if (!provider_key || !provider_name || !category || !secret_key) {
      return NextResponse.json(
        { success: false, error: 'Missing mandatory provider registration parameters.' },
        { status: 400 }
      );
    }

    const encryptedCredentials = encrypt(secret_key);
    const maskLen = secret_key.length;
    const credential_mask = maskLen <= 8 ? '****' : `${secret_key.substring(0, 4)}****${secret_key.substring(maskLen - 4)}`;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('providers')
      .upsert({
        client_id: clientId,
        provider_key,
        provider_name,
        category,
        config_json: config_json || {},
        encrypted_credentials: encryptedCredentials,
        credential_mask,
        status: 'connected',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'client_id,provider_key' })
      .select()
      .single();

    if (error) throw error;

    await supabase.from('provider_audit_logs').insert({
      client_id: clientId,
      provider_id: data.id,
      actor_user_id: actorUserId,
      action: 'connect',
      detail: { provider_key, category }
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}