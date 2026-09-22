import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import * as THREE from 'three';
import { createHeadquartersGeometry } from '@/features/commercial-map/components/canvas/headquarters/geometry';
import { buildShell } from '@/features/commercial-map/components/canvas/headquarters/architecture';
import { buildFrontage } from '@/features/commercial-map/components/canvas/headquarters/landscape';
import { buildSoybeanMonument } from '@/features/commercial-map/components/canvas/headquarters/monument';
import { bakeArchitecturalContact } from '@/features/commercial-map/components/canvas/headquarters/contact';
import { preparePackedHeadquartersGeometry } from '@/features/commercial-map/components/canvas/headquarters/headquartersGeometryPreparation';
import { headquartersTransferBuffers, unpackHeadquartersGeometry, type PackedHeadquartersGeometry } from '@/features/commercial-map/components/canvas/headquarters/headquartersGeometryPacking';
import { createHeadquartersPreparationResource, type HeadquartersPreparationWorker } from '@/features/commercial-map/components/canvas/headquarters/headquartersPreparationResource';

const sameBytes = (a: THREE.TypedArray, b: THREE.TypedArray) =>
  a.constructor.name === b.constructor.name && Buffer.from(a.buffer, a.byteOffset, a.byteLength)
    .equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));

describe('B12 transferable preparation parity', () => {
  let original: ReturnType<ReturnType<typeof createHeadquartersGeometry>['finish']>;
  let packed: PackedHeadquartersGeometry;
  let restored: ReturnType<typeof unpackHeadquartersGeometry>;
  beforeAll(() => {
    // Independent pre-worker call sequence, unchanged from the original mount.
    const builder = createHeadquartersGeometry();
    buildShell(builder); buildFrontage(builder); buildSoybeanMonument(builder);
    original = builder.finish();
    bakeArchitecturalContact(original.geometry);
    const workerResult = preparePackedHeadquartersGeometry();
    const buffers = headquartersTransferBuffers(workerResult);
    expect(new Set(buffers).size).toBe(buffers.length);
    packed = structuredClone(workerResult, { transfer: buffers });
    expect(buffers.every((buffer) => buffer.byteLength === 0)).toBe(true);
    restored = unpackHeadquartersGeometry(packed);
  }, 30_000);
  afterAll(() => {
    original?.geometry.forEach((part) => part.geometry.dispose());
    restored?.geometry.forEach((part) => part.geometry.dispose());
  });

  it('preserves exact geometry attributes, contact, indices, groups, bounds and LOD', () => {
    expect(restored.geometry.length).toBe(original.geometry.length);
    for (let i = 0; i < original.geometry.length; i++) {
      const before = original.geometry[i]; const after = restored.geometry[i];
      expect([after.key, after.lod, after.geometry.name]).toEqual([before.key, before.lod, before.geometry.name]);
      expect(Object.keys(after.geometry.attributes)).toEqual(Object.keys(before.geometry.attributes));
      for (const name of Object.keys(before.geometry.attributes)) {
        const a = before.geometry.getAttribute(name) as THREE.BufferAttribute;
        const b = after.geometry.getAttribute(name) as THREE.BufferAttribute;
        expect(sameBytes(a.array, b.array), `${before.key}:${name}`).toBe(true);
        expect([b.itemSize, b.normalized, b.usage, b.gpuType, b.name]).toEqual([a.itemSize, a.normalized, a.usage, a.gpuType, a.name]);
      }
      expect(Boolean(after.geometry.index)).toBe(Boolean(before.geometry.index));
      if (before.geometry.index) expect(sameBytes(before.geometry.index.array, after.geometry.index!.array)).toBe(true);
      expect(after.geometry.groups).toEqual(before.geometry.groups);
      expect(after.geometry.drawRange).toEqual(before.geometry.drawRange);
      expect(after.geometry.boundingBox).toEqual(before.geometry.boundingBox);
      expect(after.geometry.boundingSphere).toEqual(before.geometry.boundingSphere);
    }
  });

  it('retains full double-precision repeated transforms and per-owner buffer isolation', () => {
    expect([...restored.repeated.keys()]).toEqual([...original.repeated.keys()]);
    for (const [key, matrices] of original.repeated) {
      expect(restored.repeated.get(key)?.map((matrix) => matrix.elements)).toEqual(matrices.map((matrix) => matrix.elements));
    }
    const second = unpackHeadquartersGeometry(packed);
    const firstAttribute = restored.geometry[0].geometry.getAttribute('position');
    const secondAttribute = second.geometry[0].geometry.getAttribute('position');
    const originalX = firstAttribute.getX(0);
    secondAttribute.setX(0, originalX + 100);
    expect(firstAttribute.getX(0)).toBe(originalX);
    expect(packed.geometry[0].attributes.position.array[0]).toBe(originalX);
    second.geometry.forEach((part) => part.geometry.dispose());
  });
});

