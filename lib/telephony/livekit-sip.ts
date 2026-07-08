import { SipClient } from "livekit-server-sdk";
import { SIPTransport, ListUpdate } from "@livekit/protocol";
import type {
  CreateSipParticipantOptions,
  SipDispatchRuleCallee,
  SipDispatchRuleDirect,
  SipDispatchRuleIndividual,
} from "livekit-server-sdk";

// Global infra-level LiveKit <-> Vobiz SIP trunk config, kept separate from
// the per-tenant provider credentials stored (encrypted) in Supabase — see
// lib/registry.ts / app/api/providers/route.ts for that unrelated flow.

let sipClient: SipClient | null = null;

/** Lazily builds the singleton LiveKit SIP client from server-only env vars. */
function getSipClient(): SipClient {
  if (sipClient) return sipClient;

  const host = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!host || !apiKey || !apiSecret) {
    throw new Error(
      "Missing LiveKit configuration (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)."
    );
  }

  sipClient = new SipClient(host, apiKey, apiSecret);
  return sipClient;
}

/** Reads the global Vobiz SIP trunk credentials. */
function getVobizConfig() {
  const domain = process.env.VOBIZ_SIP_DOMAIN;
  const username = process.env.VOBIZ_USERNAME;
  const password = process.env.VOBIZ_PASSWORD;

  if (!domain || !username || !password) {
    throw new Error(
      "Missing Vobiz SIP configuration (VOBIZ_SIP_DOMAIN, VOBIZ_USERNAME, VOBIZ_PASSWORD)."
    );
  }

  return { domain, username, password };
}

/**
 * Provisions an inbound SIP trunk that accepts calls from Vobiz for the
 * given phone number(s), authenticated with the Vobiz trunk credentials.
 */
export function createVobizInboundTrunk(name: string, numbers: string[]) {
  const { username, password } = getVobizConfig();
  return getSipClient().createSipInboundTrunk(name, numbers, {
    authUsername: username,
    authPassword: password,
  });
}

/**
 * Provisions an outbound SIP trunk that routes calls to Vobiz's SIP domain
 * for the given phone number(s), authenticated with the Vobiz trunk credentials.
 */
export function createVobizOutboundTrunk(name: string, numbers: string[]) {
  const { domain, username, password } = getVobizConfig();
  return getSipClient().createSipOutboundTrunk(name, domain, numbers, {
    transport: SIPTransport.SIP_TRANSPORT_TLS,
    authUsername: username,
    authPassword: password,
  });
}

export function listInboundTrunks() {
  return getSipClient().listSipInboundTrunk();
}

export function listOutboundTrunks() {
  return getSipClient().listSipOutboundTrunk();
}

export function deleteTrunk(sipTrunkId: string) {
  return getSipClient().deleteSipTrunk(sipTrunkId);
}

/**
 * Adds additional accepted number formats to an existing inbound trunk
 * (e.g. a carrier sending national format like "07971442498" alongside the
 * E.164 number already registered), without disturbing existing config.
 */
export function addInboundTrunkNumbers(sipTrunkId: string, numbers: string[]) {
  return getSipClient().updateSipInboundTrunkFields(sipTrunkId, {
    numbers: new ListUpdate({ add: numbers }),
  });
}

/**
 * Creates a dispatch rule that routes inbound calls arriving on the given
 * trunk(s) into a LiveKit room, so the AI voice agent can be dispatched to it.
 */
export function createInboundDispatchRule(
  rule: SipDispatchRuleDirect | SipDispatchRuleIndividual | SipDispatchRuleCallee,
  trunkIds: string[]
) {
  return getSipClient().createSipDispatchRule(rule, { trunkIds });
}

export function listDispatchRules() {
  return getSipClient().listSipDispatchRule();
}

export function deleteDispatchRule(sipDispatchRuleId: string) {
  return getSipClient().deleteSipDispatchRule(sipDispatchRuleId);
}

/**
 * Places an outbound call by dialing `toNumber` through the given outbound
 * trunk and dropping the call into `roomName` as a SIP participant.
 */
export function dispatchOutboundCall(
  sipTrunkId: string,
  toNumber: string,
  roomName: string,
  opts?: CreateSipParticipantOptions
) {
  return getSipClient().createSipParticipant(sipTrunkId, toNumber, roomName, opts);
}
