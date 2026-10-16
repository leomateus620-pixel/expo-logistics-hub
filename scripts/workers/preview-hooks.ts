/** Synthetic local QA identities. Never imported by the product entrypoint. */
export const QA_ORG = '10000000-0000-4000-8000-000000000001';
export const qaProfile = () => new URLSearchParams(location.search).get('profile') ?? 'admin';
export const useAuth = () => ({ user: { id: qaProfile() === 'leitura' ? '00000000-0000-4000-8000-000000000004' : '00000000-0000-4000-8000-000000000001', user_metadata: { full_name: 'Leonardo' } }, loading: false });
export const useCurrentOrg = () => ({ orgId: QA_ORG, myRole: qaProfile() === 'leitura' ? 'leitura' : 'admin', isLoading: false });
export function useCapabilities() {
  const capabilities = qaProfile() === 'leitura' ? ['cronograma_eventos_access'] : ['map.view', 'map.manage_sales', 'map.analytics.view', 'venue_events_access', 'financial_access', 'full_access'];
  const capSet = new Set(capabilities);
  return { capSet, hasFullAccess: qaProfile() !== 'leitura', hasCapability: (capability: string) => capSet.has(capability), isLoading: false, loadError: false };
}
