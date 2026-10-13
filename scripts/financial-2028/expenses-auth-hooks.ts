// Local QA identities only; JWT validation and financial permission checks run in PostgREST/PostgreSQL.
export const QA_ORG = 'a0000000-0000-0000-0000-000000000001';
const profiles: Record<string, string> = {
  admin: '10000000-0000-0000-0000-000000000001',
  reader: '10000000-0000-0000-0000-000000000002',
  editor: '10000000-0000-0000-0000-000000000003',
  confirmer: '10000000-0000-0000-0000-000000000004',
  denied: '10000000-0000-0000-0000-000000000005',
};
export const qaProfile = () => new URLSearchParams(location.search).get('profile') ?? 'admin';
export const useAuth = () => ({ user: { id: profiles[qaProfile()] ?? profiles.denied }, loading: false,
  signOut: () => { location.href = `${location.pathname}?edicao=2028&profile=denied`; } });
export const useCurrentOrg = () => ({ orgId: QA_ORG });
export const useOrgCommissions = () => ({ commissions: [
  { id: 'c0000000-0000-0000-0000-000000000001', nome: 'Infraestrutura (QA local)', slug: 'qa-infra' },
  { id: 'c0000000-0000-0000-0000-000000000002', nome: 'Comunicação (QA local)', slug: 'qa-comunicacao' },
  { id: 'c0000000-0000-0000-0000-000000000003', nome: 'Cultura (QA local)', slug: 'qa-cultura' },
] });
