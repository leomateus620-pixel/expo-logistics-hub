import { useAuthContext } from '@/contexts/AuthProvider';

export function useAuth() {
  return useAuthContext();
}
