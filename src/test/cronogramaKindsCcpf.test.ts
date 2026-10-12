import { describe, expect, it } from 'vitest';
import { sourceToVisualKind, visualToSourceKind } from '@/components/cronograma-eventos/modelAdapter';
import { classifyEvent } from '@/lib/cronograma-classification';
import { CRONOGRAMA_KIND_LABELS } from '@/lib/cronograma-classification/taxonomy';
import { getPersonPhoto } from '@/components/cronograma-eventos/personPhotos';
import { buildOrganizationalGraph } from '@/features/alvorada/organizational';
import { orgUnitMatches, type OrgUnit } from '@/lib/org-units';

describe('Entrevista e Podcast', () => {
  it('mantém os tipos anteriores e faz ida e volta', () => {
    expect(Object.keys(CRONOGRAMA_KIND_LABELS)).toEqual(
      expect.arrayContaining(['event', 'meeting', 'deadline', 'decision', 'milestone', 'interview', 'podcast']),
    );
    expect(sourceToVisualKind[visualToSourceKind.interview]).toBe('interview');
    expect(sourceToVisualKind[visualToSourceKind.podcast]).toBe('podcast');
    expect(visualToSourceKind.interview).toBe('entrevista');
  });

  it('respeita a intenção do título', () => {
    expect(classifyEvent({ title: 'Entrevista na Rádio Guaíba' }).kind.value).toBe('interview');
    expect(classifyEvent({ title: 'Podcast Fenasoja episódio 3' }).kind.value).toBe('podcast');
    expect(classifyEvent({ title: 'Reunião para organizar um podcast' }).kind.value).toBe('meeting');
  });
});

describe('CCPF e fotografias', () => {
  const ccpf: OrgUnit = {
    id: 'ccpf-id', name: 'CCPF — Conselho Consultivo Permanente Fenasoja', slug: 'ccpf', type: 'assessoria',
    displayOrder: 0, isOfficial: true, isLegacy: false,
    responsibles: [{ id: 'r-milton', displayName: 'Milton Racho', responsibleType: 'pessoa', relationshipRole: 'corresponsavel', isPrimary: false, userId: '2b76c299-e357-4597-bf22-acd307990cb7' }],
  };

  it('é encontrado pela sigla e pelo nome completo', () => {
    expect(orgUnitMatches(ccpf, 'ccpf')).toBe(true);
    expect(orgUnitMatches(ccpf, 'conselho consultivo')).toBe(true);
  });

  it('alimenta só o nó raiz do Ecossistema, sem nó inferior duplicado', () => {
    const graph = buildOrganizationalGraph({ members: [], units: [ccpf] });
    expect(graph.nodes.filter((node) => node.type === 'ccp')).toHaveLength(1);
    expect(graph.nodes.some((node) => node.id === 'unit:ccpf-id')).toBe(false);
    const root = graph.nodes.find((node) => node.type === 'ccp')!;
    expect(root.personIds).toContain('person:user:2b76c299-e357-4597-bf22-acd307990cb7');
    expect(graph.people['person:user:2b76c299-e357-4597-bf22-acd307990cb7'].avatarUrl).toMatch(/person-milton-racho\.webp$/);
  });

  it('associa as cinco fotos pelo ID confirmado e não por primeiro nome', () => {
    for (const id of [
      'd251d7d6-389f-42f3-afef-8b94db02a47b', 'eafd6b31-61d5-45a9-bba0-190fa06f30d6',
      'ad37de44-c925-4add-b96a-9fdcc76411ed', '2b76c299-e357-4597-bf22-acd307990cb7',
      '2e229647-0db7-451d-800c-395190471751',
    ]) expect(getPersonPhoto(null, id)).toMatch(/\.webp$/);
    expect(getPersonPhoto('Sara Souza')).toBeNull();
    expect(getPersonPhoto('Milton')).toBeNull();
  });
});
