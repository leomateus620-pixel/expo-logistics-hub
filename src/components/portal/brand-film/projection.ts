/** All times are seconds from the first decoded frame. Photography and printed
 * type are baked at two different layouts. Only the camera, paper and matte move. */
export { playCue } from './sound';

const base = '/portal/brand-film';
const full = [
  'parque',
  'origem',
  'cartaz',
  'mural-1',
  'mural-2',
  'oficina',
  'mural-3',
  'rua',
  'margem',
] as const;
type Plate = (typeof full)[number] | 'simbolo' | 'tinta';
type Frames = Partial<Record<Plate, HTMLImageElement>>;
export type Format = 'paisagem' | 'retrato';
export const duration = (reduced: boolean) => (reduced ? 4.2 : 14);

export async function loadFrames(
  format: Format,
  reduced: boolean,
  signal: AbortSignal,
  lowCost: boolean,
): Promise<Frames> {
  const names: readonly Plate[] = reduced
    ? ['parque', 'origem', 'cartaz', 'simbolo']
    : [...full, 'simbolo', 'tinta'];
  const selected = lowCost ? names.filter((name) => name !== 'margem' && name !== 'tinta') : names;
  const entries = await Promise.all(
    selected.map(async (name) => {
      const url =
        (name === 'simbolo' || name === 'tinta' ? base : base + '/' + format) + '/' + name + '.webp';
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error('Imagem indisponível');
      const objectURL = URL.createObjectURL(await response.blob());
      try {
        const image = new Image();
        image.src = objectURL;
        await image.decode();
        return [name, image] as const;
      } finally {
        URL.revokeObjectURL(objectURL);
      }
    }),
  );
  return Object.fromEntries(entries);
}

const between = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const smooth = (v: number) => v * v * (3 - 2 * v);
const mix = (a: number, b: number, v: number) => a + (b - a) * v;
const ease = (t: number, a: number, b: number) => smooth(between(t, a, b));

