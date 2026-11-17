import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FENASOJA_EVENT_CENTER_LAYOUT } from '../../utils/eventCenter';
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const NO_RAYCAST = () => undefined;
type Vector3Tuple = [number, number, number];

function paintEventCenterIdentity(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  symbol?: CanvasImageSource,
) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = 'rgba(0, 0, 0, .52)';
  context.shadowBlur = 10;
  context.shadowOffsetY = 4;

  if (symbol) {
    const symbolSize = 238;
    context.drawImage(symbol, (canvas.width - symbolSize) / 2, 8, symbolSize, symbolSize);
  }

  context.fillStyle = '#f8f8f3';
  context.font = '900 132px Arial, sans-serif';
  context.fillText(FENASOJA_EVENT_CENTER_LAYOUT.identity.wordmark, canvas.width / 2, 382);
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
}

export function EventCenterIdentityPanel({
  position,
  size,
}: {
  position: Vector3Tuple;
  size: readonly [number, number];
}) {
  const invalidate = useThree((state) => state.invalidate);
  const { canvas, texture, signMaterial } = useMemo(() => {
    let identityCanvas: HTMLCanvasElement | null = null;
    let canvasTexture: THREE.CanvasTexture | null = null;
    if (typeof document !== 'undefined') {
      identityCanvas = document.createElement('canvas');
      identityCanvas.width = 1024;
      identityCanvas.height = 512;
      const context = identityCanvas.getContext('2d');
      if (context) {
        paintEventCenterIdentity(context, identityCanvas);
        canvasTexture = new THREE.CanvasTexture(identityCanvas);
        canvasTexture.colorSpace = THREE.SRGBColorSpace;
        canvasTexture.anisotropy = 4;
        canvasTexture.minFilter = THREE.LinearMipmapLinearFilter;
        canvasTexture.magFilter = THREE.LinearFilter;
      }
    }
    return {
      canvas: identityCanvas,
      texture: canvasTexture,
      signMaterial: new THREE.MeshBasicMaterial({
        color: canvasTexture ? '#ffffff' : '#f8f8f3',
        map: canvasTexture,
        transparent: true,
        alphaTest: 0.06,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    };
  }, []);

  useEffect(() => {
    if (!canvas || !texture || typeof Image === 'undefined') return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const symbol = new Image();
    symbol.decoding = 'async';
    symbol.onload = () => {
      paintEventCenterIdentity(context, canvas, symbol);
      texture.needsUpdate = true;
      invalidate();
    };
    symbol.src = FENASOJA_EVENT_CENTER_LAYOUT.identity.symbolAsset;
    return () => {
      symbol.onload = null;
    };
  }, [canvas, invalidate, texture]);

  useEffect(
    () => () => {
      texture?.dispose();
      signMaterial.dispose();
    },
    [signMaterial, texture],
  );

  return (
    <mesh
      name="marca-oficial-centro-eventos-fenasoja"
      geometry={UNIT_PLANE}
      material={signMaterial}
      position={position}
      scale={[size[0], size[1], 1]}
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}
