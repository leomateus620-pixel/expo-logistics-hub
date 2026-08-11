import { Bloom, EffectComposer, N8AO, SMAA, Vignette } from '@react-three/postprocessing';
import type { AlvoradaQualityProfile } from './capabilities';

export function CinematicPostFX({ quality }: { quality: AlvoradaQualityProfile }) {
  if (!quality.postprocessing) return null;

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <SMAA />
      <N8AO
        aoRadius={quality.mobile ? 0.48 : 0.68}
        distanceFalloff={1.35}
        intensity={quality.mobile ? 0.72 : 0.86}
        quality={quality.level === 'high' ? 'medium' : 'performance'}
        halfRes
      />
      {quality.bloom && (
        <Bloom
          intensity={0.16}
          luminanceThreshold={1.05}
          luminanceSmoothing={0.16}
          mipmapBlur
        />
      )}
      <Vignette eskil={false} offset={0.24} darkness={0.17} />
    </EffectComposer>
  );
}
