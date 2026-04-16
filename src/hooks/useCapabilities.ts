import { useCapabilitiesContext } from '@/contexts/CapabilitiesProvider';

export function useCapabilities() {
  return useCapabilitiesContext();
}
