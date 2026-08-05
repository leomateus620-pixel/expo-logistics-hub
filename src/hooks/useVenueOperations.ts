import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type MutateOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  mapVenueError,
  toEventRpcPayload,
  venueAgreementSchema,
  venueStakeholderSchema,
  type VenueAgreement,
  type VenueApproval,
  type VenueAuditEntry,
  type VenueChecklistItem,
  type VenueCounterpartBalanceRow,
  type VenueCounterpartUsage,
  type VenueEvent,
  type VenueEventAllocation,
  type VenueEventDocument,
  type VenueEventDraft,
  type VenueEventResponsible,
  type VenueEventResource,
  type VenueMember,
  type VenueSpace,
  type VenueSpaceBlock,
  type VenueStakeholder,
  type VenueWorkspaceData,
} from "@/lib/venue-operations";

const VENUE_QUERY_KEY = "venue-operations";
const VENUE_DOCUMENT_BUCKET = "venue-event-documents";
const VENUE_AUDIT_PAGE_SIZE = 100;

// Compatibility boundary until the generated Supabase bindings are refreshed
// after these additive migrations are applied to the linked project.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const venueDb = supabase as any;

export interface VenuePermissionMap {
  venue_events_access: boolean;
  venue_events_create: boolean;
  venue_events_manage: boolean;
  venue_events_approve: boolean;
  venue_events_cancel: boolean;
  venue_events_conflict_override: boolean;
  venue_events_restricted_view: boolean;
  venue_counterparts_manage: boolean;
  venue_excess_approve: boolean;
  venue_sponsors_manage: boolean;
  venue_venues_manage: boolean;
  venue_operations_manage: boolean;
  venue_documents_manage: boolean;
  venue_documents_sensitive: boolean;
  venue_reports_view: boolean;
  venue_events_audit_view: boolean;
}

export interface VenueStakeholderInput {
  id?: string;
  version?: number;
  legalName: string;
  tradeName: string;
  documentIdentifier: string;
  contactName: string;
  email: string;
  phone: string;
  relationshipType: VenueStakeholder["relationship_type"];
  contractReference: string;
  sponsorCategory: string;
  activeFrom: string;
  activeUntil: string;
  notes: string;
  active: boolean;
  changeReason?: string;
}

export interface VenueAgreementInput {
  id?: string;
  version?: number;
  stakeholderId: string;
  spaceId: string;
  contractReference: string;
  validFrom: string;
  validUntil: string;
  benefitType: string;
  unitType: VenueAgreement["unit_type"];
  grantedQuantity: number;
  valuePerExcessUnit: number | null;
  requiresApproval: boolean;
  noShowConsumesAllowance: boolean;
  allowedEventTypes: VenueEvent["event_type"][];
  restrictions: string[];
  responsibleApproverId: string;
  documentPath: string;
  notes: string;
  status: VenueAgreement["status"];
  changeReason?: string;
}

export interface VenueBlockInput {
  id?: string;
  version?: number;
  spaceId: string;
  blockType: VenueSpaceBlock["block_type"];
  title: string;
  startsAt: string;
  endsAt: string;
  stakeholderId?: string;
  reason: string;
  active: boolean;
}

export interface VenueSpaceInput {
  id?: string;
  version?: number;
  parentSpaceId: string;
  slug: string;
  name: string;
  type: string;
  description: string;
  capacity: number | null;
  location: string;
  availableAreas: string[];
  restrictions: string[];
  allowedEventTypes: VenueEvent["event_type"][];
  dailyStart: string;
  dailyEnd: string;
  requiredSetupMinutes: number;
  requiredTeardownMinutes: number;
  defaultResponsibleTeam: string;
  availableResources: string[];
  internalNotes: string;
  active: boolean;
  changeReason?: string;
}

interface VenueWorkspace extends VenueWorkspaceData {
  permissions: VenuePermissionMap;
}

interface IdempotentMutationVariables<TInput> {
  input: TInput;
  idempotencyKey: string;
  fingerprint: string;
}

type IdempotentMutationResult<TData, TInput> = Omit<
  UseMutationResult<TData, Error, IdempotentMutationVariables<TInput>, unknown>,
  "mutate" | "mutateAsync" | "reset" | "variables"
