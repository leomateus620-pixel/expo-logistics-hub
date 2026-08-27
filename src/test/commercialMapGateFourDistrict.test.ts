import { describe, expect, it } from 'vitest';
import {
  GATE_FOUR_DISTRICT_CONFIDENCE,
  GATE_FOUR_DISTRICT_LAYOUT,
  GATE_FOUR_DISTRICT_PROVENANCE,
  GATE_FOUR_DISTRICT_REFERENCE,
  GATE_FOUR_DISTRICT_RENDER_BUDGET,
  GATE_FOUR_DISTRICT_REQUIRED_IDENTIFIERS,
  resolveGateFourInteractionFootprint,
  shouldRenderGateFourDistrict,
  withGateFourDistrictPresentationEntities,
} from '@/features/commercial-map/data/gateFourDistrict';
import {
  OFFICIAL_REFERENCE_DATA,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import type { MapEntity } from '@/features/commercial-map/types';

const entity = (publicIdentifier: string) => {
  const match = OFFICIAL_REFERENCE_DATA.entities.find((candidate) => (
    candidate.publicIdentifier === publicIdentifier
  ));
  if (!match) throw new Error(`Entidade oficial ausente: ${publicIdentifier}`);
  return match;
};

const districtOwners = () => GATE_FOUR_DISTRICT_REQUIRED_IDENTIFIERS.map(entity);

const xBounds = (polygon: readonly (readonly [number, number])[]) => {
  const xs = polygon.map(([x]) => x);
  return { minX: Math.min(...xs), maxX: Math.max(...xs) };
};

describe('plano de apresentação do distrito do Portão 4', () => {
  it('versiona a interpretação e separa planta oficial, fotografias, satélite e incertezas', () => {
    expect(GATE_FOUR_DISTRICT_REFERENCE).toMatchObject({
      revision: '2026.8-gate-four.1',
      scope: 'PRESENTATION_ONLY',
      interpretation: 'official-plan-photography-and-satellite',
      semanticPolicy: {
        preservesEntityIdsAndUuids: true,
        preservesClassification: true,
        preservesMetadata: true,
        persistsGeometry: false,
        mutatesCommercialMembership: false,
      },
    });
    expect(GATE_FOUR_DISTRICT_PROVENANCE.sources.map((source) => source.fileName)).toEqual([
      'IMG_9791.jpeg',
      'IMG_9792.jpeg',
      'IMG_9793.png',
      'IMG_9794.jpeg',
      'IMG_9723.jpeg',
      'IMG_9722.jpeg',
      'IMG_9795.jpeg',
    ]);
    expect(GATE_FOUR_DISTRICT_PROVENANCE.sources.filter((source) => (
      source.role === 'architecture-photo'
    ))).toHaveLength(2);
    expect(GATE_FOUR_DISTRICT_PROVENANCE.sources.filter((source) => (
      source.role === 'satellite'
    ))).toHaveLength(1);
    expect(GATE_FOUR_DISTRICT_CONFIDENCE.crioulosArchitecture).toBe('PHOTOGRAPHIC_REFERENCE');
    expect(GATE_FOUR_DISTRICT_CONFIDENCE.exactBuildingFootprints).toBe('NOT_SURVEYED');
    expect(GATE_FOUR_DISTRICT_CONFIDENCE.altimetry).toBe('NOT_SURVEYED');
    expect(GATE_FOUR_DISTRICT_CONFIDENCE.arenaFenceAccessAndVegetation).toBe('FIELD_REVIEW_REQUIRED');
  });

  it('só ativa o conjunto quando todos os cinco owners oficiais estão presentes', () => {
    expect(districtOwners().map((item) => item.publicIdentifier)).toEqual(
      GATE_FOUR_DISTRICT_REQUIRED_IDENTIFIERS,
    );
    expect(shouldRenderGateFourDistrict(districtOwners())).toBe(true);

    GATE_FOUR_DISTRICT_REQUIRED_IDENTIFIERS.forEach((missingIdentifier) => {
      const incomplete = districtOwners().filter((item) => (
        item.publicIdentifier !== missingIdentifier
      ));
      expect(shouldRenderGateFourDistrict(incomplete), `owner ausente: ${missingIdentifier}`).toBe(false);
    });

    expect(shouldRenderGateFourDistrict(districtOwners().map((item) => ({
      publicIdentifier: ` ${item.publicIdentifier.toLocaleLowerCase('pt-BR')} `,
    })))).toBe(true);
  });

  it('mantém D5 a oeste, Pavilhão 9 a leste e a via contínua entre os dois', () => {
    const roadBounds = xBounds(GATE_FOUR_DISTRICT_LAYOUT.connectorRoad.polygon);
    const crioulosBounds = xBounds(GATE_FOUR_DISTRICT_LAYOUT.crioulos.footprint);
    const pavilionWestEdge = officialPdfPointToLocal([
      GATE_FOUR_DISTRICT_LAYOUT.pavilion9.sourcePdfBounds[0],
      GATE_FOUR_DISTRICT_LAYOUT.pavilion9.sourcePdfBounds[1],
    ])[0];

    expect(crioulosBounds.maxX).toBeLessThan(roadBounds.minX);
    expect(GATE_FOUR_DISTRICT_LAYOUT.crioulos.center[0]).toBeLessThan(roadBounds.minX);
    expect(pavilionWestEdge).toBeGreaterThan(roadBounds.maxX);
    expect(GATE_FOUR_DISTRICT_LAYOUT.pavilion9.center[0]).toBeGreaterThan(roadBounds.maxX);
    expect(GATE_FOUR_DISTRICT_LAYOUT.crioulos.access.centerline[0][0]).toBeCloseTo(
      roadBounds.minX,
      8,
    );
  });

  it('alinha o Portão 4 ao eixo viário sem deslocar a âncora oficial', () => {
    const gate = GATE_FOUR_DISTRICT_LAYOUT.gate4;
    const road = GATE_FOUR_DISTRICT_LAYOUT.connectorRoad;
    const expectedAnchor = officialPdfPointToLocal(gate.sourcePdfAnchor);
    const expectedAxisCenter = officialPdfPointToLocal(gate.sourcePdfRoadAxisCenter);

    expect(gate.anchor).toEqual(expectedAnchor);
    expect(gate.center).toEqual(expectedAxisCenter);
    expect(gate.roadAxisCenter).toEqual(road.axisFrom);
    expect(gate.center[0]).toBeCloseTo((road.polygon[0][0] + road.polygon[1][0]) / 2, 10);
    expect(gate.anchor[0] + gate.visualOffset[0]).toBeCloseTo(gate.center[0], 10);
    expect(gate.anchor[1] + gate.visualOffset[1]).toBeCloseTo(gate.center[1], 10);
    expect(gate.sourcePdfVisualOffset).toEqual([-32, 0]);
    expect(gate.approachHeadingRadians).toBe(Math.PI / 2);
  });

  it('define a continuidade norte-sul de A4 até o limite sul sem alterar a fonte canônica', () => {
    const road = GATE_FOUR_DISTRICT_LAYOUT.connectorRoad;
    expect(road.sourcePdfBounds).toEqual([1600, 1744, 1648, 3145]);
    expect(road.originalOfficialSourcePdfBounds).toEqual([1600, 2410, 1648, 3145]);
    expect(road.sourcePdfPolygon).toEqual([
      [1600, 1744],
      [1648, 1744],
      [1648, 3145],
      [1600, 3145],
      [1600, 1744],
    ]);
    expect(road.polygon[0]).toEqual(officialPdfPointToLocal([1600, 1744]));
    expect(road.polygon[2]).toEqual(officialPdfPointToLocal([1648, 3145]));
    expect(road.polygon.at(-1)).toEqual(road.polygon[0]);
    expect(road.axisFrom[1]).toBe(GATE_FOUR_DISTRICT_LAYOUT.gate4.center[1]);
    expect(road.axisTo[1]).toBe(officialPdfPointToLocal([1624, 3145])[1]);
    expect(road.length).toBeGreaterThan(road.width * 25);
    expect(road.presentationOnly).toBe(true);
  });

  it('compartilha um envelope local que cobre portal e guarita sem ampliar a âncora oficial', () => {
    const gate = GATE_FOUR_DISTRICT_LAYOUT.gate4;
    const bounds = Object.freeze({ width: 0.96, depth: 0.96 });
    const footprint = resolveGateFourInteractionFootprint(bounds);
    const minX = Math.min(...footprint.map(([x]) => x));
    const maxX = Math.max(...footprint.map(([x]) => x));
    const maxZ = Math.max(...footprint.map(([, z]) => z));
    const pierWidth = Math.max(0.18, gate.width * 0.13);
    const guardWidth = Math.max(gate.width * 0.25, 0.48);
    const guardX = gate.width * 0.31 + pierWidth + guardWidth * 0.52;

    expect(footprint).toHaveLength(5);
    expect(footprint.at(-1)).toEqual(footprint[0]);
    expect(minX).toBeLessThan(-gate.width / 2);
    expect(maxX).toBeGreaterThan(guardX + guardWidth * 0.61);
    expect(maxZ).toBeGreaterThan(gate.depth * 0.42 + pierWidth / 2);
    expect(maxZ * 2).toBeLessThan(1.3);
    expect(gate.anchor).toEqual(officialPdfPointToLocal([1656, 1744]));
    expect(bounds).toEqual({ width: 0.96, depth: 0.96 });
  });

  it('não aplica a continuidade quando um owner está ausente', () => {
    const incomplete = OFFICIAL_REFERENCE_DATA.entities.filter((candidate) => (
      candidate.publicIdentifier !== 'D5'
    ));
    const originalRoad = incomplete.find((candidate) => (
      candidate.publicIdentifier === 'RUA-BUENOS-AIRES'
    ));
    const presented = withGateFourDistrictPresentationEntities(incomplete);
    const presentedRoad = presented.find((candidate) => (
      candidate.publicIdentifier === 'RUA-BUENOS-AIRES'
    ));

    expect(shouldRenderGateFourDistrict(incomplete)).toBe(false);
    expect(presentedRoad).toBe(originalRoad);
    expect(presentedRoad?.geometry.coordinates).toBe(originalRoad?.geometry.coordinates);
  });

  it('clona apenas a Rua Buenos Aires e não muta a coleção de entrada', () => {
    const input = OFFICIAL_REFERENCE_DATA.entities;
    const inputSnapshot = JSON.parse(JSON.stringify(input)) as MapEntity[];
    const originalRoad = entity('RUA-BUENOS-AIRES');
    const originalD5 = entity('D5');
    const presented = withGateFourDistrictPresentationEntities(input);
    const presentedRoad = presented.find((candidate) => (
      candidate.publicIdentifier === 'RUA-BUENOS-AIRES'
    ));
    const presentedD5 = presented.find((candidate) => candidate.publicIdentifier === 'D5');

    expect(input).toEqual(inputSnapshot);
    expect(presented).not.toBe(input);
    expect(presentedRoad).not.toBe(originalRoad);
    expect(presentedRoad?.geometry).not.toBe(originalRoad.geometry);
    expect(presentedRoad?.geometry.coordinates).toEqual([
      GATE_FOUR_DISTRICT_LAYOUT.connectorRoad.polygon,
    ]);
    expect(presentedD5).toBe(originalD5);
    input.forEach((sourceEntity) => {
      const outputEntity = presented.find((candidate) => candidate.id === sourceEntity.id);
      if (sourceEntity.publicIdentifier !== 'RUA-BUENOS-AIRES') {
        expect(outputEntity, sourceEntity.publicIdentifier).toBe(sourceEntity);
      }
    });
  });

  it('preserva UUID, ownership, classificação, metadados e demais propriedades geométricas', () => {
    const roadUuid = '25668714-31a6-4a63-bc5c-85803076b65d';
    const metadata = { ...entity('RUA-BUENOS-AIRES').metadata, databaseOwner: 'preserve-me' };
    const road: MapEntity = {
      ...entity('RUA-BUENOS-AIRES'),
      id: roadUuid,
      projectId: 'project-db-owner',
      layerId: 'layer-db-owner',
      parentEntityId: 'parent-db-owner',
      metadata,
    };
    const owners = districtOwners().map((candidate) => (
      candidate.publicIdentifier === road.publicIdentifier ? road : candidate
    ));
    const presentedRoad = withGateFourDistrictPresentationEntities(owners).find((candidate) => (
      candidate.publicIdentifier === 'RUA-BUENOS-AIRES'
    ));

    expect(presentedRoad).toMatchObject({
      id: roadUuid,
      projectId: 'project-db-owner',
      layerId: 'layer-db-owner',
      parentEntityId: 'parent-db-owner',
      publicIdentifier: 'RUA-BUENOS-AIRES',
      classification: road.classification,
      verificationStatus: road.verificationStatus,
      isSellable: road.isSellable,
      isArchived: road.isArchived,
    });
    expect(presentedRoad?.metadata).toBe(metadata);
    expect(presentedRoad?.geometry).toMatchObject({
      id: road.geometry.id,
      type: road.geometry.type,
      elevation: road.geometry.elevation,
      extrusionHeight: road.geometry.extrusionHeight,
      rotation: road.geometry.rotation,
      geometryVersion: road.geometry.geometryVersion,
      calibrationVersion: road.geometry.calibrationVersion,
    });
    expect(road.metadata.sourcePdfPolygon).toEqual([
      [1600, 2410],
      [1648, 2410],
      [1648, 3145],
      [1600, 3145],
    ]);
  });

  it('mantém Q-V-06 apenas como adjacência e não altera membership automotivo', () => {
    const lot = entity('Q-V-06');
    const presented = withGateFourDistrictPresentationEntities(OFFICIAL_REFERENCE_DATA.entities);
    const presentedLot = presented.find((candidate) => candidate.publicIdentifier === 'Q-V-06');
    const adjacency = GATE_FOUR_DISTRICT_LAYOUT.automotiveAdjacency;

    expect(GATE_FOUR_DISTRICT_REQUIRED_IDENTIFIERS).not.toContain('Q-V-06');
    expect(adjacency).toEqual({
      officialEntityIdentifier: 'Q-V-06',
      relation: 'ADJACENT_TO_CONNECTOR_DESTINATION',
      presentationRole: 'WAYFINDING_ENDPOINT_ONLY',
      membershipPolicy: 'PRESERVE_EXISTING_AUTOMOTIVE_MEMBERSHIP',
      mutatesMembership: false,
    });
    expect(lot.classification).toBe('SELLABLE_LOT');
    expect(presentedLot).toBe(lot);
    expect(presentedLot?.metadata).toBe(lot.metadata);
  });

  it('expõe a arquitetura observada do D5 e dados de arena, cerca e acesso com custo limitado', () => {
    const crioulos = GATE_FOUR_DISTRICT_LAYOUT.crioulos;
    expect(crioulos.roof.kind).toBe('TERRACOTTA_HIP');
    expect(crioulos.roof.pitchDegrees).toBeGreaterThan(20);
    expect(crioulos.veranda.kind).toBe('WRAPAROUND_SOUTH_AND_WEST');
    expect(crioulos.veranda.frontBayCount).toBeGreaterThanOrEqual(5);
    expect(crioulos.chimney.heightAboveRoof).toBeCloseTo(0.3);
    expect(crioulos.flagpoles).toHaveLength(4);
    expect(new Set(crioulos.flagpoles.map((flagpole) => flagpole.id)).size).toBe(4);
    expect(crioulos.flagpoles.every((flagpole) => (
      flagpole.flagIdentity === 'NOT_DOCUMENTED'
    ))).toBe(true);
    expect(crioulos.arena.radiusX).toBeGreaterThan(crioulos.arena.radiusZ);
    expect(crioulos.arena.fence.railCount).toBe(2);
    expect(crioulos.fence.sourcePdfSegments).toHaveLength(4);
    expect(crioulos.access.roadEntityIdentifier).toBe('RUA-BUENOS-AIRES');
    expect(crioulos.access.sourcePdfCenterline[0]).toEqual([1600, 2278]);

    expect(GATE_FOUR_DISTRICT_RENDER_BUDGET.district.animatedDrawCalls).toBe(0);
    expect(GATE_FOUR_DISTRICT_RENDER_BUDGET.district.textureMaxResolution).toBeLessThanOrEqual(512);
    expect(GATE_FOUR_DISTRICT_RENDER_BUDGET.landscape.treeInstances).toBe(
      GATE_FOUR_DISTRICT_LAYOUT.landscape.trees.length,
    );
    expect(GATE_FOUR_DISTRICT_RENDER_BUDGET.landscape.animatedDrawCalls).toBe(0);
  });
});
