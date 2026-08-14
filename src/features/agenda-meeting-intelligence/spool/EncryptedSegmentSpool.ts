import {
  AGENDA_MEETING_SPOOL_TTL_MS,
  type CapturedAudioSegment,
  type CaptureSegmentState,
} from '../types';
import { blobToArrayBuffer } from '../capture/blob';

const DATABASE_NAME = 'fenasoja-agenda-meeting-spool';
const DATABASE_VERSION = 1;
const SEGMENTS_STORE = 'encrypted-segments';
const KEYS_STORE = 'session-keys';

interface EncryptedSpoolRecord {
  id: string;
  sessionId: string;
  keyId: string;
  metadata: CaptureSegmentState;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer | null;
  ciphertextStorage: 'indexeddb' | 'opfs';
  ciphertextFileName: string | null;
  expiresAtMs: number;
  updatedAtMs: number;
}

interface StoredSessionKey {
  id: string;
  key: CryptoKey;
  createdAtMs: number;
}

interface DirectoryHandleWithEntries extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<
    [string, FileSystemDirectoryHandle | FileSystemFileHandle]
  >;
}

export interface SpoolSegmentDescriptor {
  metadata: CaptureSegmentState;
  expiresAtMs: number;
  updatedAtMs: number;
}

export interface DecryptedSpoolSegment extends SpoolSegmentDescriptor {
  audio: Blob;
}

export interface SegmentSpoolStore {
  getRecord(id: string): Promise<EncryptedSpoolRecord | null>;
  putRecord(record: EncryptedSpoolRecord): Promise<void>;
  deleteRecord(id: string): Promise<void>;
  listRecords(sessionId?: string): Promise<EncryptedSpoolRecord[]>;
  getKey(id: string): Promise<StoredSessionKey | null>;
  putKey(key: StoredSessionKey): Promise<void>;
  deleteKey(id: string): Promise<void>;
  listKeys(): Promise<StoredSessionKey[]>;
  cleanupOrphans?(): Promise<number>;
}

export class EncryptedSegmentUnavailableError extends Error {
  readonly code: 'missing_segment' | 'missing_key' | 'decrypt_failed';

  constructor(code: EncryptedSegmentUnavailableError['code']) {
    super(code);
    this.name = 'EncryptedSegmentUnavailableError';
    this.code = code;
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('indexed_db_request_failed')), {
      once: true,
    });
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('indexed_db_transaction_aborted')),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('indexed_db_transaction_failed')),
      { once: true },
    );
  });
}

