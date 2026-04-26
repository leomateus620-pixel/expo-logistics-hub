import { useEffect, useRef } from 'react';

/**
 * Chuva contínua de grãos de soja — alta performance.
 * - Sprites pré-renderizados (offscreen) para evitar custos de gradiente por frame
 * - Loop time-based (independente de refresh rate)
 * - Densidade adaptada para mobile/desktop
 * - Pré-população para iniciar com chuva já estabelecida
 * - Pausa em aba inativa, respeita prefers-reduced-motion
 */

interface Grain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;        // multiplicador do sprite (0.7..1.15)
  spriteIdx: number;
  rot: number;
  vrot: number;
  swayPhase: number;
  swayAmp: number;
  life: number;
  bounced: number;
  alive: boolean;
}

// Constantes em unidades reais (px, segundos)
const GRAVITY = 380;             // px/s²
const AIR_FRICTION = 0.55;       // por segundo (aplicada como pow(AIR_FRICTION, dt))
const WIND_SCALE = 18;           // px/s² por unidade de wind
const BOUNCE_DAMPING = 0.36;
const SPRITE_VARIATIONS = 6;
const SPRITE_BASE_SIZE = 14;     // tamanho lógico base do sprite (raio horizontal ~7)

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function detectCapability(): { maxGrains: number; spawnIntervalMs: number; isMobile: boolean } {
  if (typeof window === 'undefined') {
    return { maxGrains: 50, spawnIntervalMs: 95, isMobile: false };
  }
  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  const lowCpu = (navigator.hardwareConcurrency || 8) < 4;
  if (isMobile || lowCpu) {
    return { maxGrains: 32, spawnIntervalMs: 130, isMobile: true };
  }
  return { maxGrains: 55, spawnIntervalMs: 90, isMobile: false };
}

/**
 * Renderiza um sprite de grão de soja em um canvas offscreen.
 * Inclui body com gradiente, hilum e specular highlight.
 */