> & {
  mutate: (
    input: TInput,
    options?: MutateOptions<TData, Error, TInput, unknown>,
  ) => void;
  mutateAsync: (
    input: TInput,
    options?: MutateOptions<TData, Error, TInput, unknown>,
  ) => Promise<TData>;
  reset: () => void;
  discard: () => void;
  variables: TInput | undefined;
};

const EMPTY_PERMISSIONS: VenuePermissionMap = {
  venue_events_access: false,
  venue_events_create: false,
  venue_events_manage: false,
  venue_events_approve: false,
  venue_events_cancel: false,
  venue_events_conflict_override: false,
  venue_events_restricted_view: false,
  venue_counterparts_manage: false,
  venue_excess_approve: false,
  venue_sponsors_manage: false,
  venue_venues_manage: false,
  venue_operations_manage: false,
  venue_documents_manage: false,
  venue_documents_sensitive: false,
  venue_reports_view: false,
  venue_events_audit_view: false,
};

function requireOrgId(orgId: string | null): string {
  if (!orgId) throw new Error("VENUE_ORG_REQUIRED");
  return orgId;
}

function requireOnline(isOnline: boolean) {
  if (!isOnline) throw new Error("VENUE_OFFLINE_WRITE_BLOCKED");
}

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  throw new Error("VENUE_IDEMPOTENCY_UNAVAILABLE");
}

function normalizeMutationValue(
  value: unknown,
  ancestors = new WeakSet<object>(),
): unknown {
  if (typeof File !== "undefined" && value instanceof File) {
    return {
      __type: "File",
      name: value.name,
      size: value.size,
      type: value.type,
      lastModified: value.lastModified,
    };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => normalizeMutationValue(item, ancestors));
  }
  if (value && typeof value === "object") {
    if (ancestors.has(value)) {
      throw new Error("VENUE_IDEMPOTENCY_PAYLOAD_INVALID");
    }
    ancestors.add(value);
    const normalized = Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          normalizeMutationValue(
            (value as Record<string, unknown>)[key],
            ancestors,
          ),
        ]),
    );
    ancestors.delete(value);
    return normalized;
  }
  return value;
}

function mutationFingerprint<TInput>(
  scope: string | null,
  action: string,
  input: TInput,
): string {
  return JSON.stringify({
    scope,
    action,
    input: normalizeMutationValue(input),
  });
}

function adaptMutationOptions<TData, TInput>(
  options?: MutateOptions<TData, Error, TInput, unknown>,
):
  | MutateOptions<TData, Error, IdempotentMutationVariables<TInput>, unknown>
  | undefined {
  if (!options) return undefined;
  return {
    onSuccess: (data, variables, onMutateResult, context) =>
      options.onSuccess?.(data, variables.input, onMutateResult, context),
    onError: (error, variables, onMutateResult, context) =>
      options.onError?.(error, variables.input, onMutateResult, context),
    onSettled: (data, error, variables, onMutateResult, context) =>
      options.onSettled?.(
        data,
        error,
        variables.input,
        onMutateResult,
        context,
      ),
  };

}

