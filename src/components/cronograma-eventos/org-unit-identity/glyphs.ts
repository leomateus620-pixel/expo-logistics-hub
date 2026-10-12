import { createLucideIcon } from 'lucide-react';

/**
 * Glifos próprios da família de identidade das unidades. Seguem a mesma grade
 * 24×24, traço arredondado e nível de detalhe dos ícones Lucide, porque a
 * biblioteca não traz um equivalente adequado para estas funções.
 */

export const SystemsGlyph = createLucideIcon('OrgUnitSystems', [
  ['rect', { width: '20', height: '14', x: '2', y: '3', rx: '2.5', key: 'screen' }],
  ['path', { d: 'M8.5 21h7', key: 'base' }],
  ['path', { d: 'M12 17v4', key: 'stand' }],
  ['path', { d: 'm9.75 7.75-2.5 2.25 2.5 2.25', key: 'open' }],
  ['path', { d: 'm14.25 7.75 2.5 2.25-2.5 2.25', key: 'close' }],
]);

export const ProjectsGlyph = createLucideIcon('OrgUnitProjects', [
  ['path', { d: 'M14.5 2H6.5A2.5 2.5 0 0 0 4 4.5v15A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5V7.5Z', key: 'sheet' }],
  ['path', { d: 'M14 2v4.5A1.5 1.5 0 0 0 15.5 8H20', key: 'fold' }],
  ['path', { d: 'm8 17.5 3-3.25 2.25 2L17 12.5', key: 'trend' }],
  ['path', { d: 'M14.25 12.5H17v2.75', key: 'arrow' }],
]);

export const InternationalGlyph = createLucideIcon('OrgUnitInternational', [
  ['circle', { cx: '12', cy: '12', r: '9.5', key: 'globe' }],
  ['path', { d: 'M12 2.5a14 14 0 0 1 0 19 14 14 0 0 1 0-19', key: 'meridian' }],
  ['path', { d: 'M6.75 15.25c3.1 2.1 7.4 2.1 10.5 0', key: 'link' }],
  ['circle', { cx: '6.75', cy: '15.25', r: '1.25', fill: 'currentColor', key: 'nodeA' }],
  ['circle', { cx: '17.25', cy: '15.25', r: '1.25', fill: 'currentColor', key: 'nodeB' }],
]);

export const LivestockGlyph = createLucideIcon('OrgUnitLivestock', [
  ['path', { d: 'M7 8.5c-2.4 0-3.9-1.6-4-4 1.1 1 2.4 1.5 4 1.5', key: 'hornL' }],
  ['path', { d: 'M17 8.5c2.4 0 3.9-1.6 4-4-1.1 1-2.4 1.5-4 1.5', key: 'hornR' }],
  ['path', { d: 'M7 6.5c1.4-.6 3-.9 5-.9s3.6.3 5 .9l-.9 8.6c-.2 2.2-1.8 3.9-4.1 3.9s-3.9-1.7-4.1-3.9Z', key: 'face' }],
  ['path', { d: 'M9.75 11h.01', key: 'eyeL' }],
  ['path', { d: 'M14.25 11h.01', key: 'eyeR' }],
  ['path', { d: 'M9.5 15.5h5', key: 'muzzle' }],
]);