describe('bounded B12 preparation owner', () => {
  const payload: PackedHeadquartersGeometry = {
    geometry: [], repeated: [], contact: { durationMs: 1, samples: 1, rays: 8, maxDistanceMeters: .85 },
    timings: { geometryMs: 1, contactMs: 1 },
  };
  function fakeWorker(): HeadquartersPreparationWorker {
    return { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() };
  }
  afterEach(() => vi.useRealTimers());

  it('shares one pending job, suspends read, caches completion and terminates listeners', async () => {
    const worker = fakeWorker();
    const createWorker = vi.fn(() => worker); const fallback = vi.fn(async () => payload);
    const resource = createHeadquartersPreparationResource({ createWorker, fallback });
    const pending = resource.preload();
    expect(resource.preload()).toBe(pending);
    let thrown: unknown;
    try { resource.read(); } catch (value) { thrown = value; }
    expect(thrown).toBe(pending);
    worker.onmessage!({ data: { ok: true, packed: payload } } as MessageEvent);
    expect(await pending).toBe(payload);
    expect(resource.read()).toBe(payload);
    expect(createWorker).toHaveBeenCalledTimes(1); expect(fallback).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.onmessage).toBeNull(); expect(worker.onerror).toBeNull();
  });

  it('keeps failed preload cheap after route exit, then suspends a live reader on one fallback', async () => {
    const worker = fakeWorker(); const fallback = vi.fn(async () => payload);
    const resource = createHeadquartersPreparationResource({ createWorker: () => worker, fallback });
    const pending = resource.preload();
    const rejected = expect(pending).rejects.toThrow('worker decode failed');
    worker.onmessage!({ data: { ok: false, error: 'worker decode failed' } } as MessageEvent);
    await rejected;
    expect(fallback).not.toHaveBeenCalled();
    expect(resource.preload()).toBe(pending);
    let suspended: unknown;
    try { resource.read(); } catch (value) { suspended = value; }
    expect(suspended).toBeInstanceOf(Promise);
    let secondRead: unknown;
    try { resource.read(); } catch (value) { secondRead = value; }
    expect(secondRead).toBe(suspended);
    expect(await suspended).toBe(payload);
    expect(resource.read()).toBe(payload);
    expect(fallback).toHaveBeenCalledTimes(1); expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('records the worker on its original prewarm operation when the route joins in flight', async () => {
    const worker = fakeWorker(), createWorker = vi.fn(() => worker);
    const resource = createHeadquartersPreparationResource({ createWorker, fallback: vi.fn(async () => payload) });
    const prewarm = vi.fn(), route = vi.fn();
    const pending = resource.preload(prewarm);
    expect(resource.preload(route)).toBe(pending);
    worker.onmessage!({ data: { ok: true, packed: payload } } as MessageEvent); await pending;
    expect(prewarm.mock.calls.some(([stage]) => stage === 'b12-worker:end')).toBe(true);
    expect(route.mock.calls).toEqual([['b12-worker:cached', { source: 'prefetched' }]]);
    expect(createWorker).toHaveBeenCalledTimes(1);
  });

  it('times out a silent worker and surfaces a failed fallback through the map boundary', async () => {
    vi.useFakeTimers();
    const worker = fakeWorker(); const failure = new Error('CPU preparation failed');
    const fallback = vi.fn(async () => { throw failure; });
    const resource = createHeadquartersPreparationResource({
      createWorker: () => worker, timeoutMs: 50, fallback,
    });
    const pending = resource.preload();
    const rejected = expect(pending).rejects.toThrow('B12 worker preparation timed out');
    await vi.advanceTimersByTimeAsync(51);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
    let suspended: unknown;
    try { resource.read(); } catch (value) { suspended = value; }
    await expect(suspended).rejects.toBe(failure);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(() => resource.read()).toThrow(failure);
  });
});
