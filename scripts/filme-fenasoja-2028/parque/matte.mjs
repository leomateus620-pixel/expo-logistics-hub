import * as T from "three";
import { vegetationClass } from "./vegetacao.mjs";

// Vermelho = copas. Verde = gramados. Azul = madeira. Oclusão vem da cena inteira.
const maskCache = new Map();
export function paintMask({ gl, scene, camera }) {
  const restore = [];
  const oldBackground = scene.background;
  scene.background = new T.Color(0);
  scene.traverse((o) => {
    if ((o.isMesh || o.isSprite || o.isLine) && o.visible) {
      if (o.name === "CommercialMapPhysicalSunriseSky" || o.isSprite || o.isLine) {
        restore.push([o, "visible", true]);
        o.visible = false;
        return;
      }
      const old = o.material;
      if (!old) return;
      const tag = old.userData?.filmNature || vegetationClass(o);
      const convert = (oldM) => {
        const key = oldM.uuid + "/" + tag;
        if (maskCache.has(key)) return maskCache.get(key);
        const m = new T.MeshBasicMaterial({
          map: oldM.map || null,
          alphaMap: oldM.alphaMap || null,
          side: oldM.side,
          alphaTest: oldM.alphaTest || (oldM.transparent ? 0.45 : 0),
          depthWrite: true,
          toneMapped: false,
          polygonOffset: oldM.polygonOffset,
          polygonOffsetFactor: oldM.polygonOffsetFactor,
          polygonOffsetUnits: oldM.polygonOffsetUnits,
        });
        m.fog = false;
        const rgb = tag === "leaf" ? "1.,0.,0." : tag === "grass" ? "0.,1.,0." : tag === "wood" ? "0.,0.,1." : "0.,0.,0.";
        m.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace(
            "#include <opaque_fragment>",
            "outgoingLight=vec3(" + rgb + ");\n#include <opaque_fragment>",
          );
        };
        m.customProgramCacheKey = () => key;
        maskCache.set(key, m);
        return m;
      };
      restore.push([o, "material", old]);
      o.material = Array.isArray(old) ? old.map(convert) : convert(old);
    }
  });
  gl.render(scene, camera);
  const png = gl.domElement.toDataURL("image/png").split(",")[1];
  for (const [o, k, v] of restore) o[k] = v;
  scene.background = oldBackground;
  return png;
}
