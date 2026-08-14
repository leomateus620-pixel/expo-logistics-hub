import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AgendaMeetingEdgeClient } from '../api/AgendaMeetingEdgeClient';
import { createMeetingMutationId } from '../capture/identity';
import type {
  AgendaMeetingSessionDetail,
  AgendaMeetingSessionSummary,
  AgendaMeetingMemberOption,
} from '../types';

export const agendaMeetingQueryKeys = {
  all: ['agenda-meeting-intelligence'] as const,
  sessions: (orgId: string | null, eventId: string | null) =>
    [...agendaMeetingQueryKeys.all, 'sessions', orgId, eventId] as const,
  detail: (orgId: string | null, eventId: string | null, sessionId: string | null) =>
    [...agendaMeetingQueryKeys.all, 'detail', orgId, eventId, sessionId] as const,
};

export function useAgendaMeetingMemberOptions(orgId: string | null, enabled = true) {
  return useQuery<AgendaMeetingMemberOption[]>({
    queryKey: [...agendaMeetingQueryKeys.all,'member-options',orgId],
    enabled: Boolean(enabled && orgId),
    queryFn: async () => {
      if (!orgId) return [];
      const { data,error } = await supabase
        .from('org_members_safe')
        .select('user_id,nome_exibicao')
        .eq('org_id',orgId)
        .eq('is_active',true)
        .order('nome_exibicao');
      if (error) throw error;
      return (data ?? []).flatMap((member) =>
        member.user_id && member.nome_exibicao
          ? [{ userId: member.user_id,name: member.nome_exibicao }]
          : []
      );
    },
    staleTime: 30_000,
    meta: { persist: false },
  });
}

export interface UseAgendaMeetingSessionsOptions {
  orgId: string | null;
  eventId: string | null;
  enabled?: boolean;
  client?: AgendaMeetingEdgeClient;
}

export interface UseAgendaMeetingSessionDetailOptions extends UseAgendaMeetingSessionsOptions {
  sessionId: string | null;
}

function buildSessionDetail(
  result: Awaited<ReturnType<AgendaMeetingEdgeClient['detail']>>,
): AgendaMeetingSessionDetail {
  const versions = result.transcriptVersions.map((version) => ({
    ...version,
    segments: result.transcriptSegments.filter(
      (segment) => segment.transcriptVersionId === version.id,
    ),
  }));
  return {
    ...result.session,
    transcriptVersions: versions,
    minutesVersions: result.minutesVersions,
    insights: result.insights,
    actionItems: result.actions,
  };
}

export function useAgendaMeetingSessions(options: UseAgendaMeetingSessionsOptions) {
  const client = useMemo(() => options.client ?? new AgendaMeetingEdgeClient(), [options.client]);
  const enabled = Boolean(options.enabled !== false && options.orgId && options.eventId);

  return useQuery<AgendaMeetingSessionSummary[]>({
    queryKey: agendaMeetingQueryKeys.sessions(options.orgId, options.eventId),
    enabled,
    queryFn: async () => {
      if (!options.orgId || !options.eventId) return [];
      const result = await client.list({
        mutationId: createMeetingMutationId(),
        orgId: options.orgId,
        eventId: options.eventId,
      });
      return result.sessions;
    },
    staleTime: 15_000,
    retry: 1,
    meta: { persist: false },
  });
}

export function useAgendaMeetingSessionDetail(options: UseAgendaMeetingSessionDetailOptions) {
  const client = useMemo(() => options.client ?? new AgendaMeetingEdgeClient(), [options.client]);
  const enabled = Boolean(
    options.enabled !== false && options.orgId && options.eventId && options.sessionId,
  );

  return useQuery<AgendaMeetingSessionDetail>({
    queryKey: agendaMeetingQueryKeys.detail(options.orgId, options.eventId, options.sessionId),
    enabled,
    queryFn: async () => {
      if (!options.orgId || !options.eventId || !options.sessionId) {
        throw new Error('meeting_detail_context_required');
      }
      return buildSessionDetail(
        await client.detail({
          mutationId: createMeetingMutationId(),
          orgId: options.orgId,
          eventId: options.eventId,
          sessionId: options.sessionId,
        }),
      );
    },
    staleTime: 10_000,
    retry: 1,
    meta: { persist: false },
  });
}
