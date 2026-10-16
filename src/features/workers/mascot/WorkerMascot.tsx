import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { m } from 'motion/react';
import type { MascotMood, MascotShape } from '../types';
import { mascotPaths } from './shapes';
import { useMascotLife } from './useMascotLife';
import './mascot.css';

export interface WorkerMascotProps { shape: MascotShape; color: string; mood?: MascotMood; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number; interactive?: boolean; seed?: string; paused?: boolean; ariaLabel?: string; className?: string }
const sizes = { xs: 24, sm: 40, md: 64, lg: 120, xl: 200 };
export function WorkerMascot({ shape, color, mood = 'idle', size = 'md', interactive = false, seed = shape, paused = false, ariaLabel, className = '' }: WorkerMascotProps) {
  const id = useId().replace(/:/g, ''); const ref = useRef<HTMLSpanElement>(null);
  const { active, blinking, pupilX, pupilY, rhythm } = useMascotLife(ref, { seed, paused, interactive });
  const [happy, setHappy] = useState(false); const happyTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(happyTimer.current), []);
  const actualMood = happy ? 'happy' : mood;
  const react = () => { if (!interactive) return; setHappy(true); clearTimeout(happyTimer.current); happyTimer.current = setTimeout(() => setHappy(false), 600); };
  const px = typeof size === 'number' ? size : sizes[size];
  return <m.span ref={ref} className={`worker-mascot ${className}`} data-mood={actualMood} data-active={active} style={{ width: px, height: px, '--worker-mascot-color': color } as CSSProperties} tabIndex={-1} aria-hidden={ariaLabel ? undefined : true} aria-label={ariaLabel} role={ariaLabel ? 'img' : undefined} onHoverStart={react} onPointerDown={react} whileHover={interactive ? { scaleX: 1.04, scaleY: .96 } : undefined} whileTap={interactive ? { scale: .92, y: -5 } : undefined}>
    <svg viewBox="0 0 200 200" fill="none" focusable="false">
      <defs>
        <radialGradient id={`body-${id}`} cx=".32" cy=".18" r=".9"><stop stopColor="white" stopOpacity=".6" /><stop offset=".26" stopColor={color} /><stop offset=".7" stopColor={color} /><stop offset="1" stopColor="var(--worker-mascot-shade, #031834)" stopOpacity=".68" /></radialGradient>
        <radialGradient id={`shine-${id}`} cx=".3" cy=".15" r=".75"><stop stopColor="white" stopOpacity=".72" /><stop offset=".54" stopColor="white" stopOpacity="0" /></radialGradient>
        <radialGradient id={`shadow-${id}`}><stop stopColor={color} stopOpacity=".2" /><stop offset="1" stopColor={color} stopOpacity="0" /></radialGradient>
      </defs>
      <m.ellipse cx="101" cy="178" rx="61" ry="11" fill={`url(#shadow-${id})`} animate={active ? { scaleX: [1, .77, 1], opacity: [.85, .5, .85] } : { scaleX: 1, opacity: .65 }} transition={{ duration: rhythm.duration, repeat: active ? Infinity : 0, ease: 'easeInOut', delay: rhythm.delay }} style={{ transformOrigin: '101px 178px' }} />
      {actualMood === 'needsYou' && <><m.circle cx="101" cy="100" r="78" stroke="#1A6CCB" strokeWidth="2" animate={active ? { scale: [1, 1.2], opacity: [.5, 0] } : { opacity: .4 }} transition={{ duration: 1.8, repeat: active ? Infinity : 0 }} style={{ transformOrigin: '101px 100px' }} /><circle cx="165" cy="48" r="8" fill="#1A6CCB" stroke="white" strokeWidth="3" /></>}
      <m.g animate={active ? { y: [0, -3, 0], scale: [1, 1.02, 1] } : { y: 0, scale: 1 }} transition={{ duration: rhythm.duration, repeat: active ? Infinity : 0, ease: 'easeInOut', delay: rhythm.delay }} style={{ transformOrigin: '100px 100px' }}>
        <m.g animate={active ? { rotate: [-2, 2, -2] } : { rotate: 0 }} transition={{ duration: rhythm.rotateDuration, repeat: active ? Infinity : 0, ease: 'easeInOut', delay: rhythm.delay }} style={{ transformOrigin: '100px 100px' }}>
          <path d={mascotPaths[shape]} fill={color} /><path d={mascotPaths[shape]} fill={`url(#body-${id})`} /><path d={mascotPaths[shape]} fill={`url(#shine-${id})`} stroke="white" strokeOpacity=".25" strokeWidth="1.5" />
          {shape === 'cubo' && <path d="M44 62L116 67L153 52M116 67L111 145" stroke="white" strokeOpacity=".12" strokeWidth="2" />}
          {shape === 'hexagono' && <path d="M43 73L101 91L157 71M101 91V158" stroke="white" strokeOpacity=".18" strokeWidth="2" />}
          {actualMood === 'happy' || actualMood === 'sleeping' ? <g stroke="#031834" strokeWidth="5" strokeLinecap="round"><path d={actualMood === 'happy' ? 'M76 100Q83 89 90 100' : 'M76 101Q83 105 90 101'} /><path d={actualMood === 'happy' ? 'M108 100Q115 89 122 100' : 'M108 101Q115 105 122 101'} /></g> : <m.g animate={{ scaleY: blinking ? .1 : 1 }} transition={{ duration: .07 }} style={{ transformOrigin: '100px 100px' }}>
            <ellipse cx="83" cy="100" rx="9" ry="13" fill="white" /><ellipse cx="115" cy="100" rx="9" ry="13" fill="white" />
            <m.g className="worker-mascot-pupils" style={actualMood === 'thinking' ? { x: 2, y: -3 } : { x: pupilX, y: pupilY }}><ellipse cx="84" cy={actualMood === 'sad' ? 103 : 101} rx="5.5" ry="9" fill="#031834" /><ellipse cx="116" cy={actualMood === 'sad' ? 103 : 101} rx="5.5" ry="9" fill="#031834" /><circle cx="85" cy="97" r="1.8" fill="white" /><circle cx="117" cy="97" r="1.8" fill="white" /></m.g>
          </m.g>}
          {actualMood === 'talking' && <m.ellipse cx="100" cy="125" rx="5" ry="4" fill="#031834" animate={active ? { scaleY: [.4, 1.4, .4] } : { scaleY: 1 }} transition={{ duration: .45, repeat: active ? Infinity : 0 }} style={{ transformOrigin: '100px 125px' }} />}
          {actualMood === 'sad' && <path d="M94 126Q100 121 106 126" stroke="#031834" strokeWidth="3" strokeLinecap="round" />}
          {actualMood === 'happy' && <path d="M94 122Q100 129 106 122" stroke="#031834" strokeWidth="3" strokeLinecap="round" />}
        </m.g>
      </m.g>
      {actualMood === 'thinking' && [0, 1, 2].map(dot => <m.circle key={dot} cx={86 + dot * 15} cy="24" r="3.5" fill={color} animate={active ? { y: [0, -5, 0], opacity: [.35, 1, .35] } : { opacity: .7 }} transition={{ duration: 1.1, repeat: active ? Infinity : 0, delay: dot * .15 }} />)}
    </svg>
  </m.span>;
}
