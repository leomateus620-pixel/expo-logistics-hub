import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fitPublicCompanyFootprint, type PublicSoldCompanyGeometry } from '../../public/publicSoldCompanyGeometry';
import { compactCompanyCaptionAbbreviations, isReadablePublicCompanyCaption, usesCompactPublicCompanyLabels } from '../../public/publicSoldCompanyLabelPolicy';
import { commercialMapDiagnosticsEnabled, markCommercialMapStage, measureCommercialMapSync } from '../../utils/performanceDiagnostics';
import { publicLabelRectsOverlap, type PublicLabelRect, type PublicMapLabelLayout } from './publicMapLabelLayout';

const FONT_SIZE = 54;
const FONT = `650 ${FONT_SIZE}px system-ui, sans-serif`;
const LINE_HEIGHT = 61;
const PAD_X = 17;
const PAD_Y = 12;
const CELL_GAP = 4;
const COMPACT_PAD_X = 7;
const COMPACT_PAD_Y = 6;
const COMPACT_TEXT_SCALE = .72;
const COMPACT_STACKED_LINE_HEIGHT = 55;
const COMPACT_STACKED_TEXT_SCALE = .69;
const COMPACT_WORLD_MARGIN = .10;
const EDGE = new THREE.Color('#204da1');
const FOCUSED_EDGE = new THREE.Color('#7bc9ff');
const noRaycast = () => {};

type Footprint = NonNullable<ReturnType<typeof fitPublicCompanyFootprint>>;
type CaptionLayout = {
  group: PublicSoldCompanyGeometry;
  fit: Footprint;
  lines: string[];
  width: number;
  height: number;
  lineHeight: number;
  padY: number;
  textScaleX: number;
  capHeight: number;
};
type Label = CaptionLayout & {
  x: number;
  y: number;
  index: number;
  flipped: boolean;
  rect: PublicLabelRect;
  opacity: number;
};
type CompanyLabels = {
  full: Label;
  compact: Label[];
  active: Label | null;
};

function splitLabel(name: string, measure: (value: string) => number): string[] | null {
  const words = name.split(/\s+/);
  let result: string[] | null = null;
  let minWidth = Infinity;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const width = Math.max(...lines.map(measure));
    if (width < minWidth) {
      result = lines;
      minWidth = width;
    }
  }
  return result;
}

function makeLabel(caption: CaptionLayout): Label {
  return { ...caption, x: 0, y: 0, index: -1, flipped: false, opacity: 0, rect: { x0: 0, x1: 0, y0: 0, y1: 0 } };
}

function chooseLabel(group: PublicSoldCompanyGeometry, measure: (value: string) => number, maxWidth: number, capHeight: number): Label | null {
  if (!group.tradeName) return null;
  const name = group.tradeName;
  const characters = Array.from(name);
  const fitLines = (lines: string[]) => {
    const width = Math.ceil(Math.max(...lines.map(measure))) + 2 * PAD_X;
    if (width > maxWidth) return null;
    const height = LINE_HEIGHT * lines.length + 2 * PAD_Y;
    const fit = fitPublicCompanyFootprint(group, width / height);
    return fit ? { group, fit, lines, width, height, lineHeight: LINE_HEIGHT, padY: PAD_Y, textScaleX: 1, capHeight } : null;
  };

  let choice = fitLines([name]);
  const glyphSize = (label: typeof choice) => label ? label.fit.height / label.height * FONT_SIZE : 0;
  const wrapped = characters.length >= 12 ? splitLabel(name, measure) : null;
  if (wrapped) {
    const twoLines = fitLines(wrapped);
    if (twoLines && glyphSize(twoLines) > glyphSize(choice) * 1.14) choice = twoLines;
  }
  const minimumFullSize = Math.sqrt(group.components[0].area) * 0.17;
  if (!choice || (characters.length > 24 && glyphSize(choice) < minimumFullSize)) {
    for (const limit of [32, 23, 15, 8]) {
      if (characters.length <= limit) continue;
      const short = fitLines([`${characters.slice(0, limit).join('').trimEnd()}…`]);
      if (short && glyphSize(short) > glyphSize(choice) * 1.16) choice = short;
      if (glyphSize(choice) >= minimumFullSize) break;
    }
  }
  return choice ? makeLabel(choice) : null;
}

