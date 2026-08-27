import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  OPEN_GROUND_TEXTURE_SAMPLING_POLICY,
  TEXTURED_OPEN_GROUND,
  getOpenGroundTexture,
  openGroundTextureForEntity,
  resolveOpenGroundProfile,
  resolveOpenGroundTextureSampling,
} from '../features/commercial-map/components/canvas/openGroundTextures';

function createCanvasContextStub(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() } as unknown as CanvasGradient;
  return {
    canvas,
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
      colorSpace: 'srgb',
    }) as ImageData,
    putImageData: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    lineWidth: 1,
    strokeStyle: '#000000',
    fillStyle: '#000000',
  } as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function getContext(
    this: HTMLCanvasElement,
    contextId: string,
  ) {
    return contextId === '2d' ? createCanvasContextStub(this) : null;
  } as typeof HTMLCanvasElement.prototype.getContext);
});

describe('texturas das áreas abertas do Mapa Comercial', () => {
  it('mantém perfis cromáticos estáveis e específicos para os dois IDs oficiais', () => {
    const motorhome = resolveOpenGroundProfile('AREA-MOTORHOME');
    const testDrive = resolveOpenGroundProfile('TEST-DRIVE');

    expect(motorhome).toEqual({
      surface: 'grass',
      tileWorldSize: 7.5,
      baseColor: '#8aa465',
      roughness: 0.97,
    });
    expect(testDrive).toEqual({
      surface: 'compactedGravel',
      tileWorldSize: 9,
      baseColor: '#b39a78',
      roughness: 0.94,
    });
    expect(resolveOpenGroundProfile('SEM-TEXTURA')).toBeNull();
    expect(Object.isFrozen(TEXTURED_OPEN_GROUND)).toBe(true);
    expect(Object.isFrozen(motorhome)).toBe(true);
    expect(Object.isFrozen(testDrive)).toBe(true);
    expect([motorhome, testDrive]).not.toContain(null);
    expect([motorhome!.baseColor, testDrive!.baseColor]).not.toContain('#ffffff');
    expect([motorhome!.baseColor, testDrive!.baseColor]).not.toContain('#fff');
  });

  it('expõe uma política power-of-two com mipmaps, trilinear, sRGB e repeat em unidades de mundo', () => {
    expect(OPEN_GROUND_TEXTURE_SAMPLING_POLICY).toMatchObject({
      textureSize: 256,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      colorSpace: THREE.SRGBColorSpace,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      maxAnisotropy: 16,
    });

    const motorhomeSampling = resolveOpenGroundTextureSampling(TEXTURED_OPEN_GROUND['AREA-MOTORHOME'], 8);
    const testDriveSampling = resolveOpenGroundTextureSampling(TEXTURED_OPEN_GROUND['TEST-DRIVE'], 8);
    expect(motorhomeSampling.repeat).toEqual([1 / 7.5, 1 / 7.5]);
    expect(testDriveSampling.repeat).toEqual([1 / 9, 1 / 9]);
  });

  it.each([1, 4, 8, 16])('limita a anisotropia à capacidade %i do renderer', (capability) => {
    const sampling = resolveOpenGroundTextureSampling(
      TEXTURED_OPEN_GROUND['AREA-MOTORHOME'],
      capability,
    );
    expect(sampling.anisotropy).toBe(capability);
  });

  it('reutiliza a fonte em cache e produz clones configurados sem mutá-la', () => {
    const profile = TEXTURED_OPEN_GROUND['AREA-MOTORHOME'];
    const testDriveProfile = TEXTURED_OPEN_GROUND['TEST-DRIVE'];
    const shared = getOpenGroundTexture(profile.surface);
    const cached = getOpenGroundTexture(profile.surface);
    const first = openGroundTextureForEntity(profile, 4);
    const second = openGroundTextureForEntity(profile, 8);
    const testDriveShared = getOpenGroundTexture(testDriveProfile.surface);
    const testDrive = openGroundTextureForEntity(testDriveProfile, 16);

    expect(shared).not.toBeNull();
    expect(cached).toBe(shared);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(shared);
    expect(second).not.toBe(shared);
    expect(second).not.toBe(first);
    expect(shared!.image).toBe(first!.image);
    expect((shared!.image as HTMLCanvasElement).width).toBe(256);
    expect((shared!.image as HTMLCanvasElement).height).toBe(256);
    expect(first!.repeat.toArray()).toEqual([1 / profile.tileWorldSize, 1 / profile.tileWorldSize]);
    expect(first).toMatchObject({
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      colorSpace: THREE.SRGBColorSpace,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      anisotropy: 4,
    });
    expect(second!.anisotropy).toBe(8);
    expect(testDriveShared).not.toBeNull();
    expect(testDrive).not.toBe(testDriveShared);
    expect(testDrive!.repeat.toArray()).toEqual([
      1 / testDriveProfile.tileWorldSize,
      1 / testDriveProfile.tileWorldSize,
    ]);
    expect(testDrive!.anisotropy).toBe(16);

    first!.repeat.set(3, 5);
    first!.anisotropy = 1;
    expect(shared!.repeat.toArray()).toEqual([1, 1]);
    expect(shared!.anisotropy).toBe(16);
    expect(second!.repeat.toArray()).toEqual([1 / profile.tileWorldSize, 1 / profile.tileWorldSize]);
    expect(second!.anisotropy).toBe(8);
  });
});
