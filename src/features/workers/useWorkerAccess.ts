import { useCapabilities } from '@/hooks/useCapabilities';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import type { WorkerDefinition } from './types';

export function useWorkerAccess(worker: WorkerDefinition) {
  const { hasCapability, capSet, isLoading, loadError } = useCapabilities();
  const { myRole } = useCurrentOrg();
  const financialCaps = ['financial_access', 'financial_edit', 'financial_confirm', 'financial_settle', 'financial_admin'];
  const allowed = worker.id === 'caixa' ? myRole === 'admin' || financialCaps.some(capability => capSet.has(capability))
    : worker.capabilities.length === 0 || worker.capabilities.some(capability => hasCapability(capability));
  return { allowed, isLoading, loadError };
}
