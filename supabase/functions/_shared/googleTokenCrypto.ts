// AES-256-GCM helpers for Google OAuth tokens. The key comes from the
// GOOGLE_TOKEN_ENCRYPTION_KEY secret (base64 or hex, 32 bytes when decoded).
// Never log plaintext tokens; only ciphertext, iv and tag ever leave this file.

const KEY_ENV = "GOOGLE_TOKEN_ENCRYPTION_KEY";
let cachedKey: CryptoKey | null = null;

function decodeKeyMaterial(raw: string): Uint8Array {
  const trimmed = raw.trim();
  // Try base64 (url-safe accepted).
  const asBase64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const padded = asBase64 + "=".repeat((4 - (asBase64.length % 4)) % 4);
  try {
    const bin = atob(padded);
    if (bin.length === 32) {
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i += 1) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
  } catch {
    // fall through to hex
  }
  // Try hex.
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) bytes[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  }
  // Fallback: SHA-256 of the raw material to derive a stable 32-byte key.
  // This lets randomly-generated printable secrets (e.g. `openssl rand -base64 32`
  // trimmed differently, or a 64-char alphanumeric string) work deterministically.
  return new Uint8Array(32); // Filled below via digest.
}

async function loadKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const raw = Deno.env.get(KEY_ENV);
  if (!raw || raw.length < 16) throw new Error("token_encryption_key_missing");
  let material = decodeKeyMaterial(raw);
  if (material.every((b) => b === 0)) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    material = new Uint8Array(digest);
  }
  cachedKey = await crypto.subtle.importKey(
    "raw",
    material,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  return cachedKey;
}

export interface EncryptedToken {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  tag: Uint8Array;
}

export async function encryptToken(plaintext: string): Promise<EncryptedToken> {
  if (!plaintext) throw new Error("token_encrypt_empty");
  const key = await loadKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(buf);
  // WebCrypto returns ciphertext || tag(16 bytes). Split for storage clarity.
  const tag = combined.slice(combined.length - 16);
  const ciphertext = combined.slice(0, combined.length - 16);
  return { ciphertext, iv, tag };
}

export async function decryptToken(token: EncryptedToken): Promise<string> {
  const key = await loadKey();
  const combined = new Uint8Array(token.ciphertext.length + token.tag.length);
  combined.set(token.ciphertext, 0);
  combined.set(token.tag, token.ciphertext.length);
  const buf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: token.iv, tagLength: 128 },
    key,
    combined,
  );
  return new TextDecoder().decode(buf);
}

/** Encodes bytes to Postgres bytea hex string (`\\x...`) for direct SQL/JS inserts. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return "\\x" + out;
}

/** Decodes a Postgres bytea value coming back from PostgREST as either a hex string or a base64 string. */
export function bytesFromDb(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value !== "string") throw new Error("token_bytes_invalid");
  if (value.startsWith("\\x")) {
    const hex = value.slice(2);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  // base64 fallback
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const bin = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