function chooseCompactLabels(full: Label, context: CanvasRenderingContext2D, maxWidth: number): Label[] {
  const { group, fit: fixedPlacement, capHeight } = full;
  const name = group.tradeName!;
  const measure = (text: string) => {
    const metrics = context.measureText(text);
    const centeredExtent = 2 * Math.max(metrics.actualBoundingBoxLeft, metrics.actualBoundingBoxRight);
    return Math.max(metrics.width, Number.isFinite(centeredExtent) ? centeredExtent : 0);
  };
  const fitLines = (lines: string[], stacked = false): CaptionLayout | null => {
    const lineHeight = stacked ? COMPACT_STACKED_LINE_HEIGHT : LINE_HEIGHT;
    const textScaleX = stacked ? COMPACT_STACKED_TEXT_SCALE : COMPACT_TEXT_SCALE;
    const width = Math.ceil(Math.max(...lines.map(measure)) * textScaleX) + COMPACT_PAD_X * 2;
    if (width > maxWidth) return null;
    const height = lineHeight * lines.length + COMPACT_PAD_Y * 2;
    const fit = fitPublicCompanyFootprint(group, width / height, { fixedPlacement, maxMargin: COMPACT_WORLD_MARGIN });
    return fit ? { group, fit, lines, width, height, lineHeight, padY: COMPACT_PAD_Y, textScaleX, capHeight } : null;
  };
  const glyphSpan = (caption: CaptionLayout | null) => caption ? caption.fit.height / caption.height * caption.capHeight : 0;
  const fitName = (text: string) => {
    const oneLine = fitLines([text]);
    const wrapped = splitLabel(text, measure);
    const twoLines = wrapped ? fitLines(wrapped) : null;
    return glyphSpan(twoLines) > glyphSpan(oneLine) * 1.03 ? twoLines : oneLine;
  };

  const words = name.split(/\s+/u);
  // A short two-word name can read at overview scale when each original word
  // gets its own line. On a shallower projection, try the intact one-line form
  // before abbreviating; every form uses the same cadastral placement.
  const exact = words.length === 2 && words.every(word => Array.from(word).length <= 12)
    ? [fitLines(words, true), fitLines([name])]
    : [fitName(name)];
  const exactGlyphSpan = Math.max(...exact.map(glyphSpan));
  const abbreviated = compactCompanyCaptionAbbreviations(name).map(fitName)
    .filter(caption => glyphSpan(caption) > exactGlyphSpan * 1.025);
  return [...exact, ...abbreviated].flatMap(caption => caption ? [makeLabel(caption)] : []);
}

function setLabelUvs(label: Label, uv: THREE.BufferAttribute, width: number, height: number) {
  const u0 = label.x / width;
  const u1 = (label.x + label.width) / width;
  const v0 = 1 - label.y / height;
  const v1 = 1 - (label.y + label.height) / height;
  const left = label.flipped ? u1 : u0;
  const right = label.flipped ? u0 : u1;
  const top = label.flipped ? v1 : v0;
  const bottom = label.flipped ? v0 : v1;
  uv.setXY(label.index, left, top);
  uv.setXY(label.index + 1, right, top);
  uv.setXY(label.index + 2, right, bottom);
  uv.setXY(label.index + 3, left, bottom);
}

