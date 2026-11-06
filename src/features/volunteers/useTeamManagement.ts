import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { listTeamContacts, saveVolunteer, teamRpc } from "./api";
import type { VolunteerInput } from "./types";

export const TEAM_PRIVATE_QUERY = "team-private";
export function useTeamManagement(commissionId: string | null) {
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();
  const key = [TEAM_PRIVATE_QUERY, orgId, user?.id, commissionId];
  const permission = useQuery({
    queryKey: [...key, "permission"],
    enabled: !!user && !!orgId && !!commissionId,
    queryFn: async () =>
      (await teamRpc<string[]>("team_manageable_commission_ids")).includes(
        commissionId!,
      ),
    meta: { persist: false },
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30_000,
    retry: false,
  });
  const contacts = useQuery({
    queryKey: [...key, "contacts"],
    enabled: permission.data === true && !permission.isError,
    queryFn: async () => {
      try {
        return await listTeamContacts(commissionId!);
      } catch (error) {
        qc.setQueryData([...key, "contacts"], []);
        throw error;
      }
    },
    meta: { persist: false },
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30_000,
    retry: false,
  });
  useEffect(() => {
    if (permission.data !== true || permission.isError)
      qc.removeQueries({ queryKey: [...key, "contacts"] });
  }, [permission.data, permission.isError, orgId, user?.id, commissionId, qc]);
  useEffect(
    () => () => {
      void qc.cancelQueries({ queryKey: key });
      qc.removeQueries({ queryKey: key });
    },
    [orgId, user?.id, commissionId, qc],
  );

  const invalidate = async () => {
    await Promise.all(
      [
        "org-commissions",
        "cronograma-eventos",
        "unit-agenda",
        "org-members",
        TEAM_PRIVATE_QUERY,
      ].map((prefix) => qc.invalidateQueries({ queryKey: [prefix] })),
    );
  };
  return {
    canManage: permission.data === true && !permission.isError,
    contacts:
      permission.data === true && !contacts.isError
        ? (contacts.data ?? [])
        : [],
    privateLoading: contacts.isLoading,
    privateError: contacts.error,
    retryContacts: contacts.refetch,
    save: async (input: VolunteerInput) => {
      const result = await saveVolunteer(commissionId!, input);
      await invalidate();
      return result;
    },
    deactivate: async (personId: string, version: number) => {
      await teamRpc("team_deactivate_volunteer", {
        _commission_id: commissionId,
        _person_id: personId,
        _expected_version: version,
      });
      await invalidate();
    },
    requestAccess: async (personId: string) => {
      await teamRpc("team_request_access", {
        _commission_id: commissionId,
        _person_id: personId,
      });
      await invalidate();
    },
    invalidate,
  };
}
