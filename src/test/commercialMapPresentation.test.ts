import { describe, expect, it } from 'vitest';
import {
  labelBelongsToActiveMode,
  requiresSolidRendering,
  resolveGateAccessMode,
  resolveMapLabelCollisionBox,
  resolveMapLabelCollisionCenterY,
  resolveMarkerPresentationLift,
  resolveMapLabelMode,
  resolveStableMapLabelVisibility,
} from '@/features/commercial-map/utils/mapPresentation';

describe('modelo de apresentação do mapa comercial', () => {
  it('mantém a navegação com múltiplos rótulos e torna o foco exclusivo', () => {
    const navigation = resolveMapLabelMode(null);
    expect(navigation).toEqual({ kind: 'navigation' });
    expect(labelBelongsToActiveMode(navigation, 'entity:a')).toBe(true);
    expect(labelBelongsToActiveMode(navigation, 'entity:b')).toBe(true);

    const focus = resolveMapLabelMode('entity:selected');
    expect(focus).toEqual({ kind: 'focus', selectedEntityId: 'entity:selected' });
    expect(labelBelongsToActiveMode(focus, 'entity:selected')).toBe(true);
    expect(labelBelongsToActiveMode(focus, 'entity:neighbour')).toBe(false);
  });

  it('mantém histerese entre níveis de rótulo durante pequenos movimentos de zoom', () => {
    expect(resolveStableMapLabelVisibility(29, 100, 'medium')).toBe('medium');
    expect(resolveStableMapLabelVisibility(29, 100, 'near')).toBe('near');
    expect(resolveStableMapLabelVisibility(35, 100, 'near')).toBe('medium');
    expect(resolveStableMapLabelVisibility(80, 100, 'far')).toBe('far');
    expect(resolveStableMapLabelVisibility(80, 100, 'medium')).toBe('medium');
    expect(resolveStableMapLabelVisibility(90, 100, 'medium')).toBe('far');
  });

  it('mantém os limites exatos e normaliza entradas inválidas da histerese', () => {
    expect(resolveStableMapLabelVisibility(27, 100, 'medium')).toBe('near');
    expect(resolveStableMapLabelVisibility(34, 100, 'near')).toBe('near');
    expect(resolveStableMapLabelVisibility(76, 100, 'far')).toBe('far');
    expect(resolveStableMapLabelVisibility(88, 100, 'medium')).toBe('far');
    expect(resolveStableMapLabelVisibility(Number.NaN, 0, 'medium')).toBe('far');
    expect(resolveStableMapLabelVisibility(-1, 100, 'medium')).toBe('near');
  });

  it('reserva a caixa real do lote expandido e ancora colisões pelo rodapé', () => {
    const compact = resolveMapLabelCollisionBox('lot', 3);
    const expanded = resolveMapLabelCollisionBox('lot', 3, true);
    expect(compact).toEqual({ width: 34, height: 26, anchorGap: 5 });
    expect(expanded).toEqual({ width: 112, height: 60, anchorGap: 5 });
    expect(resolveMapLabelCollisionCenterY(200, expanded)).toBe(165);
    expect(resolveMapLabelCollisionBox('road', 100).width).toBe(148);
    expect(resolveMapLabelCollisionBox('structure', Number.NaN).width).toBe(84);
  });

  it('deriva a iconografia de entrada e saída a partir da descrição oficial', () => {
    expect(resolveGateAccessMode('Portão 1 — entrada de veículos')).toBe('entry');
    expect(resolveGateAccessMode('Portão 5 — saída de visitantes')).toBe('exit');
    expect(resolveGateAccessMode('Portão 10 — entrada e saída de visitantes')).toBe('bidirectional');
    expect(resolveGateAccessMode('Acesso de serviço')).toBe('access');
  });

  it('reserva blending apenas para superfícies que podem ser atenuadas com segurança', () => {
    expect(requiresSolidRendering('PAVILION')).toBe(true);
    expect(requiresSolidRendering('GATE')).toBe(true);
    expect(requiresSolidRendering('RESTROOM')).toBe(true);
    expect(requiresSolidRendering('SELLABLE_LOT')).toBe(false);
    expect(requiresSolidRendering('ROAD')).toBe(false);
  });

  it('eleva somente marcadores sanitários acima de estruturas sem deslocar sua coordenada', () => {
    expect(resolveMarkerPresentationLift('RESTROOM')).toBeGreaterThan(1);
    expect(resolveMarkerPresentationLift('CHEMICAL_RESTROOM')).toBeGreaterThan(1);
    expect(resolveMarkerPresentationLift('PAVILION')).toBe(0);
    expect(resolveMarkerPresentationLift('GATE')).toBe(0);
  });
});
