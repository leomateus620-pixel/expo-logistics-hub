import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface GltfJson {
  animations?: Array<{ name?: string }>;
  accessors?: Array<{ count?: number }>;
  materials?: Array<{ name?: string }>;
  meshes?: Array<{
    name?: string;
    primitives?: Array<{ indices?: number; attributes?: Record<string, number> }>;
  }>;
  nodes?: Array<{ name?: string; extras?: { forward_axis?: string } }>;
  skins?: unknown[];
}

interface ExecutiveAssetManifest {
  units: string;
  origin: string;
  clips: Record<string, { duration_seconds: number; loop: boolean }>;
  characters: Array<{
    file: string;
    bytes: number;
    sha256: string;
    skins: number;
    animations: string[];
    root_translation_range: number;
    forward_axis: string;
  }>;
}

const ASSET_ROOT = resolve('public/models/executives');
const manifest = JSON.parse(
  readFileSync(resolve(ASSET_ROOT, 'manifest.json'), 'utf8'),
) as ExecutiveAssetManifest;

function readGlb(file: string) {
  const buffer = readFileSync(resolve(ASSET_ROOT, file));
  expect(buffer.readUInt32LE(0)).toBe(0x46546c67);
  expect(buffer.readUInt32LE(4)).toBe(2);
  expect(buffer.readUInt32LE(8)).toBe(buffer.length);
  expect(buffer.readUInt32LE(16)).toBe(0x4e4f534a);

  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString('utf8').trim(),
  ) as GltfJson;
  return { buffer, json };
}

function triangleCount(json: GltfJson) {
  return (json.meshes ?? []).reduce((total, mesh) => total + (mesh.primitives ?? []).reduce(
    (meshTotal, primitive) => {
      const accessorIndex = primitive.indices;
      if (accessorIndex === undefined) return meshTotal;
      return meshTotal + ((json.accessors?.[accessorIndex]?.count ?? 0) / 3);
    },
    0,
  ), 0);
}

describe('assets dos personagens executivos', () => {
  it('mantem o contrato comum de rig, clips, origem e payload', () => {
    expect(manifest.units).toBe('meters');
    expect(manifest.origin).toContain('grounded');
    expect(Object.keys(manifest.clips)).toEqual(expect.arrayContaining(['Idle', 'Walk', 'Wave']));
    expect(manifest.clips.Wave.loop).toBe(false);
    expect(manifest.characters.map((character) => character.file).sort()).toEqual([
      'djeison-drey.glb',
      'fabiano-soltis.glb',
    ]);

    let combinedBytes = 0;
    manifest.characters.forEach((character) => {
      const path = resolve(ASSET_ROOT, character.file);
      const bytes = statSync(path).size;
      combinedBytes += bytes;
      expect(bytes).toBe(character.bytes);
      expect(bytes).toBeGreaterThan(250_000);
      expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(character.sha256);
      expect(character.skins).toBeGreaterThan(0);
      expect(character.animations).toEqual(expect.arrayContaining(['Idle', 'Walk', 'Wave']));
      expect(character.root_translation_range).toBe(0);
      expect(character.forward_axis).toBe('+Z');
    });
    expect(combinedBytes).toBeLessThanOrEqual(12 * 1024 * 1024);
  });

  it.each([
    ['fabiano-soltis.glb', /FabianoSoltis_(Skin|HeadSkin)/, /FabianoSoltis_(Hair|Glasses|Suit)/],
    ['djeison-drey.glb', /DjeisonDrey_(Skin|HeadSkin)/, /DjeisonDrey_(Hair|Beard|Glasses|Suit)/],
  ])('valida estrutura e identidade material de %s', (file, skinPattern, identityPattern) => {
    const { json } = readGlb(file);
    const animationNames = (json.animations ?? []).map((animation) => animation.name);
    const searchableNames = JSON.stringify({
      materials: json.materials?.map((material) => material.name),
      meshes: json.meshes?.map((mesh) => mesh.name),
      nodes: json.nodes?.map((node) => node.name),
    });

    expect(json.skins?.length).toBeGreaterThan(0);
    expect(animationNames).toEqual(expect.arrayContaining(['Idle', 'Walk', 'Wave']));
    expect(searchableNames).toMatch(skinPattern);
    expect(searchableNames).toMatch(identityPattern);
    expect(json.nodes?.some((node) => node.extras?.forward_axis?.startsWith('+Z'))).toBe(true);
    expect(triangleCount(json)).toBeGreaterThan(8_000);
    expect(triangleCount(json)).toBeLessThan(100_000);
  });

  it('mantem cuia, erva e bomba integradas ao asset de Djeison', () => {
    const { json } = readGlb('djeison-drey.glb');
    const searchableNames = JSON.stringify(json);
    expect(searchableNames).toMatch(/Chimarrao/i);
    expect(searchableNames).toMatch(/Cuia/i);
    expect(searchableNames).toMatch(/Erva/i);
    expect(searchableNames).toMatch(/Bomba/i);
  });
});
