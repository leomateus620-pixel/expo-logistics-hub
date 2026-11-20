import * as T from "three";
import { commercialMapSunriseDirection } from "/src/features/commercial-map/data/commercialMapEnvironment.ts";

const horizon = new T.Color("#c6cbc8");

/** Hemisfério celeste de Spruit Sunrise, Greg Zaal, CC0 (https://polyhaven.com/a/spruit_sunrise).
 * O recorte exclui vegetação, terreno, torres e linhas de energia da fotografia.
 * O azimute do disco solar fica amarrado à luz geográfica já usada pelo mapa.
 */
export async function morningSky(scene) {
  const sky = scene.getObjectByName("CommercialMapPhysicalSunriseSky");
  scene.fog = new T.Fog(horizon, 38, 250);
  scene.background = horizon;
  if (!sky) return;
  const photo = await new T.TextureLoader().loadAsync(new URL("./ceu.webp", import.meta.url).href);
  photo.wrapS = T.RepeatWrapping;
  photo.colorSpace = T.SRGBColorSpace;
  const [x, , z] = commercialMapSunriseDirection(7);
  const sunLongitude = Math.atan2(x, -z);
  sky.material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    uniforms: { photo: { value: photo }, sunLongitude: { value: sunLongitude } },
    vertexShader: `
      varying vec3 viewRay;
      void main() {
        viewRay = (modelMatrix * vec4(position, 1.)).xyz - cameraPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: `
      varying vec3 viewRay;
      uniform sampler2D photo;
      uniform float sunLongitude;
      void main() {
        vec3 direction = normalize(viewRay);
        float longitude = atan(direction.x, -direction.z);
        float elevation = asin(clamp(direction.y, 0., 1.));
        vec2 uv = vec2(.599 + (longitude - sunLongitude) / 6.283185, pow(elevation / 1.570796, .67));
        gl_FragColor = texture2D(photo, uv);
        #include <colorspace_fragment>
      }`,
  });
}
