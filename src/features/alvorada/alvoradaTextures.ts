import * as THREE from 'three';
import { loadAlvoradaAsset } from './alvoradaAssets';

/**
 * Turns the shared asset pipeline's blobs into GPU-ready textures.
 *
 * Decoding happens off the main thread through `createImageBitmap` where
 * available (Chrome, Firefox, Safari 15+) so a 4K albedo never freezes the
 * frame loop; the `<img>` + `decode()` path remains for older engines. Each
 * URL is decoded once per execution and shared by every consumer.
 */

interface TextureEntry { promise: Promise<THREE.Texture>; users: number }
const textures = new Map<string, TextureEntry>();

function supportsImageBitmap() {
  return typeof createImageBitmap === 'function' && typeof ImageBitmap !== 'undefined';
}

async function decodeWithImageBitmap(blob: Blob) {
  const bitmap = await createImageBitmap(blob, {
    colorSpaceConversion: 'none',
    imageOrientation: 'flipY',
    premultiplyAlpha: 'none',
  });
  const texture = new THREE.Texture(bitmap);
  // ImageBitmap is already flipped; Three must not flip it again on upload.
  texture.flipY = false;
  texture.userData.alvoradaDecoder = 'image-bitmap';
  return texture;
}

async function decodeWithImageElement(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Alvorada texture decode failed.'));
      image.src = url;
    });
    await image.decode().catch(() => undefined);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Alvorada image has no decoded pixels.');
    const texture = new THREE.Texture(image);
    texture.userData.alvoradaDecoder = 'image-element';
    return texture;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadAlvoradaTexture(url: string): Promise<THREE.Texture> {
  const cached = textures.get(url);
  if (cached) { cached.users += 1; return cached.promise; }

  const pending = loadAlvoradaAsset(url)
    .then(async (blob) => {
      const texture = supportsImageBitmap()
        ? await decodeWithImageBitmap(blob).catch(() => decodeWithImageElement(blob))
        : await decodeWithImageElement(blob);
      texture.needsUpdate = true;
      return texture;
    })
    .catch((error: unknown) => {
      // A failed decode must not poison later attempts within the execution.
      textures.delete(url);
      throw error;
    });
  textures.set(url, { promise: pending, users: 1 });
  return pending;
}

/** Releases the decoded texture once the consuming scene has been torn down. */
export function releaseAlvoradaTexture(url: string) {
  const entry = textures.get(url);
  if (!entry) return;
  entry.users = Math.max(0, entry.users - 1);
  // React's cleanup/setup replay can reacquire in the same turn. Do not close
  // the shared ImageBitmap while another mounted scene still owns it.
  queueMicrotask(() => {
    if (entry.users || textures.get(url) !== entry) return;
    textures.delete(url);
    entry.promise.then((texture) => {
      texture.dispose();
      (texture.image as { close?: () => void } | undefined)?.close?.();
    }).catch(() => undefined);
  });
}

/** 1×1 stand-ins keep every shader sampler bound while the real maps arrive. */
export function createPlaceholderTexture(rgba: [number, number, number, number]) {
  const texture = new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

/** Test-only reset. */
export function resetAlvoradaTexturesForTests() {
  textures.clear();
}