function useIdempotentMutation<TData, TInput>({
  action,
  scope,
  mutationFn,
  onSuccess,
}: {
  action: string;
  scope: string | null;
  mutationFn: (input: TInput, idempotencyKey: string) => Promise<TData>;
  onSuccess: () => Promise<void>;
}): IdempotentMutationResult<TData, TInput> {
  const activeOperationRef = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);

  const prepare = useCallback(
    (input: TInput): IdempotentMutationVariables<TInput> => {
      const fingerprint = mutationFingerprint(scope, action, input);
      if (activeOperationRef.current?.fingerprint !== fingerprint) {
        activeOperationRef.current = {
          fingerprint,
          idempotencyKey: createIdempotencyKey(),
        };
      }
      return {
        input,
        fingerprint,
        idempotencyKey: activeOperationRef.current.idempotencyKey,
      };
    },
    [action, scope],
  );

  useEffect(() => {
    activeOperationRef.current = null;
  }, [action, scope]);

  const mutation = useMutation<
    TData,
    Error,
    IdempotentMutationVariables<TInput>,
    unknown
  >({
    mutationFn: ({ input, idempotencyKey }) =>
      mutationFn(input, idempotencyKey),
    onSuccess: async (_data, variables) => {
      if (
        activeOperationRef.current?.fingerprint === variables.fingerprint &&
        activeOperationRef.current.idempotencyKey === variables.idempotencyKey
      ) {
        activeOperationRef.current = null;
      }
      await onSuccess();
    },
  });

  const mutate = useCallback(
    (input: TInput, options?: MutateOptions<TData, Error, TInput, unknown>) =>
      mutation.mutate(prepare(input), adaptMutationOptions(options)),
    [mutation, prepare],
  );
  const mutateAsync = useCallback(
    (input: TInput, options?: MutateOptions<TData, Error, TInput, unknown>) =>
      mutation.mutateAsync(prepare(input), adaptMutationOptions(options)),
    [mutation, prepare],
  );
  const reset = useCallback(() => {
    activeOperationRef.current = null;
    mutation.reset();
  }, [mutation]);

  return {
    ...mutation,
    variables: mutation.variables?.input,
    mutate,
    mutateAsync,
    reset,
    discard: reset,
  };
}

function isStorageObjectAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    status?: number;
    statusCode?: number | string;
    message?: string;
    name?: string;
  };
  if (
    candidate.status === 409 ||
    candidate.statusCode === 409 ||
    candidate.statusCode === "409"
  ) {
    return true;
  }
  return `${candidate.name ?? ""} ${candidate.message ?? ""}`
    .toLocaleLowerCase()
    .includes("duplicate");
}

function ensureResult<T>(
  result: { data: T | null; error: unknown },
  label: string,
): T {
  if (result.error) throw result.error;
  if (result.data === null) throw new Error(`VENUE_DATA_UNAVAILABLE:${label}`);
  return result.data;
}

interface VenueAuditCursor {
  createdAt: string;
  id: string;
}

interface VenueAuditPage {
  entries: VenueAuditEntry[];
  nextCursor: VenueAuditCursor | null;
}

async function fetchVenueAuditPage(
  orgId: string,
  eventId: string | null,
  before: VenueAuditCursor | null,
): Promise<VenueAuditPage> {
  const { data, error } = await venueDb.rpc("venue_get_audit_history", {
    _org_id: orgId,
    _event_id: eventId,
    _limit: VENUE_AUDIT_PAGE_SIZE,
    _before: before?.createdAt ?? null,
    _before_id: before?.id ?? null,
  });
  if (error) throw error;
  const entries = (data ?? []) as VenueAuditEntry[];
  const lastEntry = entries.at(-1);
  const nextCursor = lastEntry
    ? { createdAt: lastEntry.created_at, id: lastEntry.id }
    : null;
  return {
    entries,
    nextCursor:
      entries.length === VENUE_AUDIT_PAGE_SIZE &&
      (nextCursor?.createdAt !== before?.createdAt ||
        nextCursor.id !== before?.id)
        ? nextCursor
        : null,
  };
}

function flattenVenueAuditPages(pages: VenueAuditPage[] | undefined) {
  if (!pages) return undefined;
  const entries = new Map<string, VenueAuditEntry>();
  for (const page of pages) {
    for (const entry of page.entries) entries.set(entry.id, entry);
  }
  return [...entries.values()];
}

