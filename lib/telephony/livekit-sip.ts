import { SipClient, RoomServiceClient } from "livekit-server-sdk";
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

// Vobiz's SIP signaling IPs (per Vobiz docs: https://docs.vobiz.ai/concepts/ip-whitelisting).
// Used to restrict the inbound trunk instead of SIP digest auth, since Vobiz's outbound
// INVITEs don't carry auth headers that match LiveKit's expected digest scheme. Vobiz notes
// these IPs can change, so re-verify with Vobiz support if inbound calls start failing.
const VOBIZ_SIGNALING_IPS = [
  "13.203.7.132",
  "65.2.100.211",
  "13.126.98.234",
  "13.235.11.131",
  "13.233.44.61",
  "3.111.255.163",
  "3.111.128.110",
  "43.204.64.203",
  "15.207.232.91",
  "35.154.133.28",
];

/**
 * Provisions an inbound SIP trunk that accepts calls from Vobiz for the
 * given phone number(s), restricted to Vobiz's known signaling IPs.
 */
export function createVobizInboundTrunk(name: string, numbers: string[]) {
  return getSipClient().createSipInboundTrunk(name, numbers, {
    allowedAddresses: VOBIZ_SIGNALING_IPS,
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

let roomServiceClient: RoomServiceClient | null = null;

/** Lazily builds the singleton LiveKit room-service client (same env vars as the SIP client). */
function getRoomServiceClient(): RoomServiceClient {
  if (roomServiceClient) return roomServiceClient;

  const host = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!host || !apiKey || !apiSecret) {
    throw new Error(
      "Missing LiveKit configuration (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)."
    );
  }

  roomServiceClient = new RoomServiceClient(host, apiKey, apiSecret);
  return roomServiceClient;
}

/**
 * True while `roomName` still exists — i.e. the SIP participant dropped into it
 * by dispatchOutboundCall hasn't hung up yet. Used by the bulk-call dispatcher to
 * detect when an in-flight call has finished, without needing agent/worker.ts to
 * report per-campaign state itself.
 */
export async function bulkCallRoomIsActive(roomName: string): Promise<boolean> {
  const rooms = await getRoomServiceClient().listRooms([roomName]);
  return rooms.length > 0;
}

/** Force-ends a room — used to cut off a bulk-call contact stuck ringing too long. */
export async function endBulkCallRoom(roomName: string): Promise<void> {
  await getRoomServiceClient()
    .deleteRoom(roomName)
    .catch(() => {});
}
