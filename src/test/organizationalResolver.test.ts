import { describe, expect, it } from 'vitest';
import {
  buildOrganizationalGraph,
  resolveExecutiveRole,
  type OrganizationalMemberRecord,
  type OrganizationalRawData,
  type OrganizationalUnitRecord,
} from '@/features/alvorada/organizational';

function member(
  partial: Partial<OrganizationalMemberRecord> & Pick<OrganizationalMemberRecord, 'nome_exibicao'>,
): OrganizationalMemberRecord {
  return {
    id: `member-${partial.user_id ?? partial.nome_exibicao}`,
    user_id: null,
    cargo: null,
    role: 'operador',
    commission_id: null,
    commission_nome: null,
    is_active: true,
    ...partial,
  };
}

function unit(
  partial: Partial<OrganizationalUnitRecord> & Pick<OrganizationalUnitRecord, 'id' | 'name'>,
): OrganizationalUnitRecord {
  return {
    slug: partial.name.toLocaleLowerCase('pt-BR').replace(/\s+/g, '-'),
    type: 'comissao',
    displayOrder: 1,
    isOfficial: true,
    isLegacy: false,
    responsibles: [],
    ...partial,
  };
}

const central = unit({
  id: 'central-id',
  name: 'CENTRAL',
  slug: 'comissao-central',
  isOfficial: false,
  isLegacy: true,
  displayOrder: 999,
});

