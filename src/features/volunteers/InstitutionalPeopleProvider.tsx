import { useQueryClient } from "@tanstack/react-query";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useOrgCommissions } from "@/hooks/useOrgCommissions";
import { getPersonPhoto } from "@/components/cronograma-eventos/personPhotos";

interface Identity {
  name: string;
  photoUrl: string | null;
  legacyPhoto: boolean;
}
const Context = createContext(new Map<string, Identity>());
export function InstitutionalPeopleProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { directoryPeople } = useOrgCommissions();
  const { orgId } = useCurrentOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!orgId || !user) return;
    const refresh = () => {
      for (const key of [
        "org-commissions",
        "cronograma-eventos",
        "unit-agenda",
        "team-private",
      ])
        void qc.invalidateQueries({ queryKey: [key] });
    };
    const revoke = () => {
      for (const query of qc
        .getQueryCache()
        .findAll({ queryKey: ["team-private"] })) {
        const kind = query.queryKey.at(-1);
        qc.setQueryData(
          query.queryKey,
          kind === "permission"
            ? false
            : kind === "administration"
              ? { access: [], reconciliation: [] }
              : [],
        );
      }
      void qc.invalidateQueries({ queryKey: ["my-org-membership", user.id] });
      refresh();
    };
    const channel = supabase
      .channel(`institutional-team:${orgId}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "commission_people",
          filter: `org_id=eq.${orgId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "commission_responsibles",
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          // A new volunteer must not interrupt the open form while its photo saves.
          // Changes to the signed-in person's own assignment invalidate permission immediately.
          const next = payload.new as { user_id?: string };
          const previous = payload.old as { user_id?: string };
          if (
            payload.eventType === "DELETE" ||
            next.user_id === user.id ||
            previous.user_id === user.id
          )
            revoke();
          else refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "org_members",
          filter: `user_id=eq.${user.id}`,
        },
        revoke,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
      qc.removeQueries({ queryKey: ["team-private"] });
    };
  }, [orgId, user?.id, qc]);
  const identities = useMemo(() => {
    const map = new Map<string, Identity>();
    for (const p of directoryPeople) {
      const value = {
        name: p.name,
        photoUrl: p.photoUrl,
        legacyPhoto: p.legacyPhoto,
      };
      map.set(p.id, value);
      if (p.userId) map.set(p.userId, value);
    }
    return map;
  }, [directoryPeople]);
  return <Context.Provider value={identities}>{children}</Context.Provider>;
}
export function useInstitutionalIdentity(
  id?: string | null,
  userId?: string | null,
  name?: string | null,
  photoUrl?: string | null,
  legacyPhoto = true,
) {
  const identities = useContext(Context);
  const identity =
    identities.get(id?.replace(/^person:/, "") ?? "") ??
    identities.get(userId ?? "");
  return {
    name: identity?.name ?? name,
    photoUrl:
      identity?.photoUrl ??
      photoUrl ??
      ((identity?.legacyPhoto ?? legacyPhoto)
        ? getPersonPhoto(identity?.name ?? name, userId)
        : null),
  };
}
