// Synthetic local QA identity. Does not request authentication or a backend.
export const useAuth = () => ({ signOut: () => undefined });
export const useCurrentOrg = () => ({ orgId: 'qa-local-org' });
export const QA_COMMISSIONS = [
  { id: 'qa-c1', nome: 'Comissão sintética de Infraestrutura', slug: 'qa-infra' },
  { id: 'qa-c2', nome: 'Comissão sintética de Comunicação e Relações Institucionais', slug: 'qa-comunicacao' },
  { id: 'qa-c3', nome: 'Comissão sintética de Cultura', slug: 'qa-cultura' },
  { id: 'qa-c4', nome: 'Comissão sintética disponível para cadastro', slug: 'qa-nova' },
];
export const useOrgCommissions = () => ({ commissions: QA_COMMISSIONS });