export function project(
  ctx: CanvasRenderingContext2D,
  frames: Frames,
  t: number,
  w: number,
  h: number,
  mark: DOMRect,
  headerImage: HTMLImageElement,
  reduced: boolean,
) {
  ctx.clearRect(0, 0, w, h);
  const park = frames.parque!;
  const tall = park.height > park.width;
  // Retain archival dates and faces on unusually square or wide displays.
  const scale = Math.min(
    Math.max(w / park.width, h / park.height),
    Math.min(w / park.width, h / park.height) * 1.11,
  );
  const pw = park.width * scale,
    ph = park.height * scale;
  const px = (w - pw) / 2,
    py = (h - ph) / 2;
  function plate(name: Plate, zoom = 1, dx = 0, dy = 0) {
    const im = frames[name];
    if (im)
      ctx.drawImage(
        im,
        px + (1 - zoom) * pw * 0.5 + dx,
        py + (1 - zoom) * ph * 0.5 + dy,
        pw * zoom,
        ph * zoom,
      );
  }
  function ground(color = '#102f25') {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
  }
  function aerial() {
    // Identical crop, sampling and grade for the first and last wide views.
    ground();
    plate('parque');
  }
  function markPass(progress: number, blend: number, glint: number) {
    const mw = mark.width;
    const size = mw * Math.exp(progress * Math.log((Math.hypot(w, h) * 8) / mw));
    // Enter an opaque point inside the golden sun. The alpha gaps stay open
    // until the sun itself fills the screen.
    const eyeX = mix(mark.left + mw * 0.5, w * 0.5, progress);
    const eyeY = mix(mark.top + mark.height * 0.38, h * 0.5, progress);
    const mx = eyeX - size * 0.5,
      my = eyeY - size * 0.38;
    // The photograph opens faster than the matte; both end at the same wide view.
    const k = smooth(Math.min(1, progress * 2.9));
    const iw = mix(mw, pw, k),
      ih = mix((mw * park.height) / park.width, ph, k);
    const thumbScale = Math.max(1, size / Math.min(iw, ih));
    const sw = mix(iw * thumbScale, iw, k),
      sh = mix(ih * thumbScale, ih, k);
    ctx.fillStyle = '#102f25';
    ctx.fillRect(mx, my, size, size);
    ctx.drawImage(park, mix(eyeX - sw * 0.48, px, k), mix(eyeY - sh * 0.47, py, k), sw, sh);
    if (glint > 0) {
      // Upper rim of the gold sun, traced in the 512 px original; the
      // projection mask uses its 478 px registered crop starting at (17,18).
      ctx.save();
      ctx.translate(mx - (size * 17) / 478, my - (size * 18) / 478);
      ctx.scale(size / 478, size / 478);
      ctx.strokeStyle = '#ffd344';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.setLineDash([88, 390]);
      ctx.lineDashOffset = 88 - glint * 442;
      ctx.beginPath();
      ctx.moveTo(140, 240);
      ctx.bezierCurveTo(145, 174, 192, 132, 256, 132);
      ctx.bezierCurveTo(320, 132, 365, 179, 373, 239);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(frames.simbolo!, mx, my, size, size);
    ctx.globalCompositeOperation = 'source-over';
    if (blend > 0 && headerImage.naturalWidth) {
      ctx.globalAlpha = blend;
      ctx.drawImage(headerImage, mx, my, size, size);
      ctx.globalAlpha = 1;
    }
    // Quiet the interface behind the growing silhouette. Its DOM geometry stays fixed.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = `rgba(2,17,26,${0.9 * smooth(Math.min(1, progress * 2.3))})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  const doc = frames.cartaz!;
  const finalWidth = Math.min(
    pw * (tall ? 0.36 : 0.232),
    (ph * (tall ? 0.31 : 0.57) * doc.width) / doc.height,
  );
  const finalX = px + pw * (tall ? 0.31 : 0.565),
    finalY = py + ph * (tall ? 0.597 : 0.535);
  const finalAngle = (-3.3 * Math.PI) / 180;
  function printAt(x: number, y: number, width: number, angle: number) {
    const height = (width * doc.height) / doc.width;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(doc, -width / 2, -height / 2, width, height);
    if (frames.tinta && t >= 0.96 && t < 1.72 && !reduced) {
      const pattern = ctx.createPattern(frames.tinta, 'repeat');
      if (pattern) {
        const pitch = width / 1800;
        ctx.scale(pitch, pitch);
        ctx.fillStyle = pattern;
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.65 * (1 - ease(t, 1.44, 1.72));
        ctx.fillRect(-width / (2 * pitch), -height / (2 * pitch), width / pitch, height / pitch);
      }
    }
    ctx.restore();
  }
  function origin(arrival = 1) {
    ground('#dfcfa7');
    plate('origem', mix(1.045, 1, arrival));
    printAt(finalX, finalY, finalWidth, finalAngle);
  }
  if (reduced) {
    if (t < 0.8) {
      markPass(0, 0, 0);
      return;
    }
    if (t < 2.55) {
      ctx.globalAlpha = ease(t, 0.8, 1.08);
      origin();
      ctx.globalAlpha = 1;
      return;
    }
    if (t < 2.92) origin();
    ctx.globalAlpha = ease(t, 2.55, 2.92) * (1 - ease(t, 3.9, 4.2));
    aerial();
    ctx.globalAlpha = 1;
    return;
  }
  // In the final frames the browser paints the very same DOM image under the
  // transparent dialog, including its subpixel position and native antialiasing.
  if (t >= 13.93) return;
  if (t < 0.8 || t > 13.03) {
    const opening = t < 0.8;
    const progress = opening ? ease(t, 0.2, 0.8) : 1 - ease(t, 13.03, 13.88);
    markPass(
      progress,
      opening ? 0.4 * (1 - ease(t, 0.05, 0.5)) : ease(t, 13.72, 13.85),
      opening && t < 0.23 ? between(t, 0, 0.23) : 0,
    );
    return;
  }
  // Match the top edge of the actual first poster to the lower eave at
  // (1920,1000). The same sheet traverses the lens and lands on the wall.
  const roofAngle = Math.atan(-1 / 3);
  const reach = h / 2 + w / 6 + 30;
  const contactY = py + ph * (tall ? 1000 / 2250 : 0.47);
  const macroWidth = Math.hypot(w, h) * 1.66,
    macroHeight = (macroWidth * doc.height) / doc.width;
  const startCenterX = w * 0.5 - Math.sin(roofAngle) * macroHeight * 0.5;
  const startCenterY = contactY - reach + Math.cos(roofAngle) * macroHeight * 0.5;
  if (t < 1.34) {
    ground();
    const advance = ease(t, 0.93, 1.32);
    plate('parque', 1 + advance * 0.26, 0, advance * ph * 0.009);
    if (t >= 0.96) {
      const top = contactY + mix(reach, -reach, ease(t, 0.96, 1.34));
      printAt(startCenterX, top + Math.cos(roofAngle) * macroHeight * 0.5, macroWidth, roofAngle);
    }
    return;
  }
  if (t < 3.5) {
    const landing = 1 - Math.pow(1 - between(t, 1.34, 1.79), 3);
    ground('#dfcfa7');
    plate('origem', mix(1.045, 1, landing));
    printAt(
      mix(startCenterX, finalX, landing),
      mix(startCenterY, finalY, landing),
      mix(macroWidth, finalWidth, landing),
      mix(roofAngle, finalAngle, landing),
    );
    const p = ease(t, 2.76, 3.5);
    if (p) {
      ctx.save();
      ctx.translate((1 - p) * w, 0);
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      ground('#e9d9b7');
      plate('mural-1');
      ctx.restore();
    }
    return;
  }
  if (t < 9.76) {
    // One continuous wall. The camera settles briefly at the gesture before
    // moving past the final print. Adjacent sheets physically occlude each other.
    const panels: Plate[] = ['mural-1', 'mural-2', 'oficina', 'mural-3', 'rua'];
    const pos = ease(t, 4.08, 4.88) + ease(t, 5.58, 6.45) + ease(t, 7.48, 8.24) + ease(t, 8.96, 9.76);
    const index = Math.min(3, Math.floor(pos));
    const fraction = pos - index;
    ground();
    for (let i = index; i <= index + 1; i++) {
      const x = (i - pos) * w;
      ctx.save();
      ctx.translate(x, 0);
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      ground(i % 2 === 0 && i !== 2 ? '#e9d9b7' : '#174432');
      plate(panels[i], 1 + (i === 2 ? 0.025 * ease(t, 6.45, 7.25) : 0));
      if (fraction > 0 && i === index + 1) {
        ctx.fillStyle = '#f4dfb8';
        ctx.fillRect(0, 0, Math.max(2, w * 0.003), h);
      }
      ctx.restore();
    }
    return;
  }
  if (t < 11.55) {
    const walk = ease(t, 9.76, 11.12);
    ground();
    plate('rua', 1 + walk * 0.039, 0, -walk * ph * 0.005);
    const cut = frames.margem;
    const target = (tall ? 0.34 : 0.32) * pw;
    const x = px - target * mix(0.97, 0.57, walk);
    if (cut) ctx.drawImage(cut, x, py - ph * 0.06, target, (target * cut.height) / cut.width);
    if (t > 10.94) {
      // The edge of the print lifts along the park's long roof. The far pavilions stay fixed.
      const p = ease(t, 10.94, 11.55);
      const k = (w + h * 0.34) * p;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(w - k, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(w - k + h * 0.34, h);
      ctx.closePath();
      ctx.clip();
      aerial();
      ctx.restore();
    }
    return;
  }
  aerial();
}
