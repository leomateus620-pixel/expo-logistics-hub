import { useEffect, useRef } from 'react';

interface SoybeanParticle {
  x: number;
  y: number;
  scale: number;
  speed: number;
  drift: number;
  phase: number;
  frequency: number;
  rotation: number;
  spin: number;
  opacity: number;
}

function seededValue(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43_758.5453;
  return value - Math.floor(value);
}

function createSoybeanSprite() {
  const sprite = document.createElement('canvas');
  sprite.width = 64;
  sprite.height = 44;
  const context = sprite.getContext('2d');
  if (!context) return sprite;

  context.save();
  context.translate(32, 22);
  context.rotate(-0.16);
  context.shadowColor = 'rgba(9, 38, 21, 0.42)';
  context.shadowBlur = 8;
  context.shadowOffsetY = 4;

  const fill = context.createRadialGradient(-7, -7, 1, 0, 0, 24);
  fill.addColorStop(0, '#fff1a3');
  fill.addColorStop(0.35, '#e6c85e');
  fill.addColorStop(0.78, '#b89327');
  fill.addColorStop(1, '#755d16');

  context.beginPath();
  context.ellipse(0, 0, 20, 13, 0, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();

  context.shadowColor = 'transparent';
  context.beginPath();
  context.moveTo(-15, 1);
  context.quadraticCurveTo(-2, 7, 15, -1);
  context.strokeStyle = 'rgba(92, 68, 12, 0.34)';
  context.lineWidth = 1.4;
  context.stroke();

  context.beginPath();
  context.ellipse(-7, -5, 4.5, 2.2, -0.2, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255, 255, 222, 0.34)';
  context.fill();
  context.restore();

  return sprite;
}

function buildParticles(width: number, height: number, reducedMotion: boolean) {
  const density = reducedMotion
    ? 7
    : Math.min(24, Math.max(11, Math.round((width * height) / 44_000)));

  return Array.from({ length: density }, (_, index): SoybeanParticle => ({
    x: seededValue(index + 1) * width,
    y: seededValue(index + 21) * (height + 120) - 100,
    scale: 0.38 + seededValue(index + 41) * 0.56,
    speed: 20 + seededValue(index + 61) * 34,
    drift: 4 + seededValue(index + 81) * 13,
    phase: seededValue(index + 101) * Math.PI * 2,
    frequency: 0.35 + seededValue(index + 121) * 0.55,
    rotation: seededValue(index + 141) * Math.PI * 2,
    spin: (seededValue(index + 161) - 0.5) * 0.48,
    opacity: 0.24 + seededValue(index + 181) * 0.42,
  }));
}

export function SoybeanParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;

    const sprite = createSoybeanSprite();
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;
    let particles: SoybeanParticle[] = [];
    let width = 1;
    let height = 1;
    let animationFrame = 0;
    let lastFrame = performance.now();
    let isIntersecting = true;
    let isDocumentVisible = document.visibilityState === 'visible';

    const draw = (timestamp: number, advance: boolean) => {
      const elapsedSeconds = Math.min(0.05, Math.max(0, timestamp - lastFrame) / 1_000);
      lastFrame = timestamp;
      context.clearRect(0, 0, width, height);

      particles.forEach((particle, index) => {
        if (advance) {
          particle.y += particle.speed * elapsedSeconds;
          particle.x += Math.sin(timestamp * 0.001 * particle.frequency + particle.phase)
            * particle.drift
            * elapsedSeconds;
          particle.rotation += particle.spin * elapsedSeconds;

          if (particle.y > height + 36) {
            particle.y = -36 - seededValue(index + Math.round(timestamp)) * 90;
            particle.x = seededValue(index + Math.round(timestamp / 13)) * width;
          }
          if (particle.x < -40) particle.x = width + 40;
          if (particle.x > width + 40) particle.x = -40;
        }

        context.save();
        context.globalAlpha = particle.opacity;
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        const spriteWidth = 34 * particle.scale;
        const spriteHeight = 23 * particle.scale;
        context.drawImage(sprite, -spriteWidth / 2, -spriteHeight / 2, spriteWidth, spriteHeight);
        context.restore();
      });
    };

    const stopAnimation = () => {
      if (!animationFrame) return;
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const animate = (timestamp: number) => {
      animationFrame = 0;
      if (reducedMotion || !isIntersecting || !isDocumentVisible) return;
      draw(timestamp, true);
      animationFrame = window.requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (animationFrame || reducedMotion || !isIntersecting || !isDocumentVisible) return;
      lastFrame = performance.now();
      animationFrame = window.requestAnimationFrame(animate);
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      particles = buildParticles(width, height, reducedMotion);
      draw(performance.now(), false);
      startAnimation();
    };

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      particles = buildParticles(width, height, reducedMotion);
      if (reducedMotion) {
        stopAnimation();
        draw(performance.now(), false);
      } else {
        startAnimation();
      }
    };

    const handleVisibility = () => {
      isDocumentVisible = document.visibilityState === 'visible';
      if (isDocumentVisible) startAnimation();
      else stopAnimation();
    };

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(resize);
    const intersectionObserver = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
        isIntersecting = entry.isIntersecting;
        if (isIntersecting) startAnimation();
        else stopAnimation();
      }, { rootMargin: '100px' });

    resizeObserver?.observe(canvas);
    intersectionObserver?.observe(canvas);
    if (!resizeObserver) window.addEventListener('resize', resize, { passive: true });
    motionQuery.addEventListener('change', handleMotionPreference);
    document.addEventListener('visibilitychange', handleVisibility);
    resize();

    return () => {
      stopAnimation();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', resize);
      motionQuery.removeEventListener('change', handleMotionPreference);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="fenasoja-soy-canvas" aria-hidden="true" />;
}