function createLabels(groups: PublicSoldCompanyGeometry[], maxTextureSize: number, maxAnisotropy: number, compact: boolean) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.font = FONT;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const atlasWidth = Math.min(2048, maxTextureSize);
  const maxLabelWidth = atlasWidth - 2 * CELL_GAP;
  const capitals = compact ? context.measureText('H') : null;
  const capHeight = (capitals && capitals.actualBoundingBoxAscent + capitals.actualBoundingBoxDescent) || FONT_SIZE * .72;
  const full = groups.map(group => chooseLabel(group, text => context.measureText(text).width, maxLabelWidth, capHeight))
    .filter((label): label is Label => Boolean(label));

  // Priority only changes for explicit selection or hover, so nearby names do not trade places during orbit.
  full.sort((a, b) => b.fit.width * b.fit.height - a.fit.width * a.fit.height || a.group.key.localeCompare(b.group.key));
  const companyLabels: CompanyLabels[] = full.map(label => ({
    full: label, compact: compact ? chooseCompactLabels(label, context, maxLabelWidth) : [], active: null,
  }));
  // Do not trade an ordinary caption for a compact one if a GPU has a small atlas limit.
  const candidates = [...full, ...companyLabels.flatMap(company => company.compact)];
  const labels: Label[] = [];
  let x = CELL_GAP;
  let y = CELL_GAP;
  let rowHeight = 0;
  let occupiedHeight = 0;
  let heightLimit = maxTextureSize;
  for (const [index, label] of candidates.entries()) {
    if (index === full.length) {
      // Mobile variants can reuse a larger existing atlas without increasing its allocation.
      heightLimit = Math.min(maxTextureSize, Math.max(4096, THREE.MathUtils.ceilPowerOfTwo(occupiedHeight)));
    }
    if (x + label.width + CELL_GAP > atlasWidth) {
      x = CELL_GAP;
      y += rowHeight + CELL_GAP;
      rowHeight = 0;
    }
    const cellBottom = y + label.height + CELL_GAP;
    if (cellBottom > heightLimit) continue;
    label.x = x;
    label.y = y;
    label.index = labels.length * 4;
    labels.push(label);
    x += label.width + CELL_GAP;
    rowHeight = Math.max(rowHeight, label.height);
    occupiedHeight = Math.max(occupiedHeight, cellBottom);
  }
  if (!labels.length) return null;
  canvas.width = atlasWidth;
  canvas.height = Math.min(maxTextureSize, THREE.MathUtils.ceilPowerOfTwo(occupiedHeight));
  context.font = FONT;
  context.textBaseline = 'middle';
  context.textAlign = 'center';

  const positions: number[] = [];
  const indices: number[] = [];
  const uv = new THREE.BufferAttribute(new Float32Array(labels.length * 8), 2).setUsage(THREE.DynamicDrawUsage);
  const opacity = new THREE.BufferAttribute(new Float32Array(labels.length * 4), 1).setUsage(THREE.DynamicDrawUsage);
  for (const label of labels) {
    const base = context.createLinearGradient(0, label.y, 0, label.y + label.height);
    base.addColorStop(0, 'rgba(25, 58, 101, 0.97)');
    base.addColorStop(1, 'rgba(11, 30, 60, 0.95)');
    context.fillStyle = base;
    context.beginPath();
    if (context.roundRect) context.roundRect(label.x + 4, label.y + 4, label.width - 8, label.height - 8, 11);
    else context.rect(label.x + 4, label.y + 4, label.width - 8, label.height - 8);
    context.shadowColor = 'rgba(8, 19, 37, 0.44)';
    context.shadowBlur = 3;
    context.shadowOffsetY = 2;
    context.fill();
    context.shadowColor = 'transparent';
    context.strokeStyle = 'rgba(129, 188, 240, 0.68)';
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = '#fff8e8';
    context.save();
    context.translate(label.x + label.width / 2, label.y + label.padY);
    context.scale(label.textScaleX, 1);
    label.lines.forEach((line, index) => context.fillText(line, 0, (index + 0.5) * label.lineHeight));
    context.restore();

    for (const [worldX, worldZ] of label.fit.footprint) positions.push(worldX, label.fit.elevation, worldZ);
    setLabelUvs(label, uv, canvas.width, canvas.height);
    const i = label.index;
    indices.push(i, i + 3, i + 2, i, i + 2, i + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', uv);
  geometry.setAttribute('labelOpacity', opacity);
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = Math.min(8, maxAnisotropy);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4,
    uniforms: { atlas: { value: atlas } },
    vertexShader: `
      attribute float labelOpacity;
      varying vec2 atlasUv;
      varying float opacity;
      void main() {
        atlasUv = uv;
        opacity = labelOpacity;
        gl_Position = labelOpacity > 0.
          ? projectionMatrix * modelViewMatrix * vec4(position, 1.)
          : vec4(2., 2., 2., 1.);
      }`,
    fragmentShader: `
      uniform sampler2D atlas;
      varying vec2 atlasUv;
      varying float opacity;
      void main() {
        vec4 color = texture2D(atlas, atlasUv);
        color.a *= opacity;
        if (color.a < .08) discard;
        gl_FragColor = color;
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'public-sold-company-labels';
  mesh.raycast = noRaycast;
  const packed = companyLabels.filter(company => company.full.index >= 0);
  packed.forEach(company => { company.compact = company.compact.filter(label => label.index >= 0); });
  mesh.userData = { presentationOnly: true, labelCount: packed.length };
  return { mesh, labels: packed, atlas, uv, opacity };
}

function createContours(groups: PublicSoldCompanyGeometry[]) {
  const positions: number[] = [];
  const ranges = new Map<string, [number, number]>();
  for (const group of groups) {
    const start = positions.length / 3;
    for (const point of group.contourPositions) positions.push(point);
    ranges.set(group.key, [start, positions.length / 3]);
  }
  const geometry = new THREE.BufferGeometry();
  const colors = new THREE.BufferAttribute(new Float32Array(positions.length), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', colors);
  const mesh = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false }));
  mesh.name = 'public-sold-company-contours';
  mesh.raycast = noRaycast;
  let previous = new Set<string>();
  const paint = (key: string, color: THREE.Color) => {
    const [start, end] = ranges.get(key) ?? [0, 0];
    for (let index = start; index < end; index++) colors.setXYZ(index, color.r, color.g, color.b);
  };
  for (const group of groups) paint(group.key, EDGE);
  return { mesh, highlight: (...keys: (string | undefined)[]) => {
    const active = new Set(keys.filter((key): key is string => Boolean(key)));
    for (const key of previous) if (!active.has(key)) paint(key, EDGE);
    for (const key of active) if (!previous.has(key)) paint(key, FOCUSED_EDGE);
    if (active.size !== previous.size || [...active].some(key => !previous.has(key))) colors.needsUpdate = true;
    previous = active;
  } };
}

function projectLabel(label: Label, matrix: THREE.Matrix4, width: number, height: number, points: THREE.Vector4[]) {
  const rect = label.rect;
  rect.x0 = rect.y0 = Infinity;
  rect.x1 = rect.y1 = -Infinity;
  for (let index = 0; index < 4; index++) {
    const [x, z] = label.fit.footprint[index];
    const point = points[index].set(x, label.fit.elevation, z, 1).applyMatrix4(matrix);
    if (point.w <= 0 || Math.abs(point.z) > point.w) return 0;
    point.x = (point.x / point.w + 1) * width / 2;
    point.y = (1 - point.y / point.w) * height / 2;
    rect.x0 = Math.min(rect.x0, point.x);
    rect.x1 = Math.max(rect.x1, point.x);
    rect.y0 = Math.min(rect.y0, point.y);
    rect.y1 = Math.max(rect.y1, point.y);
  }
  if (rect.x0 < 2 || rect.y0 < 2 || rect.x1 > width - 2 || rect.y1 > height - 2) return 0;
  const [a, b, c, d] = points;
  const dx = ((b.x - a.x) + (c.x - d.x)) / 2;
  const dy = ((b.y - a.y) + (c.y - d.y)) / 2;
  const span = Math.hypot(dx, dy);
  if (span < 1) return 0;
  if (Math.abs(dx) > Math.max(3, span * 0.1)) label.flipped = dx < 0;
  const crossDistance = (from: THREE.Vector4, to: THREE.Vector4) =>
    Math.abs(dx * (to.y - from.y) - dy * (to.x - from.x)) / span;
  return Math.min(crossDistance(a, d), crossDistance(b, c)) * (label.capHeight / label.height);
}

/** One atlas draw and one contour draw. Their raycasts are disabled so the cadastral lot receives input. */
export const PublicSoldCompanyLabels = memo(function PublicSoldCompanyLabels({ groups, hoveredEntityId, selectedEntityId, layout }: {
  groups: PublicSoldCompanyGeometry[];
  hoveredEntityId: string | null;
  selectedEntityId: string | null;
  layout?: PublicMapLabelLayout;
}) {
  const gl = useThree(state => state.gl);
  const invalidate = useThree(state => state.invalidate);
  // Wrapping page controls can make a phone's canvas shorter than it is wide.
  const useCompact = useThree(({ size }) => usesCompactPublicCompanyLabels(size.width,
    typeof window === 'undefined' ? size.height : window.innerHeight));
  const labels = useMemo(() => measureCommercialMapSync('public-company-label-layout', () =>
    createLabels(groups, gl.capabilities.maxTextureSize, gl.capabilities.getMaxAnisotropy(), useCompact)), [gl, groups, useCompact]);
  const contours = useMemo(() => createContours(groups), [groups]);
  const groupByEntity = useMemo(() => new Map(groups.flatMap(group => group.entityIds.map(id => [id, group.key] as const))), [groups]);
  const selected = selectedEntityId ? groupByEntity.get(selectedEntityId) : undefined;
  const hovered = hoveredEntityId ? groupByEntity.get(hoveredEntityId) : undefined;
  const ordered = useMemo(() => {
    const list = labels?.labels ?? [];
    const priorities = [selected, hovered].filter((key, index, keys) => key && keys.indexOf(key) === index);
    return priorities.flatMap(key => list.filter(company => company.full.group.key === key))
      .concat(list.filter(company => !priorities.includes(company.full.group.key)));
  }, [hovered, labels, selected]);
  const projection = useMemo(() => new THREE.Matrix4(), []);
  const last = useRef<{ matrix: THREE.Matrix4; width: number; height: number; ordered: CompanyLabels[] }>();
  const points = useMemo(() => Array.from({ length: 4 }, () => new THREE.Vector4()), []);
  const accepted = useMemo<PublicLabelRect[]>(() => [], []);
  const layoutFrames = useRef(0);

  useLayoutEffect(() => {
    contours.highlight(selected, hovered);
    invalidate();
  }, [contours, hovered, invalidate, labels, selected]);
  useEffect(() => () => {
    labels?.mesh.geometry.dispose();
    labels?.mesh.material.dispose();
    labels?.atlas.dispose();
  }, [labels]);
  useEffect(() => () => {
    contours.mesh.geometry.dispose();
    contours.mesh.material.dispose();
  }, [contours]);

  const updateLabels = useCallback((matrix: THREE.Matrix4, width: number, height: number, frame?: PublicMapLabelLayout) => {
    if (!labels) return;
    const sampleAt = commercialMapDiagnosticsEnabled && ++layoutFrames.current % 12 === 0 ? performance.now() : null;
    accepted.length = 0;
    let opacityChanged = false;
    let uvChanged = false;
    let anyVisible = false;
    const readVisibleHeight = (label: Label) => {
      const flipped = label.flipped;
      const glyphHeight = projectLabel(label, matrix, width, height, points);
      if (flipped !== label.flipped) {
        setLabelUvs(label, labels.uv, labels.atlas.image.width, labels.atlas.image.height);
        uvChanged = true;
      }
      if (glyphHeight <= 0) return 0;
      const blocked = frame ? frame.isOccupied(label.rect) || frame.coversDetailedLot(label.rect, label.group.entityIds)
        : accepted.some(other => publicLabelRectsOverlap(label.rect, other));
      return blocked ? 0 : glyphHeight;
    };
    const setOpacity = (label: Label, value: number) => {
      if (Math.abs(value - label.opacity) >= 0.01 || (value === 0 && label.opacity > 0)) {
        label.opacity = value;
        for (let i = 0; i < 4; i++) labels.opacity.setX(label.index + i, value);
        opacityChanged = true;
      }
    };
    for (const company of ordered) {
      const { full } = company;
      const fullHeight = readVisibleHeight(full);
      let next: Label | null;
      let alpha = 1;
      if (useCompact) {
        next = isReadablePublicCompanyCaption(fullHeight, 'full', company.active === full)
          ? full
          : company.compact.find(label => isReadablePublicCompanyCaption(readVisibleHeight(label), 'compact')) ?? null;
      } else {
        const focused = full.group.key === selected || full.group.key === hovered;
        const fadeStart = focused ? 7.2 : 8.2;
        const visibility = THREE.MathUtils.smoothstep(fullHeight, fadeStart, fadeStart + 1.5);
        next = visibility >= 0.15 ? full : null;
        alpha = 0.68 + 0.32 * visibility;
      }
      if (company.active && company.active !== next) setOpacity(company.active, 0);
      company.active = next;
      if (next) {
        setOpacity(next, alpha);
        if (frame) frame.reserve(next.rect);
        else accepted.push(next.rect);
        anyVisible = true;
      }
    }
    labels.mesh.visible = anyVisible;
    if (opacityChanged) labels.opacity.needsUpdate = true;
    if (uvChanged) labels.uv.needsUpdate = true;
    if (sampleAt !== null) markCommercialMapStage('public-company-projection:sample', performance.now() - sampleAt);
  }, [accepted, hovered, labels, ordered, points, selected, useCompact]);

  useLayoutEffect(() => {
    if (!layout) return;
    const unregister = layout.register('companies', frame => updateLabels(frame.projection, frame.width, frame.height, frame));
    invalidate();
    return () => { unregister(); invalidate(); };
  }, [invalidate, layout, updateLabels]);

  useFrame(({ camera, size }) => {
    if (layout || !labels) return;
    camera.updateMatrixWorld();
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const previous = last.current;
    if (previous?.ordered === ordered && previous.width === size.width && previous.height === size.height
      && previous.matrix.equals(projection)) return;
    if (previous) {
      previous.matrix.copy(projection);
      previous.width = size.width;
      previous.height = size.height;
      previous.ordered = ordered;
    } else last.current = { matrix: projection.clone(), width: size.width, height: size.height, ordered };
    updateLabels(projection, size.width, size.height);
  });

  return <>
    <primitive object={contours.mesh} dispose={null} />
    {labels && <primitive object={labels.mesh} dispose={null} />}
  </>;
});