export class IndexedDbSegmentSpoolStore implements SegmentSpoolStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly indexedDb: IDBFactory = globalThis.indexedDB) {}

  async getRecord(id: string): Promise<EncryptedSpoolRecord | null> {
    const db = await this.open();
    const transaction = db.transaction(SEGMENTS_STORE, 'readonly');
    const value = await requestToPromise(
      transaction.objectStore(SEGMENTS_STORE).get(id) as IDBRequest<EncryptedSpoolRecord | undefined>,
    );
    return value ?? null;
  }

  async putRecord(record: EncryptedSpoolRecord): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(SEGMENTS_STORE, 'readwrite');
    transaction.objectStore(SEGMENTS_STORE).put(record);
    await transactionToPromise(transaction);
  }

  async deleteRecord(id: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(SEGMENTS_STORE, 'readwrite');
    transaction.objectStore(SEGMENTS_STORE).delete(id);
    await transactionToPromise(transaction);
  }

  async listRecords(sessionId?: string): Promise<EncryptedSpoolRecord[]> {
    const db = await this.open();
    const transaction = db.transaction(SEGMENTS_STORE, 'readonly');
    const store = transaction.objectStore(SEGMENTS_STORE);
    const values = sessionId
      ? await requestToPromise(
          store.index('sessionId').getAll(sessionId) as IDBRequest<EncryptedSpoolRecord[]>,
        )
      : await requestToPromise(store.getAll() as IDBRequest<EncryptedSpoolRecord[]>);
    return values;
  }

  async getKey(id: string): Promise<StoredSessionKey | null> {
    const db = await this.open();
    const transaction = db.transaction(KEYS_STORE, 'readonly');
    const value = await requestToPromise(
      transaction.objectStore(KEYS_STORE).get(id) as IDBRequest<StoredSessionKey | undefined>,
    );
    return value ?? null;
  }

  async putKey(key: StoredSessionKey): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(KEYS_STORE, 'readwrite');
    transaction.objectStore(KEYS_STORE).put(key);
    await transactionToPromise(transaction);
  }

  async deleteKey(id: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(KEYS_STORE, 'readwrite');
    transaction.objectStore(KEYS_STORE).delete(id);
    await transactionToPromise(transaction);
  }

  async listKeys(): Promise<StoredSessionKey[]> {
    const db = await this.open();
    const transaction = db.transaction(KEYS_STORE, 'readonly');
    return requestToPromise(
      transaction.objectStore(KEYS_STORE).getAll() as IDBRequest<StoredSessionKey[]>,
    );
  }

  async cleanupOrphans(): Promise<number> {
    const keyIdsInUse = new Set((await this.listRecords()).map((record) => record.keyId));
    const orphanKeys = (await this.listKeys()).filter((key) => !keyIdsInUse.has(key.id));
    for (const key of orphanKeys) await this.deleteKey(key.id);
    return orphanKeys.length;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.indexedDb) return Promise.reject(new Error('indexed_db_unavailable'));
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener('upgradeneeded', () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SEGMENTS_STORE)) {
          const store = db.createObjectStore(SEGMENTS_STORE, { keyPath: 'id' });
          store.createIndex('sessionId', 'sessionId', { unique: false });
          store.createIndex('expiresAtMs', 'expiresAtMs', { unique: false });
        }
        if (!db.objectStoreNames.contains(KEYS_STORE)) {
          db.createObjectStore(KEYS_STORE, { keyPath: 'id' });
        }
      });
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error ?? new Error('indexed_db_open_failed')), {
        once: true,
      });
      request.addEventListener('blocked', () => reject(new Error('indexed_db_upgrade_blocked')), {
        once: true,
      });
    });
    return this.databasePromise;
  }
}

