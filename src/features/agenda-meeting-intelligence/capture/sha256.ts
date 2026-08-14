import { blobToArrayBuffer } from './blob';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256ArrayBuffer(
  input: ArrayBuffer,
  cryptoApi: Crypto = globalThis.crypto,
): Promise<string> {
  const digest = await cryptoApi.subtle.digest('SHA-256', input);
  return toHex(new Uint8Array(digest));
}

export async function sha256Blob(blob: Blob, cryptoApi: Crypto = globalThis.crypto): Promise<string> {
  return sha256ArrayBuffer(await blobToArrayBuffer(blob), cryptoApi);
}
