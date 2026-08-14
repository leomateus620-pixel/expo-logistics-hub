import { webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { blobToText } from '../capture/blob';
import {
  EncryptedSegmentSpool,
  EncryptedSegmentUnavailableError,
  MemorySegmentSpoolStore,
  OpfsHybridSegmentSpoolStore,
} from '../spool/EncryptedSegmentSpool';
import type { CapturedAudioSegment } from '../types';

const cryptoApi = webcrypto as unknown as Crypto;

function capturedSegment(now: number): CapturedAudioSegment {
  const audio = new Blob(['institutional knowledge'], { type: 'audio/webm;codecs=opus' });
  return {
    audio,
    metadata: {
      id: '10000000-0000-4000-8000-000000000001',
      sessionId: '20000000-0000-4000-8000-000000000001',
      sequence: 0,
      captureStartMs: 0,
      captureEndMs: 30_000,
      durationMs: 30_000,
      capturedAtIso: new Date(now).toISOString(),
      mimeType: 'audio/webm;codecs=opus',
      bytes: audio.size,
      sha256: 'b'.repeat(64),
      backend: 'media_recorder',
    },
  };
}

class FakeOpfsDirectory {
  readonly files = new Map<string, ArrayBuffer>();

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name) && !options?.create) throw new DOMException('Not found', 'NotFoundError');
    if (!this.files.has(name)) this.files.set(name, new ArrayBuffer(0));
    return {
      kind: 'file' as const,
      name,
      getFile: async () => new Blob([this.files.get(name) as ArrayBuffer]),
      createWritable: async () => ({
        write: async (value: ArrayBuffer) => {
          this.files.set(name, value.slice(0));
        },
        close: async () => undefined,
        abort: async () => undefined,
      }),
    };
  }

  async removeEntry(name: string) {
    this.files.delete(name);
  }

  async *entries(): AsyncGenerator<[string, { kind: 'file'; name: string }]> {
    for (const name of this.files.keys()) yield [name, { kind: 'file', name }];
  }
}

describe('EncryptedSegmentSpool', () => {
  it('stores only AES-GCM ciphertext with a non-exportable session key and decrypts on demand', async () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z');
    const store = new MemorySegmentSpoolStore();
    const spool = new EncryptedSegmentSpool({ store, crypto: cryptoApi, now: () => now });
    const source = capturedSegment(now);

    await spool.put(source);
    const raw = await store.getRecord(source.metadata.id);
    const storedKey = await store.getKey(`session:${source.metadata.sessionId}`);
    expect(raw?.ciphertext?.byteLength).toBeGreaterThan(source.audio.size);
    expect(new TextDecoder().decode(raw?.ciphertext as ArrayBuffer)).not.toContain('institutional knowledge');
    expect(storedKey?.key.extractable).toBe(false);

    const decrypted = await spool.get(source.metadata.id);
    expect(await blobToText(decrypted.audio)).toBe('institutional knowledge');
    expect(decrypted.metadata.status).toBe('queued');
  });

  it('prefers OPFS for ciphertext, keeps metadata/key outside the file, and removes orphans', async () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z');
    const metadataStore = new MemorySegmentSpoolStore();
    const directory = new FakeOpfsDirectory();
    const hybrid = new OpfsHybridSegmentSpoolStore(
      metadataStore,
      directory as unknown as FileSystemDirectoryHandle,
    );
    const spool = new EncryptedSegmentSpool({ store: hybrid, crypto: cryptoApi, now: () => now });
    const source = capturedSegment(now);

    await spool.put(source);
    const metadata = await metadataStore.getRecord(source.metadata.id);
    expect(metadata).toMatchObject({ ciphertext: null, ciphertextStorage: 'opfs' });
    expect(directory.files.size).toBe(1);
    expect(await blobToText((await spool.get(source.metadata.id)).audio)).toBe('institutional knowledge');

    const orphan = await directory.getFileHandle('orphan.ciphertext', { create: true });
    const writable = await orphan.createWritable();
    await writable.write(new ArrayBuffer(8));
    await writable.close();
    expect(await hybrid.cleanupOrphans()).toBe(1);
    expect(directory.files.has('orphan.ciphertext')).toBe(false);
  });

  it('destroys expired audio at 24h and keeps a metadata-only lost tombstone until mark_lost succeeds', async () => {
    let now = Date.parse('2026-08-13T12:00:00.000Z');
    const store = new MemorySegmentSpoolStore();
    const spool = new EncryptedSegmentSpool({
      store,
      crypto: cryptoApi,
      now: () => now,
      ttlMs: 1_000,
    });
    const source = capturedSegment(now);
    await spool.put(source);
    now += 1_001;

    const offlineMarkLost = vi.fn(async () => {
      throw new Error('offline');
    });
    await spool.janitor(offlineMarkLost, source.metadata.sessionId);
    expect(offlineMarkLost).toHaveBeenCalledOnce();
    expect((await spool.list(source.metadata.sessionId))[0]?.metadata).toMatchObject({
      status: 'lost',
      errorCode: 'spool_ttl_expired',
    });
    await expect(spool.get(source.metadata.id)).rejects.toMatchObject({
      code: 'missing_key',
    });

    const onlineMarkLost = vi.fn(async () => undefined);
    await spool.janitor(onlineMarkLost, source.metadata.sessionId);
    expect(onlineMarkLost).toHaveBeenCalledOnce();
    expect(await spool.list(source.metadata.sessionId)).toEqual([]);
  });

  it('purges ciphertext and key for an explicitly cancelled session', async () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z');
    const store = new MemorySegmentSpoolStore();
    const spool = new EncryptedSegmentSpool({ store, crypto: cryptoApi, now: () => now });
    const source = capturedSegment(now);
    await spool.put(source);

    expect(await spool.purgeSession(source.metadata.sessionId)).toBe(1);
    expect(await spool.list(source.metadata.sessionId)).toEqual([]);
    expect(await store.getKey(`session:${source.metadata.sessionId}`)).toBeNull();
  });

  it('removes orphaned non-exportable keys during global logout cleanup', async () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z');
    const store = new MemorySegmentSpoolStore();
    const orphanKey = await cryptoApi.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    await store.putKey({ id: 'session:orphan', key: orphanKey, createdAtMs: now });
    const spool = new EncryptedSegmentSpool({ store, crypto: cryptoApi, now: () => now });

    expect(await spool.purgeAll()).toBe(0);
    expect(await store.getKey('session:orphan')).toBeNull();
  });
});