async function fetchVenueWorkspace(orgId: string): Promise<VenueWorkspace> {
  const db = venueDb;
  const [
    spacesResult,
    eventsResult,
    allocationsResult,
    responsiblesResult,
    stakeholdersResult,
    agreementsResult,
    usagesResult,
    balancesResult,
    resourcesResult,
    checklistResult,
    blocksResult,
    membersResult,
    permissionsResult,
  ] = await Promise.all([
    db.from("venue_spaces").select("*").eq("org_id", orgId).order("name"),
    db
      .from("venue_events")
      .select("*")
      .eq("org_id", orgId)
      .order("start_at", { ascending: true, nullsFirst: false }),
    db
      .from("venue_event_spaces")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at"),
    db
      .from("venue_event_responsibles")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at"),
    db
      .from("venue_stakeholder_directory")
      .select("*")
      .eq("org_id", orgId)
      .order("trade_name", { ascending: true, nullsFirst: false }),
    db
      .from("venue_counterpart_agreements")
      .select("*")
      .eq("org_id", orgId)
      .order("valid_until", { ascending: false }),
    db
      .from("venue_counterpart_usage")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    db.from("venue_counterpart_balances").select("*").eq("org_id", orgId),
    db
      .from("venue_event_resources")
      .select("*")
      .eq("org_id", orgId)
      .order("resource_type"),
    db
      .from("venue_event_checklist_items")
      .select("*")
      .eq("org_id", orgId)
      .order("sort_order"),
    db
      .from("venue_space_blocks")
      .select("*")
      .eq("org_id", orgId)
      .order("starts_at"),
    db
      .from("org_members_safe")
      .select("user_id, nome_exibicao, cargo, role, is_active")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("nome_exibicao"),
    db.rpc("venue_get_permissions", { _org_id: orgId }),
  ]);

  return {
    spaces: ensureResult<VenueSpace[]>(spacesResult, "spaces"),
    events: ensureResult<VenueEvent[]>(eventsResult, "events"),
    allocations: ensureResult<VenueEventAllocation[]>(
      allocationsResult,
      "allocations",
    ),
    responsibles: ensureResult<VenueEventResponsible[]>(
      responsiblesResult,
      "responsibles",
    ),
    stakeholders: ensureResult<VenueStakeholder[]>(
      stakeholdersResult,
      "stakeholders",
    ),
    agreements: ensureResult<VenueAgreement[]>(agreementsResult, "agreements"),
    usages: ensureResult<VenueCounterpartUsage[]>(usagesResult, "usages"),
    balances: ensureResult<VenueCounterpartBalanceRow[]>(
      balancesResult,
      "balances",
    ),
    resources: ensureResult<VenueEventResource[]>(resourcesResult, "resources"),
    checklist: ensureResult<VenueChecklistItem[]>(checklistResult, "checklist"),
    blocks: ensureResult<VenueSpaceBlock[]>(blocksResult, "blocks"),
    members: ensureResult<VenueMember[]>(membersResult, "members"),
    permissions: {
      ...EMPTY_PERMISSIONS,
      ...ensureResult<Partial<VenuePermissionMap>>(
        permissionsResult,
        "permissions",
      ),
    },
  };
}

