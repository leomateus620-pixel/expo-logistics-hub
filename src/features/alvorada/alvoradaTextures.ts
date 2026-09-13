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

const textures = new Map<string, Promise<THREE.Texture>>();

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
  return texture;
}

async function decodeWithImageElement(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Alvorada texture decode failed.'));
    });
    await image.decode().catch(() => undefined);
    return new THREE.Texture(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadAlvoradaTexture(url: string): Promise<THREE.Texture> {
  const cached = textures.get(url);
  if (cached) return cached;

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
  textures.set(url, pending);
  return pending;
}

/** Releases the decoded texture once the consuming scene has been torn down. */
export function releaseAlvoradaTexture(url: string) {
  const pending = textures.get(url);
  if (!pending) return;
  textures.delete(url);
  pending.then((texture) => {
    const image = texture.image as { close?: () => void } | undefined;
    texture.dispose();
    image?.close?.();
  }).catch(() => undefined);
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
