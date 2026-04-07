import { useEffect, useState } from 'react';
import splashImg from '@/assets/fenasoja-splash-2026.png';

interface SplashScreenProps {
  onComplete: () => void;
}

const PARTICLES = Array.from({ length: 6 }, (_, i) => ({
  id: i,
  size: 4 + Math.random() * 6,
  left: 10 + Math.random() * 80,
  delay: Math.random() * 2,
  duration: 3 + Math.random() * 2,
}));

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<'enter' | 'float' | 'exit'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('float'), 800);
    const t2 = setTimeout(() => setPhase('exit'), 2200);
    const t3 = setTimeout(onComplete, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  return (
    <div className="splash-backdrop fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
      {/* Particles */}
      {PARTICLES.map((p) => (
        <span
          key={p.id}
          className="splash-particle"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            bottom: '-10%',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}

      {/* 3D Card */}
      <div className="splash-perspective">
        <div className={`splash-card splash-card--${phase}`}>
          <img
            src={splashImg}
            alt="Fenasoja 2026 — Nosso Ouro Vem do Campo"
            className="splash-image"
            draggable={false}
          />
          {/* Shine overlay */}
          <div className="splash-shine" />
        </div>
      </div>
    </div>
  );
}
