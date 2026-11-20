import * as THREE from "three";
import type { CommercialRainRuntime } from "../../../utils/rainRuntime";

interface KeyProjection {
  depthTexture: string;
  matrix: number[];
  direction: [number, number, number];
  color: [number, number, number];
  intensity: number;
  bias: number;
  resolution: number;
}

const shadowVertex = /* glsl */ `
  vec4 b12KeyVertex = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    b12KeyVertex = batchingMatrix * b12KeyVertex;
  #endif
  #ifdef USE_INSTANCING
    b12KeyVertex = instanceMatrix * b12KeyVertex;
  #endif
  vB12KeyProjection = (b12WorldToKey * modelMatrix * b12KeyVertex).xyz;
`;

const shadowFragment = /* glsl */ `
  varying vec3 vB12KeyProjection;
  uniform sampler2D b12KeyDepth;
  uniform vec3 b12KeyDirection;
  uniform vec3 b12KeyColor;
  uniform float b12KeyBias;
  uniform float b12KeyTexel;
  uniform float b12KeyNight;
  uniform float b12KeyRain;
  uniform float b12KeyStrength;

  float b12CompareKeyDepth(vec2 uv, float receiver) {
    vec2 bytes = texture2D(b12KeyDepth, uv).rg;
    float blocker = dot(bytes, vec2(65280.0, 255.0)) / 65535.0;
    return step(receiver, blocker);
  }

  float b12KeyVisibility(vec3 projection, float incidence) {
    if (any(lessThan(projection, vec3(0.0))) || any(greaterThan(projection, vec3(1.0)))) return 1.0;
    float receiver = projection.z - b12KeyBias * (2.0 - incidence);
    vec2 delta = vec2(b12KeyTexel * 0.85);
    vec2 uv = projection.xy;
    return (2.0 * b12CompareKeyDepth(uv, receiver)
      + b12CompareKeyDepth(uv - delta, receiver)
      + b12CompareKeyDepth(uv + delta, receiver)
      + b12CompareKeyDepth(uv + vec2(delta.x, -delta.y), receiver)
      + b12CompareKeyDepth(uv + vec2(-delta.x, delta.y), receiver)) / 6.0;
  }
`;

const directKey = /* glsl */ `
  float b12Daylight = (1.0 - b12KeyNight) * (1.0 - b12KeyRain) * b12KeyStrength;
  if (b12Daylight > 0.001) {
    // Keep the park's ambient/reflection environment and transition away from
    // its competing direct key only on these surfaces.
    float b12ParkDirect = mix(1.0, 0.35, b12Daylight);
    reflectedLight.directDiffuse *= b12ParkDirect;
    reflectedLight.directSpecular *= b12ParkDirect;
    #ifdef USE_CLEARCOAT
      clearcoatSpecularDirect *= b12ParkDirect;
    #endif
    #ifdef USE_SHEEN
      sheenSpecularDirect *= b12ParkDirect;
    #endif
    IncidentLight b12Light;
    b12Light.direction = normalize(mat3(viewMatrix) * b12KeyDirection);
    float b12Incidence = clamp(dot(geometryNormal, b12Light.direction), 0.0, 1.0);
    b12Light.color = b12KeyColor * b12Daylight * b12KeyVisibility(vB12KeyProjection, b12Incidence);
    b12Light.visible = true;
    RE_Direct(b12Light, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  }
`;

function createKeyLight(
  projection: KeyProjection,
  texture: THREE.Texture,
  atmosphere: CommercialRainRuntime,
) {
  const localToKey = new THREE.Matrix4().fromArray(projection.matrix);
  const localDirection = new THREE.Vector3(...projection.direction);
  const lastWorld = new THREE.Matrix4().makeScale(0, 0, 0);
  const inverseWorld = new THREE.Matrix4();
  const uniforms = {
    b12WorldToKey: { value: new THREE.Matrix4() },
    b12KeyDepth: { value: texture },
    b12KeyDirection: { value: new THREE.Vector3() },
    b12KeyColor: { value: new THREE.Vector3(...projection.color).multiplyScalar(projection.intensity) },
    b12KeyBias: { value: projection.bias },
    b12KeyTexel: { value: 1 / projection.resolution },
    b12KeyNight: atmosphere.night,
    b12KeyRain: atmosphere.blend,
  };

  return {
    apply(material: THREE.MeshStandardMaterial, strength = 1) {
      const upstream = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey();
      const intensity = { value: strength };
      material.onBeforeCompile = (shader, renderer) => {
        upstream.call(material, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.uniforms.b12KeyStrength = intensity;
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nuniform mat4 b12WorldToKey;\nvarying vec3 vB12KeyProjection;")
          .replace("#include <project_vertex>", "#include <project_vertex>\n" + shadowVertex);
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\n" + shadowFragment)
          .replace("#include <lights_fragment_begin>", "#include <lights_fragment_begin>\n" + directKey)
          .replace("#include <aomap_fragment>", "#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= mix(1.0, 0.82, b12Daylight);");
      };
      material.customProgramCacheKey = () => previousKey + ":b12-local-key-r170-v2";
      material.needsUpdate = true;
    },
    place(world: THREE.Matrix4) {
      if (lastWorld.equals(world)) return;
      lastWorld.copy(world);
      inverseWorld.copy(world).invert();
      uniforms.b12WorldToKey.value.multiplyMatrices(localToKey, inverseWorld);
      uniforms.b12KeyDirection.value.copy(localDirection).transformDirection(world);
    },
    dispose: () => texture.dispose(),
  };
}

export async function loadRefinedLighting(
  base: string,
  signal: AbortSignal,
  atmosphere: CommercialRainRuntime,
) {
  try {
    const response = await fetch(new URL("lighting.json", base), { signal });
    if (!response.ok) return null;
    const projection: KeyProjection = await response.json();
    if (projection.matrix.length !== 16 || !projection.matrix.every(Number.isFinite) ||
        projection.direction.length !== 3 || !projection.direction.every(Number.isFinite) ||
        projection.color.length !== 3 || !projection.color.every(Number.isFinite) ||
        !Number.isFinite(projection.intensity) || projection.intensity <= 0 ||
        !Number.isFinite(projection.bias) || projection.bias < 0 ||
        !Number.isInteger(projection.resolution) || projection.resolution < 1 ||
        !/^[a-z0-9-]+\.png$/.test(projection.depthTexture)) return null;
    const depth = await fetch(new URL(projection.depthTexture, base), { signal });
    if (!depth.ok) return null;
    const uri = URL.createObjectURL(await depth.blob());
    const image = new Image();
    try {
      image.src = uri;
      await image.decode();
      signal.throwIfAborted();
      if (image.width !== projection.resolution || image.height !== projection.resolution)
        return null;
    } finally {
      URL.revokeObjectURL(uri);
    }
    const texture = new THREE.Texture(image);
    texture.name = "B12 authored key depth";
    texture.flipY = true;
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return createKeyLight(projection, texture, atmosphere);
  } catch {
    // The key is an enhancement. A missing or invalid sidecar keeps park lighting.
    return null;
  }
}
