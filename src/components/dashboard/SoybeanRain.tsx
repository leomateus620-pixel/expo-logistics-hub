import { useEffect, useRef } from 'react';

/**
 * Chuva física de grãos de soja — canvas 2D com gravidade, sway, rotação e bounce.
 * - Pausa em aba inativa
 * - Respeita prefers-reduced-motion
 * - GPU-friendly (single canvas, ~40 partículas máx)
 */

interface Grain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rx: number;          // raio horizontal
  ry: number;          // raio vertical
  rot: number;         // rotação atual (rad)
  vrot: number;        // velocidade angular
  life: number;        // 0..1 fade
  bounced: number;     // contador de bounces
  alive: boolean;
}

const MAX_GRAINS = 38;
const SPAWN_INTERVAL_MS = 220;
const GRAVITY = 0.085;          // px/frame²
const AIR_FRICTION = 0.992;
const WIND_BASE = 0.015;
const BOUNCE_DAMPING = 0.38;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export default function SoybeanRain({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grainsRef = useRef<Grain[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastSpawnRef = useRef<number>(0);
  const windRef = useRef<{ value: number; target: number; nextChange: number }>({
    value: 0,
    target: 0,
    nextChange: 0,
  });
  const reducedRef = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    reducedRef.current = reduced;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const spawnGrain = () => {
      if (grainsRef.current.length >= MAX_GRAINS) return;
      const ry = rand(3.5, 5.5);
      const rx = ry * rand(1.25, 1.45);
      grainsRef.current.push({
        x: rand(-10, width + 10),
        y: rand(-30, -8),
        vx: rand(-0.3, 0.3),
        vy: rand(0.4, 1.2),
        rx,
        ry,
        rot: rand(0, Math.PI * 2),
        vrot: rand(-0.06, 0.06),
        life: 1,
        bounced: 0,
        alive: true,
      });
    };

    // Pré-popular grãos estáticos quando reduced motion
    if (reduced) {
      for (let i = 0; i < 4; i++) {
        grainsRef.current.push({
          x: rand(20, width - 20),
          y: rand(20, height - 20),
          vx: 0, vy: 0,
          rx: 6, ry: 4.5,
          rot: rand(0, Math.PI * 2),
          vrot: 0,
          life: 0.6,
          bounced: 99,
          alive: true,
        });
      }
    }

    const drawGrain = (g: Grain) => {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.rot);
      ctx.globalAlpha = g.life;

      // Body — gradiente radial dourado
      const grad = ctx.createRadialGradient(-g.rx * 0.3, -g.ry * 0.35, 0, 0, 0, g.rx * 1.2);
      grad.addColorStop(0, '#FFF1B8');
      grad.addColorStop(0.35, '#F2C94C');
      grad.addColorStop(0.78, '#C9881C');
      grad.addColorStop(1, '#7A5210');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, g.rx, g.ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // Hilum (mancha característica)
      ctx.fillStyle = 'rgba(40, 24, 6, 0.78)';
      ctx.beginPath();
      ctx.ellipse(0, 0, g.rx * 0.32, g.ry * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();

      // Specular highlight
      const spec = ctx.createRadialGradient(-g.rx * 0.4, -g.ry * 0.45, 0, -g.rx * 0.4, -g.ry * 0.45, g.rx * 0.55);
      spec.addColorStop(0, 'rgba(255,255,255,0.7)');
      spec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spec;
      ctx.beginPath();
      ctx.ellipse(-g.rx * 0.4, -g.ry * 0.45, g.rx * 0.5, g.ry * 0.32, -0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 16.67, 2.5); // normaliza para ~60fps
      last = now;

      // Wind update
      const w = windRef.current;
      if (now > w.nextChange) {
        w.target = rand(-0.8, 0.8);
        w.nextChange = now + rand(3500, 6500);
      }
      w.value += (w.target - w.value) * 0.005 * dt;
      const wind = w.value * WIND_BASE;

      // Spawn
      if (!reducedRef.current && now - lastSpawnRef.current > SPAWN_INTERVAL_MS) {
        spawnGrain();
        lastSpawnRef.current = now;
      }

      ctx.clearRect(0, 0, width, height);

      const grains = grainsRef.current;
      for (let i = grains.length - 1; i >= 0; i--) {
        const g = grains[i];

        if (!reducedRef.current) {
          g.vy += GRAVITY * dt;
          g.vx += wind * dt;
          g.vx *= AIR_FRICTION;
          g.vy *= AIR_FRICTION;
          g.x += g.vx * dt;
          g.y += g.vy * dt;
          g.rot += g.vrot * dt;

          // Bounce na base
          const bottom = height - g.ry - 2;
          if (g.y >= bottom && g.vy > 0) {
            if (g.bounced < 2) {
              g.y = bottom;
              g.vy = -g.vy * BOUNCE_DAMPING;
              g.vx *= 0.7;
              g.vrot *= 0.5;
              g.bounced++;
            } else {
              g.life -= 0.06 * dt;
            }
          }

          // Fade after bounce
          if (g.bounced >= 2) g.life -= 0.025 * dt;
        }

        drawGrain(g);

        // Remove
        if (g.life <= 0 || g.x < -40 || g.x > width + 40 || g.y > height + 60) {
          grains.splice(i, 1);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    // Pause when tab hidden
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
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      grainsRef.current = [];
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
        mixBlendMode: 'screen',
      }}
      aria-hidden
    />
  );
}
