import { officialPdfPointToLocal } from './officialReference2026';
import { rearRoadSourceToLocalLength } from './rearParkRoadNetwork';

/**
 * Portão 5 — saída de veículos de expositores e visitantes.
 *
 * Fica exatamente onde a Rua Brasília deixa o parque, na lateral do Centro de
 * Eventos Fenasoja (`C1 [4020,3180,4490,3435]`), imediatamente ao sul do
 * corredor da Avenida dos Imigrantes. Não é enfeite: o apron é o mesmo
 * pavimento da via, na mesma cota, e a continuação da Rua Brasília nasce dele.
 */

export const REAR_PARK_GATE_5 = Object.freeze({
  id: 'PORTAO-5',
  name: 'Portão 5',
  description: 'Saída de veículos de expositores e visitantes, na lateral do Centro de Eventos Fenasoja.',
  /** Eixo da via no portão, em pontos do PDF oficial. */
  sourceCenter: [3964, 4248] as const,
  /** Apron pavimentado de transição interno → externo. */
  sourceApron: [3876, 4212, 4052, 4322] as const,
  /** Vão livre para passagem de veículos, em pontos do PDF. */
  sourceOpening: 92,
  roadElevation: 0.024,
  connections: ['RUA-BRASILIA', 'RUA-BRASILIA-CONTINUACAO'] as const,
});

export interface Gate5Geometry {
  center: readonly [number, number];
  apron: { centerX: number; centerZ: number; width: number; depth: number };
  openingWidth: number;
  /** Guaritas laterais (posição local e dimensões). */
  booths: Array<{ x: number; z: number; width: number; depth: number; height: number }>;
  /** Cancelas simples, uma de cada lado do vão. */
  barriers: Array<{ x: number; z: number; length: number }>;
  signPost: { x: number; z: number; height: number };
}

export function buildGate5Geometry(): Gate5Geometry {
  const center = officialPdfPointToLocal(REAR_PARK_GATE_5.sourceCenter);
  const [ax0, az0] = officialPdfPointToLocal([
    REAR_PARK_GATE_5.sourceApron[0],
    REAR_PARK_GATE_5.sourceApron[1],
  ]);
  const [ax1, az1] = officialPdfPointToLocal([
    REAR_PARK_GATE_5.sourceApron[2],
    REAR_PARK_GATE_5.sourceApron[3],
  ]);

  const width = Math.abs(ax1 - ax0);
  const depth = Math.abs(az1 - az0);
  const openingWidth = rearRoadSourceToLocalLength(REAR_PARK_GATE_5.sourceOpening);
  const halfOpening = openingWidth / 2;
  const boothWidth = Math.max(0.34, (width - openingWidth) / 2 - 0.06);

  return {
    center,
    apron: {
      centerX: (ax0 + ax1) / 2,
      centerZ: (az0 + az1) / 2,
      width,
      depth,
    },
    openingWidth,
    booths: [
      {
        x: center[0] - halfOpening - boothWidth / 2,
        z: center[1],
        width: boothWidth,
        depth: 0.5,
        height: 0.5,
      },
      {
        x: center[0] + halfOpening + boothWidth / 2,
        z: center[1],
        width: boothWidth,
        depth: 0.5,
        height: 0.5,
      },
    ],
    barriers: [
      { x: center[0] - halfOpening * 0.52, z: center[1], length: halfOpening * 0.9 },
      { x: center[0] + halfOpening * 0.52, z: center[1], length: halfOpening * 0.9 },
    ],
    signPost: {
      x: center[0] + halfOpening + boothWidth + 0.18,
      z: center[1] - 0.42,
      height: 0.62,
    },
  };
}
