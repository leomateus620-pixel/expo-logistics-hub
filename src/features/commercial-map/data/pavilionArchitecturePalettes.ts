import type { PhotographedPavilionId } from './pavilionArchitecture2026';

export type PavilionArchitectureMaterialKey = 'wall' | 'accent' | 'roof' | 'trim' | 'dark' | 'glass' | 'green' | 'white' | 'platform' | 'metal' | 'brick' | 'cladding';
export type PavilionArchitecturePalette = Readonly<Record<PavilionArchitectureMaterialKey, string>>;

/** Albedo estimates under neutral light, not measured paint specifications. */
export const PAVILION_ARCHITECTURE_PALETTES: Readonly<Record<PhotographedPavilionId, PavilionArchitecturePalette>> = {
  B1: { wall: '#d9d9d3', accent: '#484b4d', roof: '#989d9c', trim: '#45494c', dark: '#626566', glass: '#424e4e', green: '#304d3a', white: '#e2e1db', platform: '#99978f', metal: '#62686b', brick: '#a65e4e', cladding: '#c6cac7' },
  B3: { wall: '#deddd3', accent: '#9b8352', roof: '#9ea5a3', trim: '#344e43', dark: '#686c6b', glass: '#3e4e4c', green: '#344e43', white: '#c8cbc4', platform: '#99968c', metal: '#868d88', brick: '#a9604c', cladding: '#b6b9b2' },
  B4: { wall: '#ddded7', accent: '#4d5150', roof: '#a9aeab', trim: '#494e4e', dark: '#5b6061', glass: '#536362', green: '#354f42', white: '#c4c8c3', platform: '#96948a', metal: '#737b78', brick: '#ac6750', cladding: '#c9c3af' },
  B5: { wall: '#deded8', accent: '#555958', roof: '#a3aaa8', trim: '#4e5353', dark: '#696968', glass: '#4f5a59', green: '#354f42', white: '#d6d8d1', platform: '#93938b', metal: '#818784', brick: '#ac6750', cladding: '#aeb2ac' },
  B6: { wall: '#dbdcd4', accent: '#585d5e', roof: '#969e9c', trim: '#4d5253', dark: '#696c6b', glass: '#3d4b4b', green: '#354f42', white: '#dfdfd6', platform: '#8f908b', metal: '#8f9795', brick: '#ac6750', cladding: '#a4aaa8' },
};

export function resolvePavilionArchitecturePalette(id?: string): PavilionArchitecturePalette | null {
  return id && Object.prototype.hasOwnProperty.call(PAVILION_ARCHITECTURE_PALETTES, id)
    ? PAVILION_ARCHITECTURE_PALETTES[id as PhotographedPavilionId]
    : null;
}
