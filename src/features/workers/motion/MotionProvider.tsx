import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';

const loadFeatures = () => import('./motionFeatures').then(module => module.default);
export function WorkersMotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={loadFeatures} strict><MotionConfig reducedMotion="never" transition={{ type: 'spring', stiffness: 260, damping: 24 }}>{children}</MotionConfig></LazyMotion>;
}
