import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';

export type VenueScope = 'restaurante' | 'arena';
export const VENUE_SCOPES: Array<{ id: VenueScope; label: string }> = [
  { id: 'restaurante', label: 'Restaurante' },
  { id: 'arena', label: 'Arena' },
];

export interface VenueSubscription {
  id: string;
  user_id: string;
  scope: VenueScope;
  push_enabled: boolean;
  google_enabled: boolean;
}

export interface VenueCandidate {
  user_id: string;
  full_name: string | null;
}

/** Inscrições da Agenda Restaurante e Arena (avisos no celular + Google Agenda). */
export function useVenueNotificationSettings(manageAll: boolean) {
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  const queryClient = useQueryClient();
  const key = ['venue-notification-subscriptions', orgId, manageAll ? 'all' : user?.id] as const;

  const subscriptions = useQuery({
    queryKey: key,
    enabled: Boolean(orgId && user?.id),
    queryFn: async () => {
      let query = supabase
        .from('venue_notification_subscriptions')
        .select('id, user_id, scope, push_enabled, google_enabled')
        .eq('org_id', orgId!);
      if (!manageAll) query = query.eq('user_id', user!.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as VenueSubscription[];
    },
  });

  const candidates = useQuery({
    queryKey: ['venue-notification-candidates', orgId],
    enabled: Boolean(orgId && manageAll),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('venue_notification_candidates', { _org_id: orgId! });
      if (error) throw error;
      return (data ?? []) as VenueCandidate[];
    },
  });

  const save = useMutation({
    mutationFn: async (input: {
      userId: string;
      scope: VenueScope;
      subscribed: boolean;
      push_enabled?: boolean;
      google_enabled?: boolean;
    }) => {
      if (!orgId) throw new Error('no_org');
      if (!input.subscribed) {
        const { error } = await supabase
          .from('venue_notification_subscriptions')
          .delete()
          .eq('org_id', orgId)
          .eq('user_id', input.userId)
          .eq('scope', input.scope);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('venue_notification_subscriptions').upsert(
        {
          org_id: orgId,
          user_id: input.userId,
          scope: input.scope,
          push_enabled: input.push_enabled ?? true,
          google_enabled: input.google_enabled ?? true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,user_id,scope' },
      );
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['venue-notification-subscriptions', orgId] }),
  });

  return { subscriptions, candidates, save, currentUserId: user?.id ?? null };
}
