import * as THREE from 'three';
import { EXTERNAL_LOT_PALETTE } from '../../utils/externalLotPresentation';

// Invert the Three r170 ACES fit once for the two unlit status inks. The HDR
// composer grades its entire input; these scene-linear values yield the same
// display colour as the direct material after its tone-mapping chunk.
function statusBeforeAces(hex: string) {
  const color = new THREE.Color(hex);
  const input = new THREE.Matrix3().set(.59719,.35458,.04823, .076,.90834,.01566, .0284,.13383,.83777);
  const output = new THREE.Matrix3().set(1.60475,-.53108,-.07367, -.10208,1.10813,-.00605, -.00327,-.07276,1.07602);
  const fit = new THREE.Vector3(color.r, color.g, color.b).applyMatrix3(output.invert());
  const inverse = (v: number) => {
    const a = .983729 * v - 1;
    const b = .432951 * v - .0245786;
    const c = .238081 * v + .000090537;
    return (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  };
  return fit.set(inverse(fit.x), inverse(fit.y), inverse(fit.z)).applyMatrix3(input.invert()).multiplyScalar(.6);
}
const HDR_OPEN = statusBeforeAces(EXTERNAL_LOT_PALETTE.open);
const HDR_SOLD = statusBeforeAces(EXTERNAL_LOT_PALETTE.sold);

export const statusInkUniforms = {
  uExternalStatusOpen: { value: new THREE.Color(EXTERNAL_LOT_PALETTE.open) },
  uExternalStatusSold: { value: new THREE.Color(EXTERNAL_LOT_PALETTE.sold) },
  uExternalHdrOpen: { value: HDR_OPEN },
  uExternalHdrSold: { value: HDR_SOLD },
};

export function statusInkExposure(material: THREE.Material) {
  const uniform = { value: 0 };
  const previous = material.onBeforeRender;
  material.onBeforeRender = function(renderer, ...args) {
    previous.call(this, renderer, ...args);
    uniform.value = renderer.getRenderTarget() && renderer.toneMapping === THREE.NoToneMapping
      ? 1 / Math.max(.001, renderer.toneMappingExposure) : 0;
  };
  return uniform;
}

/** The frame and the blue disk are separate unlit meshes. Vertex colours carry
 * the two inks and preserve the existing muted tints, white check and opacity. */
export function preserveStatusMarkerColor(material: THREE.MeshBasicMaterial) {
  const previousRender = material.onBeforeRender;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  const inverseExposure = statusInkExposure(material);
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, statusInkUniforms, { uExternalInverseExposure: inverseExposure });
    shader.vertexShader = `uniform vec3 uExternalStatusOpen, uExternalStatusSold;
      uniform vec3 uExternalHdrOpen, uExternalHdrSold;
      uniform float uExternalInverseExposure;
      ` + shader.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
      #if defined(USE_COLOR) || defined(USE_BATCHING_COLOR) || defined(USE_INSTANCING_COLOR)
        if (uExternalInverseExposure > 0.) {
          if (distance(vColor.rgb, uExternalStatusOpen) < .002) vColor.rgb = uExternalHdrOpen * uExternalInverseExposure;
          else if (distance(vColor.rgb, uExternalStatusSold) < .002) vColor.rgb = uExternalHdrSold * uExternalInverseExposure;
        }
      #endif`);
  };
  material.customProgramCacheKey = () => 'external-status-ink-r170-v1';
  material.needsUpdate = true;
  return () => {
    material.onBeforeCompile = previousCompile;
    material.onBeforeRender = previousRender;
    material.customProgramCacheKey = previousKey;
    material.needsUpdate = true;
  };
}
