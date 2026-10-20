// Local visual QA only. No authenticated requests or production data writes.
const units = [
  {
    id: 'qa-commission',
    name: 'Programação e Eventos',
    slug: 'programacao-e-eventos',
    type: 'comissao',
    displayOrder: 1,
    isOfficial: true,
    isLegacy: false,
    responsibles: [],
  },
  {
    id: 'qa-advisory',
    name: 'Assessoria de Marketing/Comunicação',
    slug: 'marketing-comunicacao',
    type: 'assessoria',
    displayOrder: 2,
    isOfficial: true,
    isLegacy: false,
    responsibles: [],
  },
];
const members = [
  {
    user_id: 'qa-person-1',
    nome_exibicao: 'Mariana Oliveira',
    cargo: 'Coordenação de programação',
    is_active: true,
  },
  {
    user_id: 'qa-person-2',
    nome_exibicao: 'Rafael Costa',
    cargo: 'Produção e operações',
    is_active: true,
  },
];
export const useOrgCommissions = () => ({
  units,
  commissions: units.map((unit) => ({
    id: unit.id,
    nome: unit.name,
    slug: unit.slug,
  })),
  isLoading: false,
  error: null,
});
export const useOrgMembers = () => ({
  members,
  loginMembers: members,
  isLoading: false,
  isLoadingLoginMembers: false,
  error: null,
  loginMembersError: null,
});
