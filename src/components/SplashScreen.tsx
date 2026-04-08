import { useEffect, useState, useRef } from 'react';
import splashImg from '@/assets/fenasoja-splash-2026.png';

interface SplashScreenProps {
  onComplete: () => void;
}

const GRAINS = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  size: 12 + Math.random() * 16,
  left: Math.random() * 100,
  delay: Math.random() * 2,
  duration: 1.8 + Math.random() * 1.7,
  rotateStart: Math.floor(Math.random() * 360),
  rotateEnd: Math.floor(Math.random() * 360),
  sway: -20 + Math.random() * 40,
}));

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<'loading' | 'enter' | 'float' | 'exit'>('loading');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const img = new Image();
    img.src = splashImg;

    const startAnimation = () => {
      setPhase('enter');
      const t1 = setTimeout(() => setPhase('float'), 800);
      const t2 = setTimeout(() => setPhase('exit'), 2200);
      const t3 = setTimeout(onComplete, 3000);
      timersRef.current = [t1, t2, t3];
    };

    if (img.complete && img.naturalWidth > 0) {
      startAnimation();
    } else {
      img.onload = startAnimation;
      img.onerror = () => setTimeout(startAnimation, 500);
    }

    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, [onComplete]);

  return (
    <div className="splash-backdrop fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
      {/* Soybean grains */}
      {GRAINS.map((g) => (
        <div
          key={g.id}
          className="soybean-grain"
          style={{
            width: g.size,
            height: g.size * 0.72,
            left: `${g.left}%`,
            top: '-5%',
            animationDelay: `${g.delay}s`,
            animationDuration: `${g.duration}s`,
            ['--rotate-start' as string]: `${g.rotateStart}deg`,
            ['--rotate-end' as string]: `${g.rotateEnd}deg`,
            ['--sway' as string]: `${g.sway}px`,
          }}
        />
      ))}

      {/* 3D Card */}
      <div className="splash-perspective">
        <div
          className={`splash-card ${phase !== 'loading' ? `splash-card--${phase}` : ''}`}
          style={{ opacity: phase === 'loading' ? 0 : undefined }}
        >
          <div className="splash-image-wrap">
            <img
              src={splashImg}
              alt="Fenasoja 2026 — Nosso Ouro Vem do Campo"
              className="splash-image"
              draggable={false}
            />
          </div>
          <div className="splash-shine" />
        </div>
      </div>
    </div>
  );
}
