// HMAC-signed, optionally-expiring tokens for double opt-in confirmation and
// preference management. Uses Web Crypto (crypto.subtle), available on Workers.
//
// Format: base64url(payloadJson).base64url(hmac). No secrets in the payload.

export type TokenPurpose = "confirm" | "manage";

export interface TokenPayload {
  /** Subscriber id. */
  sub: string;
  purpose: TokenPurpose;
  /** Expiry epoch ms. Omitted for non-expiring manage tokens. */
  exp?: number;
}

const encoder = new TextEncoder();

function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function signToken(payload: TokenPayload, secret: string): Promise<string> {
  const body = base64urlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return `${body}.${base64urlEncode(sig)}`;
}

/** Verify a token. Returns the payload, or null if invalid/expired. */
export async function verifyToken(
  token: string,
  secret: string,
  expected?: TokenPurpose,
): Promise<TokenPayload | null> {
  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const body = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const key = await hmacKey(secret);
  const expectedSig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  if (!timingSafeEqual(base64urlDecode(providedSig), expectedSig)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(body))) as TokenPayload;
  } catch {
    return null;
  }
  if (expected && payload.purpose !== expected) return null;
  if (payload.exp != null && Date.now() > payload.exp) return null;
  return payload;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function confirmToken(subscriberId: string, secret: string): Promise<string> {
  return signToken(
    { sub: subscriberId, purpose: "confirm", exp: Date.now() + 7 * DAY_MS },
    secret,
  );
}

export function manageToken(subscriberId: string, secret: string): Promise<string> {
  // Non-expiring: it's the subscriber's standing "manage preferences" link.
  return signToken({ sub: subscriberId, purpose: "manage" }, secret);
}
