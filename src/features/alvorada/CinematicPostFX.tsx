import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing';
import type { AlvoradaQualityProfile } from './capabilities';

export function CinematicPostFX({ quality }: { quality: AlvoradaQualityProfile }) {
  if (!quality.postprocessing) return null;

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <SMAA />
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
