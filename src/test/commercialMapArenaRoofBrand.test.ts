import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { ShapeGeometry, Vector3 } from 'three';
import { ARENA_CANONICAL_LAYOUT as arena } from '@/features/commercial-map/data/arenaCanonicalLayout';
import { ARENA_ROOF_BRAND, arenaRoofBrandLayout, arenaRoofHeightAt, createArenaRoofBrand } from '@/features/commercial-map/utils/arenaRoofBrand';
import {
  ARENA_SHOW_TIMELINE,
  createArenaLedPanelMaterial,
  createArenaShowController,
  resolveArenaShowStage,
  sampleArenaShowFrame,
} from '@/features/commercial-map/utils/arenaRoofShow';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';

const typeface = JSON.parse(readFileSync(`public${ARENA_ROOF_BRAND.font}`, 'utf8'));
const font = new FontLoader().parse(typeface);
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
          expect(maxRelief).toBeLessThan(w * 0.026);
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
      // Reading direction follows the long axis: emblem at the front (+Z),
      // name to its right (-Z); both share the roof ridge, in a single row.
      expect(brand.faces.boundingBox!.max.z - brand.faces.boundingBox!.min.z).toBeCloseTo(brand.layout.wordWidth, 4);
      expect(brand.symbol.boundingBox!.min.z).toBeGreaterThan(brand.faces.boundingBox!.max.z);
      expect(brand.faces.boundingBox!.getCenter(new Vector3()).x).toBeCloseTo(0, 6);
      expect(brand.symbol.boundingBox!.getCenter(new Vector3()).x).toBeCloseTo(0, 6);
      expect(brand.layout.length).toBeCloseTo(depth * 0.88, 4);
    } finally { brand.dispose(); }
  });
  it('reutiliza a tipografia e o espaçamento da marca exibida pelo sistema', () => {
    expect(typeface.wordmark.fontWeight).toBe(900);
    expect(typeface.wordmark.trackingEm).toBe(-0.04);
    expect(typeface.original_font_information.sourceFamily).toBe('Inter Black');
    const brandComponent = readFileSync('src/components/brand/FenasojaBrand.tsx', 'utf8');
    expect(brandComponent).toContain('font-black tracking-[-0.04em]');
  });
  it('mantém espaço entre os chanfros das letras mesmo com o tracking compacto da marca', () => {
    const layout = arenaRoofBrandLayout(width, depth);
    const word = new ShapeGeometry(font.generateShapes(ARENA_ROOF_BRAND.text, 1));
    word.computeBoundingBox();
    const scale = layout.wordWidth / (word.boundingBox!.max.x - word.boundingBox!.min.x);
    word.dispose();
    const letters = [...ARENA_ROOF_BRAND.text];
    for (let i = 0; i < letters.length - 1; i++) {
      const a = new ShapeGeometry(font.generateShapes(letters[i], 1));
      const b = new ShapeGeometry(font.generateShapes(letters[i + 1], 1));
      a.computeBoundingBox(); b.computeBoundingBox();
      const gap = typeface.glyphs[letters[i]].ha / typeface.resolution + b.boundingBox!.min.x - a.boundingBox!.max.x;
      a.dispose(); b.dispose();
      expect(gap * scale).toBeGreaterThan(2 * layout.bevel);
    }
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

  it('aplica azul institucional intenso nas faces das letras FENASOJA e delimita o painel LED curvo na cobertura', () => {
    const brand = createArenaRoofBrand(width, depth, font);
    try {
      const colors = brand.faces.attributes.color;
      expect(colors).toBeDefined();
      for (let i = 0; i < colors.count; i++) {
        const r = colors.getX(i);
        const g = colors.getY(i);
        const b = colors.getZ(i);
        expect(b).toBeGreaterThan(g);
        expect(g).toBeGreaterThan(r);
        expect(b).toBeGreaterThan(0.18);
      }

      const panelPos = brand.panel.attributes.position;
      let maxPanelX = 0;
      let maxPanelZ = 0;
      let minClearance = Infinity;
      let maxClearance = 0;
      for (let i = 0; i < panelPos.count; i++) {
        const x = panelPos.getX(i);
        const y = panelPos.getY(i);
        const z = panelPos.getZ(i);
        maxPanelX = Math.max(maxPanelX, Math.abs(x));
        maxPanelZ = Math.max(maxPanelZ, Math.abs(z));
        const clearance = y - arenaRoofHeightAt(x, width);
        minClearance = Math.min(minClearance, clearance);
        maxClearance = Math.max(maxClearance, clearance);
      }
      expect(maxPanelX).toBeLessThan(width * 0.4);
      expect(maxPanelZ).toBeLessThan(depth * 0.48);
      expect(minClearance).toBeGreaterThan(0);
      expect(maxClearance).toBeLessThan(brand.layout.seating);
    } finally {
      brand.dispose();
    }
  });

  it('executa a narrativa de 7 segundos em 5 fases e retorna suavemente ao estado idle', () => {
    expect(ARENA_SHOW_TIMELINE.totalDurationSeconds).toBe(7.0);
    expect(resolveArenaShowStage(0, false)).toBe('idle');
    expect(resolveArenaShowStage(0.4, true)).toBe('panel-activation');
    expect(resolveArenaShowStage(1.6, true)).toBe('horizon-dawn');
    expect(resolveArenaShowStage(3.5, true)).toBe('sunrise-plains');
    expect(resolveArenaShowStage(5.2, true)).toBe('institutional-transition');
    expect(resolveArenaShowStage(6.4, true)).toBe('brand-reveal');
    expect(resolveArenaShowStage(7.2, true)).toBe('settling');
    expect(resolveArenaShowStage(7.6, true)).toBe('idle');

    const sunriseFrame = sampleArenaShowFrame(3.5, true);
    expect(sunriseFrame.status).toBe('playing');
    expect(sunriseFrame.panelPower).toBeGreaterThan(0.95);
    expect(sunriseFrame.horizonProgress).toBeGreaterThan(0.9);
    expect(sunriseFrame.sunElevation).toBeGreaterThan(0.5);
    expect(sunriseFrame.plainsGoldSpread).toBeGreaterThan(0.6);

    const revealFrame = sampleArenaShowFrame(6.2, true);
    expect(revealFrame.stage).toBe('brand-reveal');
    expect(revealFrame.institutionalReveal).toBeGreaterThan(0.9);
    expect(revealFrame.brandFinale).toBeGreaterThan(0.8);
    expect(revealFrame.letterGoldBoost).toBeGreaterThan(0.8);
    expect(revealFrame.sculptedBrandPresence).toBeGreaterThan(0.95);
    expect(revealFrame.symbolPresence).toBeGreaterThan(0.95);

    const completedFrame = sampleArenaShowFrame(7.5, true);
    expect(completedFrame.status).toBe('idle');
    expect(completedFrame.panelPower).toBe(0);
    expect(completedFrame.sculptedBrandPresence).toBe(1);
    expect(completedFrame.symbolPresence).toBe(1);
  });

  it('bloqueia cliques reentrantes durante a animação e permite novo disparo apenas após concluir', () => {
    const controller = createArenaShowController();
    expect(controller.status).toBe('idle');
    expect(controller.sequence).toBe(0);

    // First click starts the show
    expect(controller.trigger(1000)).toBe(true);
    expect(controller.status).toBe('playing');
    expect(controller.stage).toBe('panel-activation');
    expect(controller.sequence).toBe(1);

    // Repeated clicks during active timeline are ignored
    expect(controller.trigger(1500)).toBe(false);
    expect(controller.trigger(4200)).toBe(false);
    expect(controller.trigger(7100)).toBe(false);
    expect(controller.sequence).toBe(1);

    const midFrame = controller.sample(4200);
    expect(midFrame.stage).toBe('sunrise-plains');

    // After 7.0s + 0.45s settling, controller returns to idle automatically
    const finalFrame = controller.sample(8600);
    expect(finalFrame.status).toBe('idle');
    expect(controller.status).toBe('idle');

    // Next click after returning to idle starts a fresh run
    expect(controller.trigger(9000)).toBe(true);
    expect(controller.status).toBe('playing');
    expect(controller.sequence).toBe(2);
  });

  it('atualiza uniforms do shader do painel LED e incrementa arenaShowSequence na store', () => {
    const led = createArenaLedPanelMaterial();
    try {
      const frame = sampleArenaShowFrame(6.1, true);
      led.applyFrame(frame, true);
      expect(led.material.uniforms.uPower.value).toBeCloseTo(frame.panelPower, 5);
      expect(led.material.uniforms.uFinale.value).toBeCloseTo(frame.brandFinale, 5);
      expect(led.material.uniforms.uNight.value).toBe(1);
    } finally {
      led.dispose();
    }

    const before = useCommercialMapStore.getState().arenaShowSequence;
    useCommercialMapStore.getState().requestArenaShow();
    expect(useCommercialMapStore.getState().arenaShowSequence).toBe(before + 1);
  });
});