describe('organizationalResolver', () => {
  it('resolve autoridade 1-4 a partir de aliases existentes, cargos e membership reais', () => {
    const graph = buildOrganizationalGraph({
      members: [
        member({
          nome_exibicao: 'Marcos Eduardo Servat',
          user_id: 'marcos-user',
          cargo: 'PRESIDENTE CCPF - gestão 2026/2028',
          commission_id: central.id,
          commission_nome: 'CENTRAL',
        }),
        member({
          nome_exibicao: 'Fabiano Soltis',
          user_id: 'fabiano-user',
          cargo: 'PRESIDENTE',
          commission_id: central.id,
          commission_nome: 'CENTRAL',
        }),
        member({
          nome_exibicao: 'Djeison Fernando Drey',
          user_id: 'djeison-user',
          cargo: 'VICE-PRESIDENTE',
          commission_id: central.id,
          commission_nome: 'CENTRAL',
        }),
        member({
          nome_exibicao: 'Roque Vanderlei Lugoch',
          user_id: 'roque-user',
          cargo: 'COORDENADOR FINANCEIRO',
          commission_id: central.id,
          commission_nome: 'CENTRAL',
        }),
      ],
      units: [
        central,
        unit({
          id: 'logistica-id',
          name: 'Logística, Hotelaria e Turismo',
          responsibles: [
            {
              id: 'eduardo-responsible',
              displayName: 'Eduardo Santos',
              responsibleType: 'pessoa',
              relationshipRole: 'principal',
              isPrimary: true,
              userId: 'eduardo-user',
            },
          ],
        }),
      ],
    });

    const ccp = graph.nodes.find((node) => node.type === 'ccp');
    const executives = graph.nodes.filter((node) => node.type === 'executive');
    const centralNode = graph.nodes.find((node) => node.type === 'central-commission');
    const commission = graph.nodes.find((node) => node.id === 'unit:logistica-id');

    expect(ccp).toMatchObject({
      id: 'org:ccp',
      title: 'CCPF',
      subtitle: 'CCPF — CONSELHO CONSULTIVO PERMANENTE FENASOJA',
      metadata: { presentationCode: 'CCPF' },
    });
    expect(ccp?.personIds).toHaveLength(1);
    expect(graph.people[ccp!.personIds[0]].fullName).toBe('MARCOS EDUARDO SERVAT');
    expect(graph.people[ccp!.personIds[0]].highestAuthorityLevel).toBe(1);
    expect(executives.map((node) => node.subtitle)).toEqual(['PRESIDENTE', 'VICE-PRESIDENTE']);
    expect(executives.every((node) => graph.people[node.personIds[0]].highestAuthorityLevel === 2)).toBe(true);
    expect(centralNode?.personIds).toHaveLength(1);
    expect(graph.people[centralNode!.personIds[0]].fullName).toBe('ROQUE VANDERLEI LUGOCH');
    expect(graph.people[centralNode!.personIds[0]].highestAuthorityLevel).toBe(3);
    expect(commission?.authorityLevel).toBe(4);
    expect(graph.people[commission!.personIds[0]].highestAuthorityLevel).toBe(4);
    expect(centralNode?.personIds).not.toContain(ccp?.personIds[0]);
    expect(centralNode?.personIds).not.toContain(executives[0].personIds[0]);
    expect(centralNode?.personIds).not.toContain(executives[1].personIds[0]);
    const presentationValues = [
      ...graph.nodes.flatMap((node) => [
        node.title,
        node.subtitle,
        ...node.responsibilities.flatMap((responsibility) => [
          responsibility.displayName,
          responsibility.relationshipRole,
        ]),
      ]),
      ...Object.values(graph.people).flatMap((person) => [person.fullName, ...person.roles]),
    ].filter((value): value is string => Boolean(value));
    expect(presentationValues.every((value) => (
      value === value.toLocaleUpperCase('pt-BR')
    ))).toBe(true);
  });

  it('não inventa os aliases CCP ausentes no registro de membros', () => {
    const graph = buildOrganizationalGraph({ members: [], units: [] });
    const ccp = graph.nodes.find((node) => node.type === 'ccp');

    expect(ccp?.personIds).toEqual([]);
    expect(Object.keys(graph.people)).toEqual([]);
    expect(graph.anomalies.filter((item) => item.code === 'missing-ccp-member')).toHaveLength(3);
  });

  it('resolve a Comissão Central pelo membership quando a unidade não veio na consulta', () => {
    const graph = buildOrganizationalGraph({
      members: [
        member({
          nome_exibicao: 'Integrante Central Real',
          user_id: 'central-member-user',
          cargo: 'DIRETORIA',
          commission_nome: 'Comissão Central',
        }),
      ],
      units: [],
    });
    const centralNode = graph.nodes.find((node) => node.type === 'central-commission');

    expect(centralNode?.commissionId).toBeNull();
    expect(centralNode?.personIds).toHaveLength(1);
    expect(centralNode?.metadata.resolvedFromMembership).toBe(true);
    expect(graph.people[centralNode!.personIds[0]].highestAuthorityLevel).toBe(3);
  });

  it('não duplica no nível 4 uma Comissão Central reconhecida somente pelo slug', () => {
    const centralBySlug = unit({
      id: 'central-slug-id',
      name: 'Estrutura Diretiva 2028',
      slug: 'comissao-central',
      isOfficial: true,
      isLegacy: false,
    });
    const graph = buildOrganizationalGraph({ members: [], units: [centralBySlug] });

    expect(graph.nodes.filter((node) => node.type === 'central-commission')).toHaveLength(1);
    expect(graph.nodes.find((node) => node.id === 'unit:central-slug-id')).toBeUndefined();
    expect(graph.renderableNodeIds).not.toContain('unit:central-slug-id');
    expect(
      graph.anomalies.some(
        (anomaly) => anomaly.code === 'excluded-unit'
          && anomaly.entityIds.includes('central-slug-id'),
      ),
    ).toBe(false);
  });

  it('deduplica por userId e nome normalizado sem repetir pessoa na Comissão Central', () => {
    const graph = buildOrganizationalGraph({
      members: [
        member({
          id: 'membership-a',
          nome_exibicao: 'Marcos Eduardo Servat',
          user_id: 'marcos-user',
          cargo: 'PRESIDENTE CCPF',
          commission_id: central.id,
          commission_nome: 'CENTRAL',
        }),
        member({
          id: 'membership-b',
          nome_exibicao: 'MARCOS EDUARDO SERVAT',
          user_id: 'marcos-user',
          cargo: 'Membro da Comissão Central',
          commission_id: central.id,
          commission_nome: 'Comissão Central',
        }),
      ],
      units: [central],
    });

    const ccp = graph.nodes.find((node) => node.type === 'ccp');
    const centralNode = graph.nodes.find((node) => node.type === 'central-commission');

    expect(Object.keys(graph.people)).toHaveLength(1);
    expect(ccp?.personIds).toHaveLength(1);
    expect(centralNode?.personIds).toEqual([]);
    expect(graph.people[ccp!.personIds[0]].roles).toEqual(
      expect.arrayContaining(['PRESIDENTE CCPF', 'MEMBRO DA COMISSÃO CENTRAL', 'COMISSÃO CENTRAL']),
    );
  });

  it('remove Ivan somente da Comissão Central e do papel CENTRAL, preservando seu vínculo oficial', () => {
    const tecnologia = unit({
      id: 'tecnologia-id',
      name: 'Comissão de Tecnologia',
      responsibles: [{
        id: 'ivan-tecnologia-responsible',
        displayName: 'Ivan Squinzani',
        responsibleType: 'pessoa',
        relationshipRole: 'principal',
        isPrimary: true,
        userId: 'ivan-user',
      }],
    });
    const graph = buildOrganizationalGraph({
      members: [member({
        nome_exibicao: 'IVAN SQUINZANI',
        user_id: 'ivan-user',
        cargo: 'MEMBRO DA COMISSÃO CENTRAL',
        commission_id: central.id,
        commission_nome: central.name,
      })],
      units: [central, tecnologia],
    });
    const personId = 'person:user:ivan-user';
    const centralNode = graph.nodes.find((node) => node.type === 'central-commission');
    const tecnologiaNode = graph.nodes.find((node) => node.id === 'unit:tecnologia-id');

    expect(graph.people[personId]).toMatchObject({
      fullName: 'IVAN SQUINZANI',
      highestAuthorityLevel: 4,
    });
    expect(centralNode?.personIds).not.toContain(personId);
    expect(tecnologiaNode?.personIds).toContain(personId);
    expect(graph.people[personId].roles).not.toContain('CENTRAL');
    expect(graph.people[personId].roles.join(' ')).not.toMatch(/COMISSÃO CENTRAL/);
    expect(graph.people[personId].roles).toContain('COMISSÃO DE TECNOLOGIA');
  });

  it('remove Jardel, seus vínculos e a unidade associada mesmo sem responsáveis carregados', () => {
    const unidadePorResponsavel = unit({
      id: 'captacao-jardel-id',
      name: 'Assessoria de Captação Institucional',
      type: 'assessoria',
      responsibles: [{
        id: 'jardel-responsible',
        displayName: 'Jardel Hillesheim',
        responsibleType: 'pessoa',
        relationshipRole: 'principal',
        isPrimary: true,
        userId: 'jardel-user',
      }],
    });
    const unidadeSemResponsaveis = unit({
      id: 'projetos-captacoes-id',
      name: 'Assessoria de Projetos e Captações',
      type: 'assessoria',
      responsibles: [],
    });
    const unidadeAliasSemResponsaveis = unit({
      id: 'projetos-captacoes-institucionais-id',
      name: 'Assessoria Projetos Captações Institucionais',
      type: 'assessoria',
      responsibles: [],
    });
    const unidadeDerivadaDoMembro = unit({
      id: 'nucleo-projetos-jardel-id',
      name: 'Núcleo de Projetos Especiais',
      type: 'assessoria',
      responsibles: [],
    });
    const unidadePreservada = unit({
      id: 'juridica-preservada-id',
      name: 'Assessoria Jurídica',
      type: 'assessoria',
    });
    const graph = buildOrganizationalGraph({
      members: [member({
        nome_exibicao: 'JARDEL HILLESHEIM',
        user_id: 'jardel-user',
        commission_id: unidadeDerivadaDoMembro.id,
        commission_nome: unidadeDerivadaDoMembro.name,
      })],
      units: [
        central,
        unidadePorResponsavel,
        unidadeSemResponsaveis,
        unidadeAliasSemResponsaveis,
        unidadeDerivadaDoMembro,
        unidadePreservada,
      ],
      volunteers: [{
        id: 'jardel-volunteer',
        fullName: 'Jardel Hillesheim',
        parentCommissionId: unidadePreservada.id,
        userId: 'jardel-user',
        roles: ['voluntariado'],
      }],
    });
    const excludedNodeIds = [
      'unit:captacao-jardel-id',
      'unit:projetos-captacoes-id',
      'unit:projetos-captacoes-institucionais-id',
      'unit:nucleo-projetos-jardel-id',
    ];

    expect(Object.values(graph.people).some((person) => person.fullName.includes('JARDEL'))).toBe(false);
    expect(graph.nodes.some((node) => node.title.includes('JARDEL'))).toBe(false);
    expect(graph.nodes.flatMap((node) => node.responsibilities).some((responsibility) => (
      responsibility.displayName.includes('JARDEL')
    ))).toBe(false);
    expect(graph.nodes.some((node) => node.id === 'volunteer:jardel-volunteer')).toBe(false);
    excludedNodeIds.forEach((nodeId) => {
      expect(graph.nodes.some((node) => node.id === nodeId)).toBe(false);
      expect(graph.renderableNodeIds).not.toContain(nodeId);
      expect(graph.edges.some((edge) => edge.sourceId === nodeId || edge.targetId === nodeId)).toBe(false);
    });
    expect(graph.nodes.some((node) => node.id === 'unit:juridica-preservada-id')).toBe(true);
  });

  it('mantém contas distintas separadas mesmo quando compartilham o mesmo nome', () => {
    const assessoria = unit({
      id: 'imprensa-id',
      name: 'Assessoria de Imprensa',
      type: 'assessoria',
      responsibles: [
        {
          id: 'deise-responsible',
          displayName: 'Deise Anelise Froelich',
          responsibleType: 'pessoa',
          relationshipRole: 'principal',
          isPrimary: true,
          userId: 'deise-secondary-user',
        },
      ],
    });
    const graph = buildOrganizationalGraph({
      members: [
        member({
          nome_exibicao: 'DEISE ANELISE FROELICH',
          user_id: 'deise-primary-user',
          cargo: 'MEMBRO DA COMISSÃO CENTRAL',
          commission_id: central.id,
          commission_nome: central.name,
        }),
      ],
      units: [central, assessoria],
    });
    const advisory = graph.nodes.find((node) => node.type === 'advisory');

    expect(advisory?.personIds).toEqual(['person:user:deise-secondary-user']);
    expect(Object.keys(graph.people)).toHaveLength(2);
    expect(graph.anomalies.some((item) => item.code === 'duplicate-person')).toBe(true);
  });

  it('aplica o reparo auditado das contas executivas duplicadas e preserva todos os cargos', () => {
    const graph = buildOrganizationalGraph({
      members: [
        member({
          id: 'fabiano-president-membership',
          nome_exibicao: 'Fabiano Soltis',
          user_id: 'b8fd1e36-b46c-4eff-bb75-372b676ce123',
          cargo: 'PRESIDENTE',
          commission_id: central.id,
          commission_nome: central.name,
        }),
        member({
          id: 'fabiano-vice-membership',
          nome_exibicao: 'FABIANO SOLTIS',
          user_id: 'efb4e097-5d6d-4d27-96ec-df0d9c9f2de6',
          cargo: 'VICE-PRESIDENTE',
          commission_id: central.id,
          commission_nome: central.name,
        }),
        member({
          id: 'djeison-vice-membership',
          nome_exibicao: 'Djeison Drey',
          user_id: 'djeison-vice-user',
          cargo: 'VICE-PRESIDENTE',
          commission_id: central.id,
          commission_nome: central.name,
        }),
      ],
      units: [central],
    });
    const executives = graph.nodes.filter((node) => node.type === 'executive');
    const fabianoNodes = executives.filter((node) =>
      node.title.toLocaleLowerCase('pt-BR') === 'fabiano soltis',
    );
    const fabianoNode = fabianoNodes[0];
    const fabiano = graph.people[fabianoNode.personIds[0]];

    expect(executives).toHaveLength(2);
    expect(fabianoNodes).toHaveLength(1);
    expect(fabianoNode).toMatchObject({ subtitle: 'PRESIDENTE' });
    expect(fabianoNode.metadata.executiveRole).toEqual([
      'president',
      'vice-president',
    ]);
    expect(fabiano.roles).toEqual(
      expect.arrayContaining(['PRESIDENTE', 'VICE-PRESIDENTE']),
    );
    expect(fabiano.sourceIds).toEqual(
      expect.arrayContaining([
        'fabiano-president-membership',
        'b8fd1e36-b46c-4eff-bb75-372b676ce123',
        'fabiano-vice-membership',
        'efb4e097-5d6d-4d27-96ec-df0d9c9f2de6',
      ]),
    );
    expect(
      graph.anomalies.some(
        (item) =>
          item.code === 'duplicate-person'
          && item.severity === 'info'
          && item.message.includes('identidade visual canônica'),
      ),
    ).toBe(true);
    expect(
      graph.anomalies.some((item) => item.code === 'executive-cardinality'),
    ).toBe(true);
  });

  it('mantém homônimos executivos separados quando não existe reparo auditado', () => {
    const graph = buildOrganizationalGraph({
      members: [
        member({
          nome_exibicao: 'João da Silva',
          user_id: 'joao-president-user',
          cargo: 'PRESIDENTE',
          commission_id: central.id,
          commission_nome: central.name,
        }),
        member({
          nome_exibicao: 'JOÃO DA SILVA',
          user_id: 'joao-vice-user',
          cargo: 'VICE-PRESIDENTE',
          commission_id: central.id,
          commission_nome: central.name,
        }),
      ],
      units: [central],
    });
    const executives = graph.nodes.filter((node) => node.type === 'executive');

    expect(executives).toHaveLength(2);
    expect(executives.map((node) => node.personIds[0])).toEqual(
      expect.arrayContaining([
        'person:user:joao-president-user',
        'person:user:joao-vice-user',
      ]),
    );
  });

  it('não funde userIds distintos por aproximação textual', () => {
    const graph = buildOrganizationalGraph({
      members: [
        member({
          id: 'marina-membership',
          nome_exibicao: 'Marina Silva',
          user_id: 'marina-user',
          commission_id: central.id,
          commission_nome: central.name,
        }),
        member({
          id: 'mariana-membership',
          nome_exibicao: 'Mariana Silva',
          user_id: 'mariana-user',
          commission_id: central.id,
          commission_nome: central.name,
        }),
      ],
      units: [central],
    });

    expect(Object.keys(graph.people)).toEqual(expect.arrayContaining([
      'person:user:marina-user',
      'person:user:mariana-user',
    ]));
    expect(Object.keys(graph.people)).toHaveLength(2);
  });

  it('preserva múltiplos roles e a relação de assessoria na identidade canônica de autoridade superior', () => {
    const assessoria = unit({
      id: 'juridica-id',
      name: 'Assessoria Jurídica',
      type: 'assessoria',
      responsibles: [
        {
          id: 'marcos-juridico',
          displayName: 'Marcos Eduardo Servat',
          responsibleType: 'pessoa',
          relationshipRole: 'corresponsavel',
          isPrimary: false,
          userId: 'marcos-user',
        },
      ],
    });
    const comissao = unit({
      id: 'projetos-id',
      name: 'Comissão de Projetos',
      responsibles: [
        {
          id: 'marcos-projetos',
          displayName: 'Marcos Eduardo Servat',
          responsibleType: 'pessoa',
          relationshipRole: 'principal',
          isPrimary: true,
          userId: 'marcos-user',
        },
      ],
    });
    const graph = buildOrganizationalGraph({
      members: [
        member({
          nome_exibicao: 'Marcos Eduardo Servat',
          user_id: 'marcos-user',
          cargo: 'PRESIDENTE CCPF',
          role: 'admin',
          commission_id: central.id,
          commission_nome: 'CENTRAL',
        }),
      ],
      units: [central, assessoria, comissao],
    });
    const ccpPersonId = graph.nodes.find((node) => node.type === 'ccp')!.personIds[0];
    const advisory = graph.nodes.find((node) => node.type === 'advisory');
    const commission = graph.nodes.find((node) => node.id === 'unit:projetos-id');
    const person = graph.people[ccpPersonId];

    expect(advisory?.personIds).toEqual([ccpPersonId]);
    expect(commission?.personIds).toEqual([]);
    expect(commission?.responsibilities[0]?.personId).toBe(ccpPersonId);
    expect(person.highestAuthorityLevel).toBe(1);
    expect(person.roles).toEqual(
      expect.arrayContaining([
        'PRESIDENTE CCPF',
        'CENTRAL',
        'CORRESPONSAVEL',
        'ASSESSORIA JURÍDICA',
      ]),
    );
    expect(person.roles).not.toContain('admin');
  });

  it('concilia variações institucionais longas, abreviadas e com erro de digitação único', () => {
    const inovacao = unit({
      id: 'inovacao-id',
      name: 'Inovação e Tecnologia',
      responsibles: [
        {
          id: 'felipe-short',
          displayName: 'Felipe Carpenedo',
          responsibleType: 'pessoa',
          relationshipRole: 'principal',
          isPrimary: true,
          userId: null,
        },
        {
          id: 'felipe-duplicated-source',
          displayName: 'FELIPE CARPENEDO GABRIEL',
          responsibleType: 'pessoa',
          relationshipRole: 'principal',
          isPrimary: false,
          userId: 'felipe-user',
        },
      ],
    });
    const relacionamento = unit({
      id: 'relacionamento-id',
      name: 'Relacionamento e Experiência',
      responsibles: [
        {
          id: 'fernanda-short',
          displayName: 'Fernanda Mataruco',
          responsibleType: 'pessoa',
          relationshipRole: 'principal',
          isPrimary: true,
          userId: null,
        },
      ],
    });
    const graph = buildOrganizationalGraph({
      members: [
        member({
          nome_exibicao: 'FELIPE CARPENEDO GABRIEL',
          user_id: 'felipe-user',
          commission_id: inovacao.id,
          commission_nome: inovacao.name,
        }),
        member({
          nome_exibicao: 'FERNANDA MATARUCCO MEINERTZ',
          user_id: 'fernanda-user',
          commission_id: relacionamento.id,
          commission_nome: relacionamento.name,
        }),
      ],
      units: [inovacao, relacionamento],
    });

    const felipeNode = graph.nodes.find((node) => node.id === 'unit:inovacao-id');
    const fernandaNode = graph.nodes.find((node) => node.id === 'unit:relacionamento-id');

    expect(felipeNode?.personIds).toEqual(['person:user:felipe-user']);
    expect(felipeNode?.responsibilities).toHaveLength(1);
    expect(fernandaNode?.personIds).toEqual(['person:user:fernanda-user']);
    expect(Object.keys(graph.people)).toHaveLength(2);
  });

  it('não funde duas identidades quando a aproximação exige mais de uma correção', () => {
    const unidade = unit({
      id: 'identidade-fuzzy-id',
      name: 'Comissão de Identidade',
      responsibles: [
        {
          id: 'mariana-silvo-responsible',
          displayName: 'Mariana Silvo',
          responsibleType: 'pessoa',
          relationshipRole: 'principal',
          isPrimary: true,
          userId: null,
        },
      ],
    });
    const graph = buildOrganizationalGraph({
      members: [
        member({
          nome_exibicao: 'Marina Silva',
          user_id: 'marina-user',
          commission_id: central.id,
          commission_nome: central.name,
        }),
      ],
      units: [central, unidade],
    });
    const node = graph.nodes.find((item) => item.id === 'unit:identidade-fuzzy-id');

    expect(node?.personIds).toEqual(['person:name:mariana-silvo']);
    expect(Object.keys(graph.people)).toEqual(expect.arrayContaining([
      'person:user:marina-user',
      'person:name:mariana-silvo',
    ]));
  });

  it('mantém pessoa sem avatar renderizável no estado neutro', () => {
    const unidade = unit({
      id: 'sem-foto-id',
      name: 'Comissão Sem Foto',
      responsibles: [
        {
          id: 'sem-foto-responsible',
          displayName: 'Pessoa Real Sem Retrato',
          responsibleType: 'pessoa',
          relationshipRole: 'principal',
          isPrimary: true,
          userId: 'sem-foto-user',
        },
      ],
    });
    const graph = buildOrganizationalGraph({ members: [], units: [unidade] });
    const personId = graph.nodes.find((node) => node.id === 'unit:sem-foto-id')!.personIds[0];

    expect(graph.people[personId].avatarUrl).toBeNull();
    expect(graph.renderableNodeIds).toContain('unit:sem-foto-id');
    expect(
      graph.anomalies.some(
        (item) => item.code === 'missing-avatar' && item.entityIds.includes(personId),
      ),
    ).toBe(true);
  });

  it('inclui somente unidades oficiais não legadas e preserva múltiplos responsáveis e equipes', () => {
    const oficial = unit({
      id: 'relacoes-id',
      name: 'Relações Estratégicas',
      responsibles: [
        {
          id: 'miguel-id',
          displayName: 'Miguel Nedel',
          responsibleType: 'pessoa',
          relationshipRole: 'principal',
          isPrimary: true,
          userId: null,
        },
        {
          id: 'diana-id',
          displayName: 'Diana Nedel',
          responsibleType: 'pessoa',
          relationshipRole: 'copresidente',
          isPrimary: false,
          userId: null,
        },
        {
          id: 'equipe-id',
          displayName: 'Equipe do EP',
          responsibleType: 'equipe',
          relationshipRole: 'equipe_apoio',
          isPrimary: false,
          userId: null,
        },
      ],
    });
    const legado = unit({ id: 'legado-id', name: 'Unidade 2026', isOfficial: false, isLegacy: true });
    const graph = buildOrganizationalGraph({ members: [], units: [oficial, legado] });
    const node = graph.nodes.find((item) => item.id === 'unit:relacoes-id');

    expect(node?.personIds).toHaveLength(2);
    expect(node?.responsibilities).toHaveLength(3);
    expect(node?.responsibilities.find((item) => item.responsibleType === 'equipe')?.personId).toBeNull();
    expect(node?.metadata.teamLabels).toEqual(['EQUIPE DO EP']);
    expect(graph.nodes.some((item) => item.id === 'unit:legado-id')).toBe(false);
  });

  it('aceita o nível 5 no modelo sem ativá-lo no renderer atual', () => {
    const comissao = unit({ id: 'comissao-id', name: 'Comissão Oficial' });
    const raw = {
      members: [],
      units: [comissao],
      volunteers: [
        {
          id: 'volunteer-id',
          fullName: 'Voluntária Registrada',
          parentCommissionId: comissao.id,
          userId: 'volunteer-user',
          roles: ['voluntariado'],
        },
      ],
    } satisfies OrganizationalRawData;
    const graph = buildOrganizationalGraph(raw);
    const volunteer = graph.nodes.find((node) => node.type === 'volunteer');

    expect(volunteer).toMatchObject({
      authorityLevel: 5,
      isRenderable: false,
      parentIds: ['unit:comissao-id'],
    });
    expect(graph.renderableNodeIds).not.toContain(volunteer?.id);
    expect(graph.edges.some((edge) => edge.targetId === volunteer?.id)).toBe(true);
    expect(graph.people[volunteer!.personIds[0]].highestAuthorityLevel).toBe(5);
  });

  it('usa mapeamento explícito de cargos executivos', () => {
    expect(resolveExecutiveRole('PRESIDENTE')).toBe('president');
    expect(resolveExecutiveRole('Vice-Presidente')).toBe('vice-president');
    expect(resolveExecutiveRole('Presidente da FENASOJA 2028')).toBe('president');
    expect(resolveExecutiveRole('PRESIDENTE DE HONRA')).toBeNull();
    expect(resolveExecutiveRole('PRESIDENTE CCPF - gestão 2026/2028')).toBeNull();
    expect(resolveExecutiveRole('CO-PRESIDENTE DE COMISSÃO')).toBeNull();
  });
});
