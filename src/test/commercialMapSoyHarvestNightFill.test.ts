import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { createSoyHarvestNightFill } from '@/features/commercial-map/harvest/soyHarvestNightFill';

describe('owned harvest night readability', () => {
  it('adds a bounded fill to machinery/grain only and restores exact daytime values', () => {
    const root = new Group(), geometry = new BoxGeometry();
    const green = new MeshStandardMaterial({ color: '#28752a' });
    const grain = new MeshStandardMaterial({ color: '#c8ab61' });
    const existingLamp = new MeshStandardMaterial({ color: '#fff0c0', emissive: '#b7a66c', emissiveIntensity: .18 });
    const outside = new MeshStandardMaterial({ color: '#778899' });
    const materials = [green, grain, existingLamp];
    for (const material of materials) root.add(new Mesh(geometry, material));
    const before = materials.map(material => ({ color: material.emissive.clone(), intensity: material.emissiveIntensity, version: material.version }));
    const fill = createSoyHarvestNightFill(root); fill.setActive(true);
    materials.forEach((material, index) => {
      const added = material.emissive.clone().sub(before[index].color.clone().multiplyScalar(before[index].intensity));
      expect(added.r).toBeGreaterThan(0); expect(added.r).toBeLessThanOrEqual(.120001);
      expect(added.g).toBeLessThanOrEqual(.140001); expect(added.b).toBeLessThanOrEqual(.160001);
      expect(material.version).toBe(before[index].version);
    });
    expect(outside.emissive.getHex()).toBe(0);
    fill.setActive(false);
    materials.forEach((material, index) => { expect(material.emissive.equals(before[index].color)).toBe(true); expect(material.emissiveIntensity).toBe(before[index].intensity); });
    fill.setActive(true); fill.dispose();
    materials.forEach((material, index) => expect(material.emissive.equals(before[index].color)).toBe(true));
    geometry.dispose(); [...materials, outside].forEach(material => material.dispose());
  });
  it('prepares a textured inscription once without recompiling on later night toggles', () => {
    const root = new Group(), geometry = new BoxGeometry(), texture = new Texture();
    const material = new MeshStandardMaterial({ map: texture }); root.add(new Mesh(geometry, material));
    const fill = createSoyHarvestNightFill(root), preparedVersion = material.version;
    expect(material.emissiveMap).toBe(texture);
    for (const night of [true, false, true, false]) { fill.setActive(night); expect(material.version).toBe(preparedVersion); }
    fill.dispose(); expect(material.emissiveMap).toBe(null);
    texture.dispose(); geometry.dispose(); material.dispose();
  });
});
