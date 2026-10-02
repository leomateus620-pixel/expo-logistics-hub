// No authentication request or production persistence is used in visual QA.
export const useAuth = () => ({ signOut: () => undefined });
