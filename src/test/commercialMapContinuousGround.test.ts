import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { alignContinuousGroundUv, publishContinuousGround, readContinuousGround } from '../features/commercial-map/utils/continuousGroundMaterial';

describe('continuidade do material na borda traseira do parque', () => {
  it('reutiliza exatamente o material vivo sem transferir sua propriedade ou descarte', () => {
    const scene = new THREE.Scene(), otherScene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial();
    const disposed = vi.spyOn(material, 'dispose');
    const release = publishContinuousGround(scene, { material, center: [4, 7], size: 200 });
    expect(readContinuousGround(scene)?.material).toBe(material);
    expect(readContinuousGround(otherScene)).toBeNull();
    release();
    expect(readContinuousGround(scene)).toBeNull();
    expect(disposed).not.toHaveBeenCalled();
    material.dispose();
  });

  it('mantém a troca de qualidade/hidrologia quando o proprietário anterior desmonta', () => {
    const scene = new THREE.Scene();
    const day = new THREE.MeshStandardMaterial(), hydro = new THREE.MeshStandardMaterial();
    const oldRelease = publishContinuousGround(scene, { material: day, center: [0, 0], size: 200 });
    const newRelease = publishContinuousGround(scene, { material: hydro, center: [0, 0], size: 200 });
    oldRelease();
    expect(readContinuousGround(scene)?.material).toBe(hydro);
    newRelease();
    day.dispose(); hydro.dispose();
  });

  it.each([[0, 0, 200], [12.5, -4.5, 573]])('iguala UV e fase à PlaneGeometry transformada: %s/%s/%s', (x, z, size) => {
    const plane = new THREE.PlaneGeometry(size, size, 2, 2);
    const expected = plane.getAttribute('uv').clone();
    plane.rotateX(-Math.PI / 2); plane.translate(x, 0, z);
    plane.getAttribute('uv').array.fill(0);
    alignContinuousGroundUv(plane, { center: [x, z], size });
    const uv = plane.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(expected.getX(i), 6);
      expect(uv.getY(i)).toBeCloseTo(expected.getY(i), 6);
    }
    plane.dispose();
  });
});
