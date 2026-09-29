import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { ARENA_CANONICAL_LAYOUT as arena } from '@/features/commercial-map/data/arenaCanonicalLayout';
import { ARENA_ROOF_BRAND, arenaRoofBrandLayout, arenaRoofHeightAt, createArenaRoofBrand } from '@/features/commercial-map/utils/arenaRoofBrand';

const font = new FontLoader().parse(JSON.parse(readFileSync('public/alvorada/helvetiker-bold.typeface.json', 'utf8')));
const width = arena.arenaWidth, depth = arena.arenaDepth;

describe('Inscrição horizontal FENASOJA em relevo na cobertura', () => {
  it('segue a curva com baixo relevo, dentro do footprint e sem faces atravessando o telhado', () => {
    for (const scale of [0.7, 1, 1.4]) {
      const w = width * scale, d = depth * scale;
      const brand = createArenaRoofBrand(w, d, font);
      try {
        for (const g of [brand.faces, brand.returns, brand.symbol]) {
          const p = g.attributes.position;
          let valid = true, maxX = 0, maxZ = 0, minClearance = Infinity, maxRelief = 0;
          for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
            valid &&= [x, y, z].every(Number.isFinite);
            maxX = Math.max(maxX, Math.abs(x)); maxZ = Math.max(maxZ, Math.abs(z));
            minClearance = Math.min(minClearance, y - arenaRoofHeightAt(x, w));
            maxRelief = Math.max(maxRelief, y - arenaRoofHeightAt(x, w));
          }
          // Interior points matter: large font triangles could cross a curved
          // roof even when their vertices are all correctly seated above it.
          for (let i = 0; i < p.count; i += 3) {
            const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
            const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
            minClearance = Math.min(minClearance, y - arenaRoofHeightAt(x, w));
          }
          expect(valid).toBe(true);
          expect(maxX).toBeLessThan(w / 2);
          expect(maxZ).toBeLessThan(d / 2);
          expect(minClearance).toBeGreaterThan(0);
          expect(maxRelief).toBeLessThan(w * 0.02);
        }
      } finally { brand.dispose(); }
    }
  });
  it('coloca a marca olhando para cima, sem rotação de câmera, espelhamento ou segunda inscrição', () => {
    const brand = createArenaRoofBrand(width, depth, font);
    try {
      const n = brand.symbol.attributes.normal, uv = brand.symbol.attributes.uv;
      for (let i = 0; i < n.count; i++) {
        expect(n.getY(i)).toBeGreaterThan(0.95);
        expect(Math.abs(n.getZ(i))).toBeLessThan(1e-6);
        expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
        expect(uv.getX(i)).toBeLessThanOrEqual(1);
      }
      const png = readFileSync(`public${ARENA_ROOF_BRAND.symbol}`);
      expect(png.readUInt32BE(16)).toBe(png.readUInt32BE(20));
      expect(brand.faces.boundingBox!.max.x - brand.faces.boundingBox!.min.x).toBeCloseTo(width * 0.88, 4);
    } finally { brand.dispose(); }
  });
  it('mantém três draws, orçamento limitado e libera cada geometria própria', () => {
    const brand = createArenaRoofBrand(width, depth, font);
    const geometries = [brand.faces, brand.returns, brand.symbol];
    const triangles = geometries.reduce((sum, g) => sum + (g.index?.count ?? g.attributes.position.count) / 3, 0);
    expect(triangles).toBeLessThan(ARENA_ROOF_BRAND.maxTriangles);
    expect(geometries.every(g => g.groups.length === 0)).toBe(true);
    const disposed = geometries.map(g => { const spy = vi.fn(); g.addEventListener('dispose', spy); return spy; });
    brand.dispose();
    disposed.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
  });
  it('rejeita dimensões inválidas antes de alocar recursos', () => {
    for (const invalid of [0, -1, Infinity, NaN]) {
      expect(() => arenaRoofBrandLayout(invalid, depth)).toThrow();
      expect(() => arenaRoofBrandLayout(width, invalid)).toThrow();
    }
  });
});