export function useVenueOperations() {
  const { orgId, orgName, isLoading: orgLoading } = useCurrentOrg();
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => [VENUE_QUERY_KEY, orgId], [orgId]);

  const workspaceQuery = useQuery({
    queryKey,
    queryFn: () => fetchVenueWorkspace(requireOrgId(orgId)),
    enabled: Boolean(orgId),
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    retry: 1,
    meta: { persist: false },
  });

  useEffect(() => {
    if (!orgId) return undefined;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey });
    };
    const channel = supabase
      .channel(`venue-operations:${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_events",
          filter: `org_id=eq.${orgId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_spaces",
          filter: `org_id=eq.${orgId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_stakeholders",
          filter: `org_id=eq.${orgId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_counterpart_agreements",
          filter: `org_id=eq.${orgId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_event_responsibles",
          filter: `org_id=eq.${orgId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_event_resources",
          filter: `org_id=eq.${orgId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_event_checklist_items",
          filter: `org_id=eq.${orgId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_counterpart_usage",
          filter: `org_id=eq.${orgId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_space_blocks",
          filter: `org_id=eq.${orgId}`,
        },
        invalidate,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, queryClient, queryKey]);

  const invalidateWorkspace = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const checkAvailability = useCallback(
    async (draft: VenueEventDraft) => {
      if (draft.pendingDate) return [];
      const currentOrgId = requireOrgId(orgId);
      const payload = toEventRpcPayload(draft);
      const { data, error } = await venueDb.rpc("venue_check_availability", {
        _org_id: currentOrgId,
        _space_ids: payload.venue_ids,
        _setup_start_at: payload.setup_start_at,
        _teardown_end_at: payload.teardown_end_at,
        _exclude_event_id: draft.id ?? null,
        _audience: payload.confirmed_audience ?? payload.estimated_audience,
        _event_start_at: payload.start_at,
        _event_end_at: payload.end_at,
        _event_type: payload.event_type,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        conflict_kind: string;
        conflict_id: string;
        space_id: string;
        title: string;
        starts_at: string | null;
        ends_at: string | null;
        detail: string;
      }>;
    },
    [orgId],
  );

  const saveEvent = useIdempotentMutation<
    {
      event_id: string;
      version: number;
      status: string;
      conflicts: unknown[];
    },
    VenueEventDraft
  >({
    action: "save-event",
    scope: orgId,
    mutationFn: async (draft, idempotencyKey) => {
      requireOnline(isOnline);
      const currentOrgId = requireOrgId(orgId);
      const { data, error } = await venueDb.rpc("venue_save_event", {
        _org_id: currentOrgId,
        _event_id: draft.id ?? null,
        _expected_version: draft.version ?? null,
        _idempotency_key: idempotencyKey,
        _payload: toEventRpcPayload(draft),
      });
      if (error) throw error;
      return data as {
        event_id: string;
        version: number;
        status: string;
        conflicts: unknown[];
      };
    },
    onSuccess: invalidateWorkspace,
  });

  type TransitionEventInput = {
    eventId: string;
    expectedVersion: number;
    transition: string;
    reason?: string;
    payload?: Record<string, unknown>;
  };
  const transitionEvent = useIdempotentMutation<
    { event_id: string; version: number; status: string },
    TransitionEventInput
  >({
    action: "transition-event",
    scope: orgId,
    mutationFn: async (input, idempotencyKey) => {
      requireOnline(isOnline);
      const currentOrgId = requireOrgId(orgId);
      const { data, error } = await venueDb.rpc("venue_transition_event", {
        _org_id: currentOrgId,
        _event_id: input.eventId,
        _expected_version: input.expectedVersion,
        _transition: input.transition,
        _reason: input.reason ?? null,
        _idempotency_key: idempotencyKey,
        _payload: input.payload ?? {},
      });
      if (error) throw error;
      return data as { event_id: string; version: number; status: string };
    },
    onSuccess: invalidateWorkspace,
  });

  const upsertStakeholder = useIdempotentMutation<
    { stakeholder_id: string; version: number },
    VenueStakeholderInput
  >({
    action: "upsert-stakeholder",
    scope: orgId,
    mutationFn: async (input, idempotencyKey) => {
      requireOnline(isOnline);
      const currentOrgId = requireOrgId(orgId);
      const parsed = venueStakeholderSchema.parse(input);
      const { data, error } = await venueDb.rpc("venue_upsert_stakeholder", {
        _org_id: currentOrgId,
        _stakeholder_id: parsed.id ?? null,
        _expected_version: parsed.version ?? null,
        _idempotency_key: idempotencyKey,
        _payload: {
          legal_name: parsed.legalName,
          trade_name: parsed.tradeName || null,
          document_identifier: parsed.documentIdentifier || null,
          contact_name: parsed.contactName || null,
          email: parsed.email || null,
          phone: parsed.phone || null,
          relationship_type: parsed.relationshipType,
          contract_reference: parsed.contractReference || null,
          sponsor_category: parsed.sponsorCategory || null,
          active_from: parsed.activeFrom || null,
          active_until: parsed.activeUntil || null,
          notes: parsed.notes || null,
          active: parsed.active,
          change_reason: input.changeReason || null,
        },
      });
      if (error) throw error;
      return data as { stakeholder_id: string; version: number };
    },
    onSuccess: invalidateWorkspace,
  });

  const upsertAgreement = useIdempotentMutation<
    { agreement_id: string; version: number },
    VenueAgreementInput
  >({
    action: "upsert-agreement",
    scope: orgId,
    mutationFn: async (input, idempotencyKey) => {
      requireOnline(isOnline);
      const currentOrgId = requireOrgId(orgId);
      const parsed = venueAgreementSchema.parse(input);
      const { data, error } = await venueDb.rpc("venue_upsert_agreement", {
        _org_id: currentOrgId,
        _agreement_id: parsed.id ?? null,
        _expected_version: parsed.version ?? null,
        _idempotency_key: idempotencyKey,
        _payload: {
          stakeholder_id: parsed.stakeholderId,
          space_id: parsed.spaceId || null,
          contract_reference: parsed.contractReference,
          valid_from: parsed.validFrom,
          valid_until: parsed.validUntil,
          benefit_type: parsed.benefitType,
          unit_type: parsed.unitType,
          granted_quantity: parsed.grantedQuantity,
          value_per_excess_unit: parsed.valuePerExcessUnit,
          requires_approval: parsed.requiresApproval,
          no_show_consumes_allowance: parsed.noShowConsumesAllowance,
          allowed_event_types: parsed.allowedEventTypes,
          restrictions: parsed.restrictions,
          responsible_approver_id: parsed.responsibleApproverId || null,
          document_path: parsed.documentPath || null,
          notes: parsed.notes || null,
          status: parsed.status,
          change_reason: input.changeReason || null,
        },
      });
      if (error) throw error;
      return data as { agreement_id: string; version: number };
    },
    onSuccess: invalidateWorkspace,
  });

  const upsertSpace = useIdempotentMutation<
    { space_id: string; version: number },
    VenueSpaceInput
  >({
    action: "upsert-space",
    scope: orgId,
    mutationFn: async (input, idempotencyKey) => {
      requireOnline(isOnline);
      const currentOrgId = requireOrgId(orgId);
      const { data, error } = await venueDb.rpc("venue_upsert_space", {
        _org_id: currentOrgId,
        _space_id: input.id ?? null,
        _expected_version: input.version ?? null,
        _idempotency_key: idempotencyKey,
        _payload: {
          parent_space_id: input.parentSpaceId || null,
          slug: input.slug,
          name: input.name,
          type: input.type,
          description: input.description || null,
          capacity: input.capacity,
          location: input.location || null,
          available_areas: input.availableAreas,
          restrictions: input.restrictions,
          allowed_event_types: input.allowedEventTypes,
          standard_opening_hours: {
            timezone: "America/Sao_Paulo",
            daily_start: input.dailyStart,
            daily_end: input.dailyEnd,
          },
          required_setup_minutes: input.requiredSetupMinutes,
          required_teardown_minutes: input.requiredTeardownMinutes,
          default_responsible_team: input.defaultResponsibleTeam || null,
          available_resources: input.availableResources,
          internal_notes: input.internalNotes || null,
          active: input.active,
          change_reason: input.changeReason || null,
        },
      });
      if (error) throw error;
      return data as { space_id: string; version: number };
    },
    onSuccess: invalidateWorkspace,
  });

  const upsertBlock = useIdempotentMutation<
    { block_id: string; version: number },
    VenueBlockInput
  >({
    action: "upsert-block",
    scope: orgId,
    mutationFn: async (input, idempotencyKey) => {
      requireOnline(isOnline);
      const currentOrgId = requireOrgId(orgId);
      const { data, error } = await venueDb.rpc("venue_upsert_space_block", {
        _org_id: currentOrgId,
        _block_id: input.id ?? null,
        _expected_version: input.version ?? null,
        _idempotency_key: idempotencyKey,
        _payload: {
          space_id: input.spaceId,
          block_type: input.blockType,
          title: input.title,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          stakeholder_id: input.stakeholderId || null,
          reason: input.reason,
          active: input.active,
        },
      });
      if (error) throw error;
      return data as { block_id: string; version: number };
    },
    onSuccess: invalidateWorkspace,
  });

  type ChecklistUpdateInput = {
    item: VenueChecklistItem;
    status: VenueChecklistItem["status"];
    note?: string;
    responsibleUserId?: string;
    deadline?: string | null;
  };
  const updateChecklistItem = useIdempotentMutation<
    unknown,
    ChecklistUpdateInput
  >({
    action: "update-checklist-item",
    scope: orgId,
    mutationFn: async (input, idempotencyKey) => {
      requireOnline(isOnline);
      const currentOrgId = requireOrgId(orgId);
      const { data, error } = await venueDb.rpc("venue_update_checklist_item", {
        _org_id: currentOrgId,
        _item_id: input.item.id,
        _expected_version: input.item.version,
        _idempotency_key: idempotencyKey,
        _payload: {
          status: input.status,
          note: input.note ?? input.item.note,
          responsible_user_id:
            input.responsibleUserId ?? input.item.responsible_user_id,
          deadline:
            input.deadline === undefined ? input.item.deadline : input.deadline,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidateWorkspace,
  });

  type ResourceUpdateInput = {
    resource: VenueEventResource;
    confirmationStatus: VenueEventResource["confirmation_status"];
    completionStatus: VenueEventResource["completion_status"];
    responsibleTeam?: string;
    responsibleUserId?: string;
    notes?: string;
  };
  const updateResource = useIdempotentMutation<unknown, ResourceUpdateInput>({
    action: "update-resource",
    scope: orgId,
    mutationFn: async (input, idempotencyKey) => {
      requireOnline(isOnline);
      const currentOrgId = requireOrgId(orgId);
      const { data, error } = await venueDb.rpc("venue_update_resource", {
        _org_id: currentOrgId,
        _resource_id: input.resource.id,
        _expected_version: input.resource.version,
        _idempotency_key: idempotencyKey,
        _payload: {
          confirmation_status: input.confirmationStatus,
          completion_status: input.completionStatus,
          responsible_team:
            input.responsibleTeam ?? input.resource.responsible_team,
          responsible_user_id:
            input.responsibleUserId ?? input.resource.responsible_user_id,
          notes: input.notes ?? input.resource.notes,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidateWorkspace,
  });

  type UploadDocumentInput = {
    eventId: string;
    file: File;
    documentType: string;
    sensitive: boolean;
  };
  const uploadDocument = useIdempotentMutation<
    { document_id: string; event_id: string },
    UploadDocumentInput
  >({
    action: "upload-document",
    scope: orgId,
    mutationFn: async (input, idempotencyKey) => {
      requireOnline(isOnline);
      const currentOrgId = requireOrgId(orgId);
      const safeName =
        input.file.name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(-160) || "documento";
      const storagePath = `${currentOrgId}/${input.eventId}/${idempotencyKey}-${safeName}`;
      const uploadResult = await supabase.storage
        .from(VENUE_DOCUMENT_BUCKET)
        .upload(storagePath, input.file, {
          cacheControl: "3600",
          contentType: input.file.type,
          upsert: false,
        });
      if (
        uploadResult.error &&
        !isStorageObjectAlreadyExists(uploadResult.error)
      ) {
        throw uploadResult.error;
      }

      try {
        const { data, error } = await venueDb.rpc("venue_register_document", {
          _org_id: currentOrgId,
          _event_id: input.eventId,
          _idempotency_key: idempotencyKey,
          _payload: {
            storage_path: storagePath,
            file_name: input.file.name,
            mime_type: input.file.type,
            size_bytes: input.file.size,
            document_type: input.documentType,
            sensitive: input.sensitive,
          },
        });
        if (error) throw error;
        return data as { document_id: string; event_id: string };
      } catch (error) {
        // Registration and Storage cannot share a PostgreSQL transaction. The
        // Storage DELETE policy permits cleanup only while no durable document
        // row exists, so a response lost after registration remains safe.
        await supabase.storage
          .from(VENUE_DOCUMENT_BUCKET)
          .remove([storagePath]);
        throw error;
      }
    },
    onSuccess: invalidateWorkspace,
  });

  /*
   * All writes above receive their idempotency key before React Query invokes
   * mutationFn. The wrapper keeps that key through manual retries, replaces it
   * only when the logical payload changes, and clears it on success/reset.
   */

  /*
   * Keep the returned mutation objects intact: status, errors, failure counts,
   * submittedAt and variables remain available to the UI.
   */

  return {
    orgId,
    orgName,
    isOnline,
    isLoading: orgLoading || workspaceQuery.isLoading,
    isFetching: workspaceQuery.isFetching,
    error: workspaceQuery.error,
    errorMessage: workspaceQuery.error
      ? mapVenueError(workspaceQuery.error)
      : null,
    workspace: workspaceQuery.data ?? null,
    permissions: workspaceQuery.data?.permissions ?? EMPTY_PERMISSIONS,
    workspaceQuery,
    refetch: workspaceQuery.refetch,
    checkAvailability,
    saveEvent,
    transitionEvent,
    upsertStakeholder,
    upsertAgreement,
    upsertSpace,
    upsertBlock,
    updateChecklistItem,
    updateResource,
    uploadDocument,
  };
}

function useVenueAuditPages(eventId: string | null, enabled: boolean) {
  const { orgId } = useCurrentOrg();
  const query = useInfiniteQuery({
    queryKey: [VENUE_QUERY_KEY, orgId, "audit-history", eventId],
    queryFn: ({ pageParam }) =>
      fetchVenueAuditPage(requireOrgId(orgId), eventId, pageParam),
    initialPageParam: null as VenueAuditCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(orgId && enabled),
    staleTime: 10_000,
    meta: { persist: false },
  });
  const data = useMemo(
    () => (enabled ? flattenVenueAuditPages(query.data?.pages) : undefined),
    [enabled, query.data?.pages],
  );
  return {
    ...query,
    data,
    hasMore: enabled ? query.hasNextPage : false,
    nextCursor: (enabled && query.data?.pages.at(-1)?.nextCursor) || null,
  };
}

export function useVenueAuditHistory(enabled: boolean) {
  return useVenueAuditPages(null, enabled);
}

export function useVenueEventHistory(eventId: string | null, enabled: boolean) {
  return useVenueAuditPages(eventId, Boolean(eventId && enabled));
}

export function useVenueEventDetail(
  eventId: string | null,
  canViewAudit: boolean,
) {
  const { orgId } = useCurrentOrg();
  const auditQuery = useVenueEventHistory(eventId, canViewAudit);
  const detailQuery = useQuery({
    queryKey: [VENUE_QUERY_KEY, orgId, "event-detail", eventId],
    queryFn: async () => {
      const currentOrgId = requireOrgId(orgId);
      if (!eventId) throw new Error("VENUE_EVENT_REQUIRED");
      const db = venueDb;
      const [documentsResult, approvalsResult] = await Promise.all([
        db
          .from("venue_event_documents")
          .select("*")
          .eq("org_id", currentOrgId)
          .eq("event_id", eventId)
          .order("created_at", { ascending: false }),
        db
          .from("venue_event_approvals")
          .select("*")
          .eq("org_id", currentOrgId)
          .eq("event_id", eventId)
          .order("created_at", { ascending: false }),
      ]);
      return {
        documents: ensureResult<VenueEventDocument[]>(
          documentsResult,
          "documents",
        ),
        approvals: ensureResult<VenueApproval[]>(approvalsResult, "approvals"),
      };
    },
    enabled: Boolean(orgId && eventId),
    staleTime: 10_000,
    meta: { persist: false },
  });
  const data = useMemo(
    () =>
      detailQuery.data
        ? {
            ...detailQuery.data,
            audit: auditQuery.data ?? [],
          }
        : undefined,
    [auditQuery.data, detailQuery.data],
  );
  const refetch = useCallback(async () => {
    const [detailResult] = await Promise.all([
      detailQuery.refetch(),
      canViewAudit ? auditQuery.refetch() : Promise.resolve(),
    ]);
    return detailResult;
  }, [auditQuery, canViewAudit, detailQuery]);

  return {
    ...detailQuery,
    data,
    error: detailQuery.error ?? (canViewAudit ? auditQuery.error : null),
    isError: detailQuery.isError || (canViewAudit && auditQuery.isError),
    isFetching:
      detailQuery.isFetching || (canViewAudit && auditQuery.isFetching),
    isLoading: detailQuery.isLoading || (canViewAudit && auditQuery.isLoading),
    isPending: detailQuery.isPending || (canViewAudit && auditQuery.isPending),
    isRefetching:
      detailQuery.isRefetching || (canViewAudit && auditQuery.isRefetching),
    refetch,
    detailQuery,
    auditQuery,
  };
}

export async function createVenueDocumentUrl(document: VenueEventDocument) {
  const { data, error } = await supabase.storage
    .from(VENUE_DOCUMENT_BUCKET)
    .createSignedUrl(document.storage_path, 60);
  if (error) throw error;
  return data.signedUrl;
}
