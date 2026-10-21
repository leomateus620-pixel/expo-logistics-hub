import { createContext, useContext } from "react";
export const ReviewContext = createContext({ org: "", actor: "" });
export function useCurrentOrg() {
  return { orgId: useContext(ReviewContext).org, isLoading: false };
}
export function useAuth() {
  return { user: { id: useContext(ReviewContext).actor }, loading: false };
}
export function useOrgCommissions() {
  return { commissions: [], isLoading: false };
}
