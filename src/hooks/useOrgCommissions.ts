import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import {
  sortOrgUnits,
  type OrgUnit,
  type OrgUnitResponsible,
} from "@/lib/org-units";

export interface OrgCommission {
  id: string;
  nome: string;
  slug: string;
}
export interface InstitutionalIdentity {
  id: string;
  userId: string | null;
  name: string;
  photoUrl: string | null;
  legacyPhoto: boolean;
}

async function readPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

/** One paginated directory, shared by teams, Ecosystem and both Agendas. No contacts. */
export function useOrgCommissions() {
  const { orgId } = useCurrentOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["org-commissions", orgId, user?.id],
    enabled: !!orgId && !!user,
    staleTime: 15_000,
    refetchInterval: 30_000,
    meta: { persist: false },
    queryFn: async () => {
      const [commissions, links, people] = await Promise.all([
        readPages((from, to) =>
          supabase
            .from("commissions")
            .select(
              "id,nome,slug,unit_type,display_order,is_official,is_legacy",
            )
            .eq("org_id", orgId!)
            .eq("is_active", true)
            .order("id")
            .range(from, to),
        ),
        readPages((from, to) =>
          supabase
            .from("commission_responsibles")
            .select(
              "id,commission_id,person_id,responsible_type,relationship_role,is_primary,display_order,active,user_id,version",
            )
            .eq("org_id", orgId!)
            .eq("active", true)
            .order("display_order")
            .order("id")
            .range(from, to),
        ),
        // Historical events retain inactive people; new invitation options use active links only.
        readPages((from, to) =>
          supabase
            .from("commission_people")
            .select("id,display_name,user_id,avatar_path,legacy_photo,version")
            .eq("org_id", orgId!)
            .order("id")
            .range(from, to),
        ),
      ]);
      const paths = [
        ...new Set(
          people.flatMap((p) => (p.avatar_path ? [p.avatar_path] : [])),
        ),
      ].sort();
      const photos = await qc
        .fetchQuery({
          queryKey: ["institutional-avatar-urls", orgId, user!.id, paths],
          meta: { persist: false },
          staleTime: 30 * 60_000,
          gcTime: 60_000,
          queryFn: async () => {
            const pairs: Array<[string, string]> = [];
            for (let i = 0; i < paths.length; i += 100) {
              const { data, error } = await supabase.storage
                .from("team-avatars")
                .createSignedUrls(paths.slice(i, i + 100), 3600);
              if (error) throw error;
              for (const photo of data ?? [])
                if (photo.path && photo.signedUrl)
                  pairs.push([photo.path, photo.signedUrl]);
            }
            return pairs;
          },
        })
        .catch(() => [] as Array<[string, string]>);
      const urls = new Map(photos);
      const identities = new Map(people.map((p) => [p.id, p]));
      const members = new Map<string, OrgUnitResponsible[]>();
      for (const link of links) {
        const person = identities.get(link.person_id);
        if (!person) continue;
        const list = members.get(link.commission_id) ?? [];
        list.push({
          id: link.id,
          personId: person.id,
          displayName: person.display_name,
          userId: person.user_id,
          photoUrl: person.avatar_path
            ? (urls.get(person.avatar_path) ?? null)
            : null,
          legacyPhoto: person.legacy_photo,
          version: person.version,
          membershipVersion: link.version,
          responsibleType:
            link.responsible_type as OrgUnitResponsible["responsibleType"],
          relationshipRole:
            link.relationship_role as OrgUnitResponsible["relationshipRole"],
          isPrimary: link.is_primary,
        });
        members.set(link.commission_id, list);
      }
      const units: OrgUnit[] = commissions.map((c) => ({
        id: c.id,
        name: c.nome,
        slug: c.slug,
        type: c.unit_type as OrgUnit["type"],
        displayOrder: c.display_order,
        isOfficial: c.is_official,
        isLegacy: c.is_legacy,
        responsibles: members.get(c.id) ?? [],
      }));
      const directoryPeople: InstitutionalIdentity[] = people.map((p) => ({
        id: p.id,
        userId: p.user_id,
        name: p.display_name,
        legacyPhoto: p.legacy_photo,
        photoUrl: p.avatar_path ? (urls.get(p.avatar_path) ?? null) : null,
      }));
      return { units: sortOrgUnits(units), directoryPeople };
    },
  });
  const units = query.data?.units ?? [];
  return {
    units,
    directoryPeople: query.data?.directoryPeople ?? [],
    commissions: units.map(
      (unit): OrgCommission => ({
        id: unit.id,
        nome: unit.name,
        slug: unit.slug,
      }),
    ),
    isLoading: query.isLoading,
    refetch: query.refetch,
    error: query.error,
  };
}