function safeCiphertextFileName(segmentId: string): string {
  const safeId = segmentId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safeId}.ciphertext`;
}

export class OpfsHybridSegmentSpoolStore implements SegmentSpoolStore {
  constructor(
    private readonly metadataStore: SegmentSpoolStore,
    private readonly directory: FileSystemDirectoryHandle,
  ) {}

  async getRecord(id: string): Promise<EncryptedSpoolRecord | null> {
    const record = await this.metadataStore.getRecord(id);
    if (!record || record.ciphertextStorage !== 'opfs') return record;
    if (!record.ciphertextFileName) return null;
    try {
      const handle = await this.directory.getFileHandle(record.ciphertextFileName);
      const file = await handle.getFile();
      return { ...record, ciphertext: await blobToArrayBuffer(file) };
    } catch {
      return null;
    }
  }

  async putRecord(record: EncryptedSpoolRecord): Promise<void> {
    if (!record.ciphertext) {
      await this.metadataStore.putRecord({
        ...record,
        ciphertextStorage: 'indexeddb',
        ciphertextFileName: null,
      });
      return;
    }
    const fileName = record.ciphertextFileName ?? safeCiphertextFileName(record.id);
    try {
      const fileHandle = await this.directory.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(record.ciphertext);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
      await this.metadataStore.putRecord({
        ...record,
        ciphertext: null,
        ciphertextStorage: 'opfs',
        ciphertextFileName: fileName,
      });
    } catch (error) {
      if (record.ciphertextStorage === 'opfs') throw error;
      await this.metadataStore.putRecord({
        ...record,
        ciphertextStorage: 'indexeddb',
        ciphertextFileName: null,
      });
    }
  }

  async deleteRecord(id: string): Promise<void> {
    const record = await this.metadataStore.getRecord(id);
    if (record?.ciphertextStorage === 'opfs' && record.ciphertextFileName) {
      await this.directory.removeEntry(record.ciphertextFileName).catch(() => undefined);
    }
    await this.metadataStore.deleteRecord(id);
  }

  listRecords(sessionId?: string): Promise<EncryptedSpoolRecord[]> {
    return this.metadataStore.listRecords(sessionId);
  }

  getKey(id: string): Promise<StoredSessionKey | null> {
    return this.metadataStore.getKey(id);
  }

  putKey(key: StoredSessionKey): Promise<void> {
    return this.metadataStore.putKey(key);
  }

  deleteKey(id: string): Promise<void> {
    return this.metadataStore.deleteKey(id);
  }

  listKeys(): Promise<StoredSessionKey[]> {
    return this.metadataStore.listKeys();
  }

  async cleanupOrphans(): Promise<number> {
    let removed = await this.metadataStore.cleanupOrphans?.() ?? 0;
    const expected = new Set(
      (await this.metadataStore.listRecords())
        .filter((record) => record.ciphertextStorage === 'opfs' && record.ciphertextFileName)
        .map((record) => record.ciphertextFileName as string),
    );
    const directory = this.directory as DirectoryHandleWithEntries;
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== 'file' || expected.has(name)) continue;
      await this.directory.removeEntry(name).catch(() => undefined);
      removed += 1;
    }
    return removed;
  }
}

export class BrowserPreferredSegmentSpoolStore implements SegmentSpoolStore {
  private storePromise: Promise<SegmentSpoolStore> | null = null;

  constructor(
    private readonly metadataStore: SegmentSpoolStore = new IndexedDbSegmentSpoolStore(),
    private readonly storageManager: StorageManager | undefined = globalThis.navigator?.storage,
  ) {}

  async getRecord(id: string): Promise<EncryptedSpoolRecord | null> {
    return (await this.store()).getRecord(id);
  }

  async putRecord(record: EncryptedSpoolRecord): Promise<void> {
    return (await this.store()).putRecord(record);
  }

  async deleteRecord(id: string): Promise<void> {
    return (await this.store()).deleteRecord(id);
  }

  async listRecords(sessionId?: string): Promise<EncryptedSpoolRecord[]> {
    return (await this.store()).listRecords(sessionId);
  }

  async getKey(id: string): Promise<StoredSessionKey | null> {
    return (await this.store()).getKey(id);
  }

  async putKey(key: StoredSessionKey): Promise<void> {
    return (await this.store()).putKey(key);
  }

  async deleteKey(id: string): Promise<void> {
    return (await this.store()).deleteKey(id);
  }

  async listKeys(): Promise<StoredSessionKey[]> {
    return (await this.store()).listKeys();
  }

  async cleanupOrphans(): Promise<number> {
    return (await this.store()).cleanupOrphans?.() ?? 0;
  }

  private store(): Promise<SegmentSpoolStore> {
    if (this.storePromise) return this.storePromise;
    this.storePromise = (async () => {
      if (!this.storageManager || typeof this.storageManager.getDirectory !== 'function') {
        return this.metadataStore;
      }
      try {
        const root = await this.storageManager.getDirectory();
        const directory = await root.getDirectoryHandle('fenasoja-agenda-meeting-ciphertext', {
          create: true,
        });
        return new OpfsHybridSegmentSpoolStore(this.metadataStore, directory);
      } catch {
        return this.metadataStore;
      }
    })();
    return this.storePromise;
  }
}

export class MemorySegmentSpoolStore implements SegmentSpoolStore {
  private readonly records = new Map<string, EncryptedSpoolRecord>();
  private readonly keys = new Map<string, StoredSessionKey>();

  async getRecord(id: string): Promise<EncryptedSpoolRecord | null> {
    return this.records.get(id) ?? null;
  }

  async putRecord(record: EncryptedSpoolRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async deleteRecord(id: string): Promise<void> {
    this.records.delete(id);
  }

  async listRecords(sessionId?: string): Promise<EncryptedSpoolRecord[]> {
    return [...this.records.values()].filter((record) => !sessionId || record.sessionId === sessionId);
  }

  async getKey(id: string): Promise<StoredSessionKey | null> {
    return this.keys.get(id) ?? null;
  }

  async putKey(key: StoredSessionKey): Promise<void> {
    this.keys.set(key.id, key);
  }

  async deleteKey(id: string): Promise<void> {
    this.keys.delete(id);
  }

  async listKeys(): Promise<StoredSessionKey[]> {
    return [...this.keys.values()];
  }

  async cleanupOrphans(): Promise<number> {
    const keyIdsInUse = new Set([...this.records.values()].map((record) => record.keyId));
    const orphanKeys = [...this.keys.values()].filter((key) => !keyIdsInUse.has(key.id));
    for (const key of orphanKeys) this.keys.delete(key.id);
    return orphanKeys.length;
  }
}

export interface EncryptedSegmentSpoolOptions {
  store?: SegmentSpoolStore;
  crypto?: Crypto;
  now?: () => number;
  ttlMs?: number;
}

function sessionKeyId(sessionId: string): string {
  return `session:${sessionId}`;
}

function additionalAuthenticatedData(metadata: CaptureSegmentState): ArrayBuffer {
  const encoded = new TextEncoder().encode(
    `${metadata.sessionId}:${metadata.id}:${metadata.sequence}:${metadata.sha256}:${metadata.mimeType}`,
  );
  return encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength,
  ) as ArrayBuffer;
}

export class EncryptedSegmentSpool {
  private readonly store: SegmentSpoolStore;
  private readonly crypto: Crypto;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly keyPromises = new Map<string, Promise<CryptoKey>>();

  constructor(options: EncryptedSegmentSpoolOptions = {}) {
    this.store = options.store ?? new BrowserPreferredSegmentSpoolStore();
    this.crypto = options.crypto ?? globalThis.crypto;
    this.now = options.now ?? (() => Date.now());
    this.ttlMs = options.ttlMs ?? AGENDA_MEETING_SPOOL_TTL_MS;
    if (!this.crypto?.subtle) throw new Error('web_crypto_unavailable');
    if (this.ttlMs <= 0) throw new Error('invalid_spool_ttl');
  }

  async put(segment: CapturedAudioSegment): Promise<SpoolSegmentDescriptor> {
    const now = this.now();
    const expiresAtMs = now + this.ttlMs;

    const metadata: CaptureSegmentState = {
      ...segment.metadata,
      status: 'queued',
      attempts: 0,
      retryWindowStartedAtMs: now,
      nextRetryAtMs: null,
      canonicalReceiptId: null,
      errorCode: null,
    };
    const keyId = sessionKeyId(metadata.sessionId);
    const key = await this.getOrCreateKey(keyId, now);
    const iv = this.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
    const plaintext = await blobToArrayBuffer(segment.audio);
    const ciphertext = await this.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: additionalAuthenticatedData(metadata) },
      key,
      plaintext,
    );
    const record: EncryptedSpoolRecord = {
      id: metadata.id,
      sessionId: metadata.sessionId,
      keyId,
      metadata,
      iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength),
      ciphertext,
      ciphertextStorage: 'indexeddb',
      ciphertextFileName: null,
      expiresAtMs,
      updatedAtMs: now,
    };
    await this.store.putRecord(record);
    return { metadata, expiresAtMs, updatedAtMs: now };
  }

  async get(segmentId: string): Promise<DecryptedSpoolSegment> {
    const record = await this.store.getRecord(segmentId);
    if (!record) throw new EncryptedSegmentUnavailableError('missing_segment');
    const storedKey = await this.store.getKey(record.keyId);
    if (!storedKey) throw new EncryptedSegmentUnavailableError('missing_key');
    if (!record.ciphertext) throw new EncryptedSegmentUnavailableError('missing_segment');
    try {
      const plaintext = await this.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: new Uint8Array(record.iv as ArrayBuffer),
          additionalData: additionalAuthenticatedData(record.metadata),
        },
        storedKey.key,
        record.ciphertext,
      );
      return {
        metadata: record.metadata,
        expiresAtMs: record.expiresAtMs,
        updatedAtMs: record.updatedAtMs,
        audio: new Blob([plaintext], { type: record.metadata.mimeType }),
      };
    } catch {
      throw new EncryptedSegmentUnavailableError('decrypt_failed');
    }
  }

  async list(sessionId?: string): Promise<SpoolSegmentDescriptor[]> {
    const records = await this.store.listRecords(sessionId);
    return records
      .map(({ metadata, expiresAtMs, updatedAtMs }) => ({ metadata, expiresAtMs, updatedAtMs }))
      .sort((left, right) => left.metadata.sequence - right.metadata.sequence);
  }

  async update(
    segmentId: string,
    updater: (metadata: CaptureSegmentState) => CaptureSegmentState,
  ): Promise<SpoolSegmentDescriptor> {
    const record = await this.store.getRecord(segmentId);
    if (!record) throw new EncryptedSegmentUnavailableError('missing_segment');
    const updatedMetadata = updater(record.metadata);
    if (
      updatedMetadata.id !== record.metadata.id ||
      updatedMetadata.sessionId !== record.metadata.sessionId ||
      updatedMetadata.sha256 !== record.metadata.sha256 ||
      updatedMetadata.mimeType !== record.metadata.mimeType
    ) {
      throw new Error('immutable_spool_metadata_changed');
    }
    const next = { ...record, metadata: updatedMetadata, updatedAtMs: this.now() };
    await this.store.putRecord(next);
    return {
      metadata: next.metadata,
      expiresAtMs: next.expiresAtMs,
      updatedAtMs: next.updatedAtMs,
    };
  }

  async delete(segmentId: string): Promise<void> {
    const record = await this.store.getRecord(segmentId);
    if (!record) return;
    await this.store.deleteRecord(segmentId);
    await this.deleteUnusedKey(record.keyId, record.sessionId);
  }

  async purgeSession(sessionId: string): Promise<number> {
    const records = await this.store.listRecords(sessionId);
    for (const record of records) await this.store.deleteRecord(record.id);
    await this.store.deleteKey(sessionKeyId(sessionId));
    return records.length;
  }

  async purgeAll(): Promise<number> {
    const records = await this.store.listRecords();
    const sessionIds = [...new Set(records.map((record) => record.sessionId))];
    let purged = 0;
    for (const sessionId of sessionIds) purged += await this.purgeSession(sessionId);
    for (const key of await this.store.listKeys()) await this.store.deleteKey(key.id);
    await this.store.cleanupOrphans?.();
    return purged;
  }

  async cleanupOrphans(): Promise<number> {
    return this.store.cleanupOrphans?.() ?? 0;
  }

  async janitor(
    onExpired?: (metadata: CaptureSegmentState) => Promise<void> | void,
    sessionId?: string,
    excludedSessionIds: ReadonlySet<string> = new Set(),
  ): Promise<CaptureSegmentState[]> {
    await this.store.cleanupOrphans?.();
    const now = this.now();
    const expired = (await this.store.listRecords(sessionId)).filter(
      (record) => record.expiresAtMs <= now && !excludedSessionIds.has(record.sessionId),
    );
    const removed: CaptureSegmentState[] = [];
    for (const record of expired) {
      const lostMetadata: CaptureSegmentState = {
        ...record.metadata,
        status: 'lost',
        nextRetryAtMs: null,
        errorCode: record.metadata.errorCode ?? 'spool_ttl_expired',
      };
      const tombstone: EncryptedSpoolRecord = {
        ...record,
        metadata: lostMetadata,
        ciphertext: null,
        ciphertextStorage: 'indexeddb',
        ciphertextFileName: null,
        updatedAtMs: now,
      };
      await this.store.deleteRecord(record.id);
      await this.store.putRecord(tombstone);
      await this.deleteUnusedKey(record.keyId, record.sessionId);
      try {
        await onExpired?.(lostMetadata);
        await this.store.deleteRecord(record.id);
      } catch {
        // Keep a metadata-only tombstone so a later online janitor can register the gap.
      }
      removed.push(lostMetadata);
    }
    return removed;
  }

  private async getOrCreateKey(keyId: string, now: number): Promise<CryptoKey> {
    const inFlight = this.keyPromises.get(keyId);
    if (inFlight) return inFlight;
    const operation = (async () => {
      const existing = await this.store.getKey(keyId);
      if (existing) return existing.key;
      const key = await this.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
      await this.store.putKey({ id: keyId, key, createdAtMs: now });
      return key;
    })();
    this.keyPromises.set(keyId, operation);
    try {
      return await operation;
    } finally {
      this.keyPromises.delete(keyId);
    }
  }

  private async deleteUnusedKey(keyId: string, sessionId: string): Promise<void> {
    const remaining = await this.store.listRecords(sessionId);
    const hasEncryptedAudio = remaining.some(
      (record) => record.ciphertextStorage === 'opfs' || record.ciphertext !== null,
    );
    if (!hasEncryptedAudio) await this.store.deleteKey(keyId);
  }
}