function buildGrainSprite(dpr: number): HTMLCanvasElement {
  const size = SPRITE_BASE_SIZE * 2 * dpr; // padding generoso para sombra/blur
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const cx = SPRITE_BASE_SIZE;
  const cy = SPRITE_BASE_SIZE;
  const rx = rand(5.0, 6.4);
  const ry = rx / rand(1.28, 1.45);

  ctx.translate(cx, cy);

  // Body — gradiente radial dourado
  const grad = ctx.createRadialGradient(-rx * 0.3, -ry * 0.35, 0, 0, 0, rx * 1.2);
  grad.addColorStop(0, '#FFF1B8');
  grad.addColorStop(0.35, '#F2C94C');
  grad.addColorStop(0.78, '#C9881C');
  grad.addColorStop(1, '#7A5210');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Borda sutil para definição
  ctx.strokeStyle = 'rgba(60, 36, 8, 0.35)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Hilum (mancha característica)
  ctx.fillStyle = 'rgba(40, 24, 6, 0.78)';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.32, ry * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Specular highlight
  const spec = ctx.createRadialGradient(-rx * 0.4, -ry * 0.45, 0, -rx * 0.4, -ry * 0.45, rx * 0.55);
  spec.addColorStop(0, 'rgba(255,255,255,0.78)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spec;
  ctx.beginPath();
  ctx.ellipse(-rx * 0.4, -ry * 0.45, rx * 0.5, ry * 0.32, -0.4, 0, Math.PI * 2);
  ctx.fill();

  return c;
}

export default function SoybeanRain({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grainsRef = useRef<Grain[]>([]);
  const spritesRef = useRef<HTMLCanvasElement[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastSpawnRef = useRef<number>(0);
  const windRef = useRef<{ value: number; target: number; nextChange: number }>({
    value: 0,
    target: 0,
    nextChange: 0,
  });
  const reducedRef = useRef<boolean>(false);
  const capabilityRef = useRef(detectCapability());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    reducedRef.current = reduced;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let initialized = false;

    // Build sprite cache (uma vez)
    spritesRef.current = Array.from({ length: SPRITE_VARIATIONS }, () => buildGrainSprite(dpr));

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const w = Math.max(0, rect.width);
      const h = Math.max(0, rect.height);
      if (w === 0 || h === 0) return false;
      width = w;
      height = h;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    };

    const cap = capabilityRef.current;

    const makeGrain = (preExisting: boolean): Grain => {
      const size = rand(0.78, 1.12);
      return {
        x: rand(-10, width + 10),
        y: preExisting ? rand(0, height) : rand(-40, -8),
        vx: rand(-15, 15),
        vy: preExisting ? rand(60, 140) : rand(20, 60),
        size,
        spriteIdx: Math.floor(Math.random() * SPRITE_VARIATIONS),
        rot: rand(0, Math.PI * 2),
        vrot: rand(-1.6, 1.6),
        swayPhase: rand(0, Math.PI * 2),
        swayAmp: rand(0.4, 1.2),
        life: 1,
        bounced: 0,
        alive: true,
      };
    };

    const populateInitial = () => {
      if (reducedRef.current) {
        // Modo reduzido: poucos grãos estáticos espalhados
        for (let i = 0; i < 5; i++) {
          grainsRef.current.push({
            x: rand(20, width - 20),
            y: rand(20, height - 20),
            vx: 0, vy: 0,
            size: 1,
            spriteIdx: i % SPRITE_VARIATIONS,
            rot: rand(0, Math.PI * 2),
            vrot: 0,
            swayPhase: 0,
            swayAmp: 0,
            life: 0.7,
            bounced: 99,
            alive: true,
          });
        }
        return;
      }
      const seed = Math.floor(cap.maxGrains * 0.42);
      for (let i = 0; i < seed; i++) grainsRef.current.push(makeGrain(true));
    };

    const tryInit = () => {
      if (initialized) return;
      if (!resize()) return;
      populateInitial();
      initialized = true;
    };

    // Tentativa inicial + retry se o container 3D ainda não tem dimensão
    requestAnimationFrame(() => {
      tryInit();
      if (!initialized) {
        setTimeout(() => {
          tryInit();
        }, 100);
      }
    });

    // ResizeObserver com debounce via rAF
    let rafResize = 0;
    const ro = new ResizeObserver(() => {
      if (rafResize) cancelAnimationFrame(rafResize);
      rafResize = requestAnimationFrame(() => {
        if (!initialized) tryInit();
        else resize();
      });
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const sprites = spritesRef.current;

    const drawGrain = (g: Grain) => {
      const sprite = sprites[g.spriteIdx];
      if (!sprite) return;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.rot);
      ctx.globalAlpha = g.life;
      const s = SPRITE_BASE_SIZE * g.size;
      ctx.drawImage(sprite, -s, -s, s * 2, s * 2);
      ctx.restore();
    };

    let last = performance.now();
    const tick = (now: number) => {
      let dt = (now - last) / 1000;
      last = now;

      // Skip frame se voltou de background ou stutter grande
      if (dt > 0.1) dt = 0;
      if (dt > 0.05) dt = 0.05;

      // Wind update (suave)
      const w = windRef.current;
      if (now > w.nextChange) {
        w.target = rand(-1, 1);
        w.nextChange = now + rand(3500, 6500);
      }
      w.value += (w.target - w.value) * Math.min(1, dt * 0.8);

      if (initialized && width > 0 && height > 0) {
        // Spawn
        if (!reducedRef.current && now - lastSpawnRef.current > cap.spawnIntervalMs) {
          if (grainsRef.current.length < cap.maxGrains) {
            grainsRef.current.push(makeGrain(false));
          }
          lastSpawnRef.current = now;
        }

        ctx.clearRect(0, 0, width, height);

        const friction = Math.pow(AIR_FRICTION, dt);
        const grains = grainsRef.current;
        for (let i = grains.length - 1; i >= 0; i--) {
          const g = grains[i];

          if (!reducedRef.current && dt > 0) {
            // Sway individual (oscilação senoidal)
            g.swayPhase += dt * 1.8;
            const sway = Math.sin(g.swayPhase) * g.swayAmp * 12; // px/s

            g.vy += GRAVITY * dt;
            g.vx += (w.value * WIND_SCALE + sway) * dt;
            g.vx *= friction;
            g.vy *= friction;
            g.x += g.vx * dt;
            g.y += g.vy * dt;
            g.rot += g.vrot * dt;

            // Bounce na base
            const bottom = height - SPRITE_BASE_SIZE * g.size * 0.5 - 2;
            if (g.y >= bottom && g.vy > 0) {
              if (g.bounced < 2) {
                g.y = bottom;
                g.vy = -g.vy * BOUNCE_DAMPING;
                g.vx *= 0.7;
                g.vrot *= 0.5;
                g.bounced++;
              } else {
                g.life -= 1.6 * dt;
              }
            }
            if (g.bounced >= 2) g.life -= 0.7 * dt;
          }

          drawGrain(g);

          if (g.life <= 0 || g.x < -40 || g.x > width + 40 || g.y > height + 60) {
            grains.splice(i, 1);
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    const onVis = () => {
      if (document.hidden) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (!rafRef.current) {
        last = performance.now();
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (rafResize) cancelAnimationFrame(rafResize);
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      grainsRef.current = [];
      spritesRef.current = [];
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1,
      }}
      aria-hidden
    />
  );
}
