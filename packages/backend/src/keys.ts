/**
 * API key generation, hashing, and lookup helpers.
 *
 * Format: `bb_live_<24-char base62>` (e.g., `bb_live_aB3kQ8wRp9zNvXm2yP4cTd5e`).
 * We never store the raw key in the database — only `sha256(key)` plus a
 * 12-char prefix for display ("bb_live_aB3kQ8…"). If a key is leaked, an
 * attacker still can't see the live key in our DB.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let body = "";
  for (let i = 0; i < bytes.length; i++) {
    body += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `bb_live_${body}`;
}

export async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bufToHex(hash);
}

export function keyPrefix(key: string): string {
  // First 12 chars: "bb_live_aB3k" — enough to disambiguate, hides the rest.
  return key.slice(0, 12);
}

export function isWellFormed(key: string): boolean {
  return /^bb_live_[A-Za-z0-9]{24}$/.test(key);
}

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}
