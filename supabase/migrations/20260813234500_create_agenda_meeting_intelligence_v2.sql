-- Agenda FENASOJA - Meeting Intelligence v2
-- Additive, event-scoped and server-authoritative. Audio is never persisted.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Relational model
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agenda_meeting_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  started_by uuid NOT NULL,
  client_session_key uuid NOT NULL,
  capture_state text NOT NULL DEFAULT 'idle'
    CHECK (capture_state IN ('idle','recording','paused','stopped','interrupted','cancelled')),
  processing_state text NOT NULL DEFAULT 'accepting_segments'
    CHECK (processing_state IN (
      'accepting_segments','transcribing','awaiting_client_replay','assembling',
      'transcript_complete','analysis_queued','analyzing','review_required',
      'completed','partial_transcript','failed','cancelled'
    )),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  consent_confirmed boolean NOT NULL DEFAULT false,
  consent_policy_version text,
  consent_confirmed_at timestamptz,
  partial_analysis_confirmed boolean NOT NULL DEFAULT false,
  language text NOT NULL DEFAULT 'pt-BR' CHECK (language = 'pt-BR'),
  stt_provider text NOT NULL DEFAULT 'deepgram' CHECK (stt_provider = 'deepgram'),
  stt_model text NOT NULL DEFAULT 'nova-3' CHECK (stt_model = 'nova-3'),
  analysis_provider text NOT NULL DEFAULT 'openai' CHECK (analysis_provider = 'openai'),
  analysis_model text NOT NULL DEFAULT 'gpt-5.6-terra' CHECK (btrim(analysis_model) <> ''),
  analysis_reasoning_effort text NOT NULL DEFAULT 'medium' CHECK (analysis_reasoning_effort = 'medium'),
  event_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_context) = 'object'),
  last_received_sequence integer NOT NULL DEFAULT -1 CHECK (last_received_sequence >= -1),
  last_contiguous_sequence integer NOT NULL DEFAULT -1 CHECK (last_contiguous_sequence >= -1),
  closed_sequence integer CHECK (closed_sequence IS NULL OR closed_sequence >= -1),
  missing_sequences integer[] NOT NULL DEFAULT '{}'::integer[],
  unresolved_sequences integer[] NOT NULL DEFAULT '{}'::integer[],
  active_duration_ms bigint NOT NULL DEFAULT 0
    CHECK (active_duration_ms BETWEEN 0 AND 14400000),
  heartbeat_at timestamptz,
  started_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  finalized_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_meeting_sessions_event_org_fkey
    FOREIGN KEY (event_id, org_id)
    REFERENCES public.cronograma_eventos(id, org_id) ON DELETE CASCADE,
  CONSTRAINT agenda_meeting_sessions_id_scope_key UNIQUE (id, org_id, event_id),
  CONSTRAINT agenda_meeting_sessions_client_key UNIQUE (started_by, client_session_key),
  CONSTRAINT agenda_meeting_sessions_consent_ck CHECK (
    (consent_confirmed = false AND consent_confirmed_at IS NULL)
    OR (consent_confirmed = true AND consent_confirmed_at IS NOT NULL AND consent_policy_version IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS agenda_meeting_sessions_event_idx
  ON public.agenda_meeting_sessions (org_id, event_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS agenda_meeting_sessions_owner_idx
  ON public.agenda_meeting_sessions (started_by, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.agenda_meeting_segment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  org_id uuid NOT NULL,
  event_id uuid NOT NULL,
  segment_id uuid NOT NULL,
  attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  sequence integer NOT NULL CHECK (sequence BETWEEN 0 AND 10000),
  capture_start_ms bigint NOT NULL CHECK (capture_start_ms >= 0),
  capture_end_ms bigint NOT NULL CHECK (capture_end_ms > capture_start_ms),
  mime_type text,
  byte_size bigint CHECK (byte_size IS NULL OR byte_size > 0),
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  mutation_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted','processing','transcribed','retryable_error','terminal_error','lost')),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  retry_after_ms integer CHECK (retry_after_ms IS NULL OR retry_after_ms >= 0),
  callback_token_hash text CHECK (callback_token_hash IS NULL OR callback_token_hash ~ '^[0-9a-f]{64}$'),
  callback_token_expires_at timestamptz,
  callback_digest text CHECK (callback_digest IS NULL OR callback_digest ~ '^[0-9a-f]{64}$'),
  callback_received_at timestamptz,
  provider_request_id text,
  provider_accepted_at timestamptz,
  transcribed_at timestamptz,
  lost_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_meeting_receipts_session_scope_fkey
    FOREIGN KEY (session_id, org_id, event_id)
    REFERENCES public.agenda_meeting_sessions(id, org_id, event_id) ON DELETE CASCADE,
  CONSTRAINT agenda_meeting_receipts_sequence_key UNIQUE (session_id, sequence),
  CONSTRAINT agenda_meeting_receipts_segment_key UNIQUE (session_id, segment_id),
  CONSTRAINT agenda_meeting_receipts_mutation_key UNIQUE (session_id, mutation_id),
  CONSTRAINT agenda_meeting_receipts_attempt_key UNIQUE (attempt_id),
  CONSTRAINT agenda_meeting_receipts_metadata_ck CHECK (
    status = 'lost'
    OR (mime_type IS NOT NULL AND byte_size IS NOT NULL AND sha256 IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS agenda_meeting_receipts_callback_token_uidx
  ON public.agenda_meeting_segment_receipts (callback_token_hash)
  WHERE callback_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agenda_meeting_receipts_provider_request_uidx
  ON public.agenda_meeting_segment_receipts (provider_request_id)
  WHERE provider_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agenda_meeting_receipts_session_status_idx
  ON public.agenda_meeting_segment_receipts (session_id, status, sequence);

CREATE TABLE IF NOT EXISTS public.agenda_meeting_transcript_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  org_id uuid NOT NULL,
  event_id uuid NOT NULL,
  receipt_id uuid NOT NULL UNIQUE REFERENCES public.agenda_meeting_segment_receipts(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence BETWEEN 0 AND 10000),
  -- Empty text is a valid canonical result for a silence-only segment.
  transcript_text text NOT NULL,
  words jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(words) = 'array'),
  duration_ms bigint CHECK (duration_ms IS NULL OR duration_ms >= 0),
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  provider_request_id text NOT NULL,
  provider_model text NOT NULL DEFAULT 'nova-3',
  provider_language text NOT NULL DEFAULT 'pt-BR',
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_meeting_segments_session_scope_fkey
    FOREIGN KEY (session_id, org_id, event_id)
    REFERENCES public.agenda_meeting_sessions(id, org_id, event_id) ON DELETE CASCADE,
  CONSTRAINT agenda_meeting_segments_sequence_key UNIQUE (session_id, sequence),
  CONSTRAINT agenda_meeting_segments_client_key UNIQUE (session_id, segment_id)
);

CREATE INDEX IF NOT EXISTS agenda_meeting_segments_session_idx
  ON public.agenda_meeting_transcript_segments (session_id, sequence);

CREATE TABLE IF NOT EXISTS public.agenda_meeting_transcript_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  org_id uuid NOT NULL,
  event_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  kind text NOT NULL CHECK (kind IN ('canonical','manual_revision')),
  parent_version_id uuid REFERENCES public.agenda_meeting_transcript_versions(id) ON DELETE SET NULL,
  -- An empty canonical transcript is valid when every segment is silence.
  transcript_text text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  is_complete boolean NOT NULL DEFAULT false,
  missing_sequences integer[] NOT NULL DEFAULT '{}'::integer[],
  revision_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_meeting_transcript_versions_scope_fkey
    FOREIGN KEY (session_id, org_id, event_id)
    REFERENCES public.agenda_meeting_sessions(id, org_id, event_id) ON DELETE CASCADE,
  CONSTRAINT agenda_meeting_transcript_versions_number_key UNIQUE (session_id, version),
  CONSTRAINT agenda_meeting_transcript_versions_hash_key UNIQUE (session_id, content_hash)
);

CREATE TABLE IF NOT EXISTS public.agenda_meeting_transcript_revision_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_version_id uuid NOT NULL REFERENCES public.agenda_meeting_transcript_versions(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  org_id uuid NOT NULL,
  event_id uuid NOT NULL,
  source_segment_id uuid NOT NULL REFERENCES public.agenda_meeting_transcript_segments(id) ON DELETE RESTRICT,
  sequence integer NOT NULL CHECK (sequence BETWEEN 0 AND 10000),
  revised_text text NOT NULL,
  source_content_hash text NOT NULL CHECK (source_content_hash ~ '^[0-9a-f]{64}$'),
  revised_content_hash text NOT NULL CHECK (revised_content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_meeting_revision_segments_scope_fkey
    FOREIGN KEY (session_id, org_id, event_id)
    REFERENCES public.agenda_meeting_sessions(id, org_id, event_id) ON DELETE CASCADE,
  CONSTRAINT agenda_meeting_revision_segments_source_key UNIQUE (transcript_version_id, source_segment_id),
  CONSTRAINT agenda_meeting_revision_segments_sequence_key UNIQUE (transcript_version_id, sequence)
);

CREATE INDEX IF NOT EXISTS agenda_meeting_revision_segments_version_idx
  ON public.agenda_meeting_transcript_revision_segments (transcript_version_id, sequence);

CREATE TABLE IF NOT EXISTS public.agenda_meeting_minutes_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  org_id uuid NOT NULL,
  event_id uuid NOT NULL,
  transcript_version_id uuid NOT NULL REFERENCES public.agenda_meeting_transcript_versions(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','changes_requested','superseded')),
  title text NOT NULL CHECK (btrim(title) <> ''),
  summary text NOT NULL CHECK (btrim(summary) <> ''),
  minutes_markdown text NOT NULL CHECK (btrim(minutes_markdown) <> ''),
  transcript_coverage text NOT NULL CHECK (transcript_coverage IN ('complete','with_gaps')),
  analysis_model text NOT NULL DEFAULT 'gpt-5.6-terra',
  reasoning_effort text NOT NULL DEFAULT 'medium',
  prompt_version text NOT NULL,
  schema_version text NOT NULL,
  provider_response_id text,
  provider_usage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_usage) = 'object'),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_meeting_minutes_scope_fkey
    FOREIGN KEY (session_id, org_id, event_id)
    REFERENCES public.agenda_meeting_sessions(id, org_id, event_id) ON DELETE CASCADE,
  CONSTRAINT agenda_meeting_minutes_number_key UNIQUE (session_id, version)
);

CREATE TABLE IF NOT EXISTS public.agenda_meeting_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  org_id uuid NOT NULL,
  event_id uuid NOT NULL,
  minutes_version_id uuid NOT NULL REFERENCES public.agenda_meeting_minutes_versions(id) ON DELETE CASCADE,
  insight_type text NOT NULL CHECK (insight_type IN ('decision','pending_item','risk','important_point','next_step','next_meeting')),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text NOT NULL CHECK (btrim(description) <> ''),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  review_state text NOT NULL DEFAULT 'proposed' CHECK (review_state IN ('proposed','confirmed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_meeting_insights_scope_fkey
    FOREIGN KEY (session_id, org_id, event_id)
    REFERENCES public.agenda_meeting_sessions(id, org_id, event_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agenda_meeting_insights_minutes_idx
  ON public.agenda_meeting_insights (minutes_version_id, insight_type, position);

CREATE TABLE IF NOT EXISTS public.agenda_meeting_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  org_id uuid NOT NULL,
  event_id uuid NOT NULL,
  minutes_version_id uuid NOT NULL REFERENCES public.agenda_meeting_minutes_versions(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text NOT NULL DEFAULT '',
  responsible_text text,
  suggested_user_id uuid,
  confirmed_user_id uuid,
  due_date_text text,
  due_date date,
  due_date_confirmed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','confirmed','in_progress','completed','dismissed')),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  confirmed_by uuid,
  confirmed_at timestamptz,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_meeting_actions_scope_fkey
    FOREIGN KEY (session_id, org_id, event_id)
    REFERENCES public.agenda_meeting_sessions(id, org_id, event_id) ON DELETE CASCADE,
  CONSTRAINT agenda_meeting_actions_due_date_ck CHECK (
    due_date_confirmed = false OR due_date IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.agenda_meeting_user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  org_id uuid NOT NULL,
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  policy_version text NOT NULL CHECK (btrim(policy_version) <> ''),
  consent_version integer NOT NULL CHECK (consent_version > 0),
  decision text NOT NULL CHECK (decision IN ('consented','revoked')),
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_meeting_consents_scope_fkey
    FOREIGN KEY (session_id, org_id, event_id)
    REFERENCES public.agenda_meeting_sessions(id, org_id, event_id) ON DELETE CASCADE,
  CONSTRAINT agenda_meeting_consents_version_key UNIQUE (session_id, user_id, consent_version),
  CONSTRAINT agenda_meeting_consents_policy_key UNIQUE (session_id, user_id, policy_version, decision)
);

CREATE INDEX IF NOT EXISTS agenda_meeting_consents_session_idx
  ON public.agenda_meeting_user_consents (session_id, user_id, consent_version DESC);

CREATE INDEX IF NOT EXISTS agenda_meeting_actions_session_idx
  ON public.agenda_meeting_action_items (session_id, status, due_date);
CREATE INDEX IF NOT EXISTS agenda_meeting_actions_assignee_idx
  ON public.agenda_meeting_action_items (org_id, confirmed_user_id, status)
  WHERE confirmed_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.agenda_meeting_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  org_id uuid NOT NULL,
  event_id uuid NOT NULL,
  transcript_version_id uuid REFERENCES public.agenda_meeting_transcript_versions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('assemble_transcript','analysis_generate')),
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','in_flight','retry_wait','succeeded','dead_letter','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 6 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT agenda_meeting_jobs_scope_fkey
    FOREIGN KEY (session_id, org_id, event_id)
    REFERENCES public.agenda_meeting_sessions(id, org_id, event_id) ON DELETE CASCADE,
  CONSTRAINT agenda_meeting_jobs_dedupe_key UNIQUE (session_id, kind, dedupe_key)
);

CREATE INDEX IF NOT EXISTS agenda_meeting_jobs_claim_idx
  ON public.agenda_meeting_processing_jobs (status, available_at, created_at)
  WHERE status IN ('queued','retry_wait');
CREATE INDEX IF NOT EXISTS agenda_meeting_jobs_lease_idx
  ON public.agenda_meeting_processing_jobs (lease_expires_at)
  WHERE status = 'in_flight';

CREATE TABLE IF NOT EXISTS public.agenda_meeting_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  org_id uuid NOT NULL,
  event_id uuid NOT NULL,
  actor_user_id uuid,
  actor_kind text NOT NULL CHECK (actor_kind IN ('user','service','provider')),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  mutation_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_meeting_audit_session_scope_fkey
    FOREIGN KEY (session_id, org_id, event_id)
    REFERENCES public.agenda_meeting_sessions(id, org_id, event_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agenda_meeting_audit_session_idx
  ON public.agenda_meeting_audit_events (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agenda_meeting_mutation_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  event_id uuid NOT NULL,
  action text NOT NULL,
  mutation_id uuid NOT NULL,
  session_id uuid,
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_meeting_mutations_key UNIQUE (actor_user_id, action, mutation_id)
);

-- Administrative tombstones intentionally have no FK to events or sessions.
-- They retain identifiers, counts and hashes only; no transcript/minutes content.
CREATE TABLE IF NOT EXISTS public.agenda_meeting_administrative_tombstones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  event_id uuid NOT NULL,
  session_id uuid NOT NULL,
  deletion_scope text NOT NULL CHECK (deletion_scope IN ('session','event')),
  actor_user_id uuid,
  session_version bigint NOT NULL,
  capture_state text NOT NULL,
  processing_state text NOT NULL,
  receipt_count integer NOT NULL DEFAULT 0 CHECK (receipt_count >= 0),
  transcript_segment_count integer NOT NULL DEFAULT 0 CHECK (transcript_segment_count >= 0),
  transcript_version_count integer NOT NULL DEFAULT 0 CHECK (transcript_version_count >= 0),
  minutes_version_count integer NOT NULL DEFAULT 0 CHECK (minutes_version_count >= 0),
  event_context_hash text NOT NULL CHECK (event_context_hash ~ '^[0-9a-f]{64}$'),
  latest_transcript_hash text CHECK (latest_transcript_hash IS NULL OR latest_transcript_hash ~ '^[0-9a-f]{64}$'),
  latest_minutes_hash text CHECK (latest_minutes_hash IS NULL OR latest_minutes_hash ~ '^[0-9a-f]{64}$'),
  session_created_at timestamptz NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_meeting_tombstones_session_key UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS agenda_meeting_tombstones_org_event_idx
  ON public.agenda_meeting_administrative_tombstones (org_id, event_id, deleted_at DESC);

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agenda_meeting_event_accessible(
  p_user_id uuid,
  p_org_id uuid,
  p_event_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.cronograma_eventos event
     WHERE event.id = p_event_id
       AND event.org_id = p_org_id
       AND (auth.role() = 'service_role' OR p_user_id = auth.uid())
       AND public.is_org_member(p_user_id, p_org_id)
       AND (
         public.get_user_org_role(p_user_id, p_org_id)::text IN ('admin','gestor')
         OR public.cronograma_scoped_event_visible(p_event_id, p_user_id)
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_session_readable(
  p_user_id uuid,
  p_org_id uuid,
  p_event_id uuid,
  p_session_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.agenda_meeting_sessions meeting
     WHERE meeting.id = p_session_id
       AND meeting.org_id = p_org_id
       AND meeting.event_id = p_event_id
       AND meeting.deleted_at IS NULL
       AND (auth.role() = 'service_role' OR p_user_id = auth.uid())
       AND public.is_org_member(p_user_id, p_org_id)
       AND (
         public.get_user_org_role(p_user_id, p_org_id)::text IN ('admin','gestor')
         OR meeting.started_by = p_user_id
         OR public.cronograma_scoped_event_visible(p_event_id, p_user_id)
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_has_explicit_capability(
  p_user_id uuid,
  p_org_id uuid,
  p_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_capabilities capability
     WHERE capability.user_id = p_user_id
       AND capability.org_id = p_org_id
       AND capability.capability = p_capability
  );
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_actor_allowed(
  p_user_id uuid,
  p_action text,
  p_org_id uuid,
  p_event_id uuid,
  p_session_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_owner uuid;
  org_role_text text;
  is_member boolean;
  event_exists boolean;
  operational_profile boolean;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;
  is_member := public.is_org_member(p_user_id, p_org_id);
  IF NOT is_member THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.cronograma_eventos event
     WHERE event.id = p_event_id AND event.org_id = p_org_id
  ) INTO event_exists;
  IF NOT event_exists THEN RETURN false; END IF;

  org_role_text := public.get_user_org_role(p_user_id, p_org_id)::text;
  operational_profile := org_role_text IN ('admin','gestor','operador')
    OR public.agenda_meeting_has_explicit_capability(p_user_id, p_org_id, 'cronograma_eventos_write');

  -- Listing is additionally filtered row-by-row with session_readable.
  IF p_action = 'list' THEN RETURN true; END IF;
  IF p_action IN ('detail','get_segment_receipt') THEN
    RETURN p_session_id IS NOT NULL
      AND public.agenda_meeting_session_readable(p_user_id,p_org_id,p_event_id,p_session_id);
  END IF;
  IF p_action = 'start' THEN
    RETURN operational_profile
      AND public.agenda_meeting_event_accessible(p_user_id,p_org_id,p_event_id);
  END IF;

  IF p_session_id IS NULL THEN RETURN false; END IF;
  SELECT started_by INTO session_owner
    FROM public.agenda_meeting_sessions
   WHERE id = p_session_id AND org_id = p_org_id AND event_id = p_event_id AND deleted_at IS NULL;
  IF session_owner IS NULL THEN RETURN false; END IF;

  IF p_action IN ('heartbeat','pause','resume','finalize','cancel','mark_lost','transcribe_segment') THEN
    RETURN operational_profile
      AND (
        session_owner = p_user_id
        OR public.agenda_meeting_event_accessible(p_user_id,p_org_id,p_event_id)
      );
  END IF;
  IF p_action IN ('create_revision','review_minutes','update_action','retry_analysis') THEN
    RETURN operational_profile
      AND (
        session_owner = p_user_id
        OR public.agenda_meeting_event_accessible(p_user_id,p_org_id,p_event_id)
      );
  END IF;
  IF p_action = 'delete' THEN
    RETURN org_role_text IN ('admin','gestor')
      OR (
        session_owner = p_user_id
        AND public.agenda_meeting_has_explicit_capability(
          p_user_id,p_org_id,'meeting_intelligence_delete'
        )
      );
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_authorize(
  p_action text,
  p_org_id uuid,
  p_event_id uuid,
  p_session_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.agenda_meeting_actor_allowed(auth.uid(), p_action, p_org_id, p_event_id, p_session_id);
$$;

REVOKE ALL ON FUNCTION public.agenda_meeting_event_accessible(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_session_readable(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_has_explicit_capability(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_actor_allowed(uuid,text,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_authorize(text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_authorize(text,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_event_accessible(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_session_readable(uuid,uuid,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_actor_allowed(uuid,text,uuid,uuid,uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS: readable only in the effective Agenda event scope; all writes are RPC.
-- ---------------------------------------------------------------------------

ALTER TABLE public.agenda_meeting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_segment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_transcript_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_transcript_revision_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_minutes_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_mutation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_administrative_tombstones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_meeting_sessions_select ON public.agenda_meeting_sessions;
CREATE POLICY agenda_meeting_sessions_select ON public.agenda_meeting_sessions
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, id));

DROP POLICY IF EXISTS agenda_meeting_receipts_select ON public.agenda_meeting_segment_receipts;
CREATE POLICY agenda_meeting_receipts_select ON public.agenda_meeting_segment_receipts
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_segments_select ON public.agenda_meeting_transcript_segments;
CREATE POLICY agenda_meeting_segments_select ON public.agenda_meeting_transcript_segments
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_transcript_versions_select ON public.agenda_meeting_transcript_versions;
CREATE POLICY agenda_meeting_transcript_versions_select ON public.agenda_meeting_transcript_versions
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_revision_segments_select ON public.agenda_meeting_transcript_revision_segments;
CREATE POLICY agenda_meeting_revision_segments_select ON public.agenda_meeting_transcript_revision_segments
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_minutes_select ON public.agenda_meeting_minutes_versions;
CREATE POLICY agenda_meeting_minutes_select ON public.agenda_meeting_minutes_versions
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_insights_select ON public.agenda_meeting_insights;
CREATE POLICY agenda_meeting_insights_select ON public.agenda_meeting_insights
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_actions_select ON public.agenda_meeting_action_items;
CREATE POLICY agenda_meeting_actions_select ON public.agenda_meeting_action_items
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_consents_select ON public.agenda_meeting_user_consents;
CREATE POLICY agenda_meeting_consents_select ON public.agenda_meeting_user_consents
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_audit_select ON public.agenda_meeting_audit_events;
CREATE POLICY agenda_meeting_audit_select ON public.agenda_meeting_audit_events
FOR SELECT TO authenticated
USING (
  public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id)
  OR (
    public.is_org_member(auth.uid(), org_id)
    AND public.get_user_org_role(auth.uid(), org_id)::text IN ('admin','gestor')
  )
);

DROP POLICY IF EXISTS agenda_meeting_tombstones_select ON public.agenda_meeting_administrative_tombstones;
CREATE POLICY agenda_meeting_tombstones_select ON public.agenda_meeting_administrative_tombstones
FOR SELECT TO authenticated
USING (
  public.is_org_member(auth.uid(), org_id)
  AND public.get_user_org_role(auth.uid(), org_id)::text IN ('admin','gestor')
);

GRANT SELECT ON public.agenda_meeting_sessions,
  public.agenda_meeting_segment_receipts,
  public.agenda_meeting_transcript_segments,
  public.agenda_meeting_transcript_versions,
  public.agenda_meeting_transcript_revision_segments,
  public.agenda_meeting_minutes_versions,
  public.agenda_meeting_insights,
  public.agenda_meeting_action_items,
  public.agenda_meeting_user_consents,
  public.agenda_meeting_audit_events,
  public.agenda_meeting_administrative_tombstones TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.agenda_meeting_sessions,
  public.agenda_meeting_segment_receipts,
  public.agenda_meeting_transcript_segments,
  public.agenda_meeting_transcript_versions,
  public.agenda_meeting_transcript_revision_segments,
  public.agenda_meeting_minutes_versions,
  public.agenda_meeting_insights,
  public.agenda_meeting_action_items,
  public.agenda_meeting_user_consents,
  public.agenda_meeting_processing_jobs,
  public.agenda_meeting_audit_events,
  public.agenda_meeting_mutation_receipts,
  public.agenda_meeting_administrative_tombstones FROM authenticated;

GRANT ALL ON public.agenda_meeting_sessions,
  public.agenda_meeting_segment_receipts,
  public.agenda_meeting_transcript_segments,
  public.agenda_meeting_transcript_versions,
  public.agenda_meeting_transcript_revision_segments,
  public.agenda_meeting_minutes_versions,
  public.agenda_meeting_insights,
  public.agenda_meeting_action_items,
  public.agenda_meeting_user_consents,
  public.agenda_meeting_processing_jobs,
  public.agenda_meeting_audit_events,
  public.agenda_meeting_mutation_receipts,
  public.agenda_meeting_administrative_tombstones TO service_role;

-- Realtime intentionally exposes only lifecycle state and metadata receipts.
-- Transcript/minutes/insight/action tables are never added to the publication.
DO $realtime$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_meeting_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_meeting_segment_receipts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END
$realtime$;

-- The audit trail and administrative tombstones are physically append-only.
CREATE OR REPLACE FUNCTION public.agenda_meeting_reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cascades from a meeting/session delete are the only valid way to remove
  -- audit rows. Direct UPDATE/DELETE remains physically rejected.
  IF TG_TABLE_NAME = 'agenda_meeting_audit_events'
     AND TG_OP = 'DELETE'
     AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AGENDA_MEETING_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS agenda_meeting_audit_append_only
  ON public.agenda_meeting_audit_events;
CREATE TRIGGER agenda_meeting_audit_append_only
BEFORE UPDATE OR DELETE ON public.agenda_meeting_audit_events
FOR EACH ROW EXECUTE FUNCTION public.agenda_meeting_reject_append_only_mutation();

DROP TRIGGER IF EXISTS agenda_meeting_tombstones_append_only
  ON public.agenda_meeting_administrative_tombstones;
CREATE TRIGGER agenda_meeting_tombstones_append_only
BEFORE UPDATE OR DELETE ON public.agenda_meeting_administrative_tombstones
FOR EACH ROW EXECUTE FUNCTION public.agenda_meeting_reject_append_only_mutation();

CREATE OR REPLACE FUNCTION public.agenda_meeting_validate_action_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.suggested_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members member
     WHERE member.org_id = NEW.org_id
       AND member.user_id = NEW.suggested_user_id
       AND member.is_active = true
  ) THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_SUGGESTED_ASSIGNEE';
  END IF;
  IF NEW.confirmed_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members member
     WHERE member.org_id = NEW.org_id
       AND member.user_id = NEW.confirmed_user_id
       AND member.is_active = true
  ) THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_ASSIGNEE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agenda_meeting_actions_validate_membership
  ON public.agenda_meeting_action_items;
CREATE TRIGGER agenda_meeting_actions_validate_membership
BEFORE INSERT OR UPDATE OF org_id, suggested_user_id, confirmed_user_id
ON public.agenda_meeting_action_items
FOR EACH ROW EXECUTE FUNCTION public.agenda_meeting_validate_action_membership();

CREATE OR REPLACE FUNCTION public.agenda_meeting_validate_consent_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members member
     WHERE member.org_id = NEW.org_id
       AND member.user_id = NEW.user_id
       AND member.is_active = true
  ) OR NOT EXISTS (
    SELECT 1 FROM public.org_members member
     WHERE member.org_id = NEW.org_id
       AND member.user_id = NEW.recorded_by
       AND member.is_active = true
  ) THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_CONSENT_ACTOR';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agenda_meeting_consents_validate_membership
  ON public.agenda_meeting_user_consents;
CREATE TRIGGER agenda_meeting_consents_validate_membership
BEFORE INSERT OR UPDATE OF org_id, user_id, recorded_by
ON public.agenda_meeting_user_consents
FOR EACH ROW EXECUTE FUNCTION public.agenda_meeting_validate_consent_membership();

CREATE OR REPLACE FUNCTION public.agenda_meeting_capture_tombstone(
  p_session_id uuid,
  p_deletion_scope text,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
  latest_transcript_hash text;
  latest_minutes_hash text;
BEGIN
  IF p_deletion_scope NOT IN ('session','event') THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_DELETION_SCOPE';
  END IF;
  SELECT * INTO meeting
    FROM public.agenda_meeting_sessions
   WHERE id = p_session_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT transcript.content_hash INTO latest_transcript_hash
    FROM public.agenda_meeting_transcript_versions transcript
   WHERE transcript.session_id = meeting.id
   ORDER BY transcript.version DESC
   LIMIT 1;
  SELECT encode(extensions.digest(convert_to(
           jsonb_build_array(minutes.title,minutes.summary,minutes.minutes_markdown)::text,
           'UTF8'
         ),'sha256'),'hex')
    INTO latest_minutes_hash
    FROM public.agenda_meeting_minutes_versions minutes
   WHERE minutes.session_id = meeting.id
   ORDER BY minutes.version DESC
   LIMIT 1;

  INSERT INTO public.agenda_meeting_administrative_tombstones (
    org_id,event_id,session_id,deletion_scope,actor_user_id,session_version,
    capture_state,processing_state,receipt_count,transcript_segment_count,
    transcript_version_count,minutes_version_count,event_context_hash,
    latest_transcript_hash,latest_minutes_hash,session_created_at
  ) VALUES (
    meeting.org_id,meeting.event_id,meeting.id,p_deletion_scope,
    COALESCE(p_actor_user_id,auth.uid()),meeting.version,
    meeting.capture_state,meeting.processing_state,
    (SELECT count(*)::integer FROM public.agenda_meeting_segment_receipts receipt WHERE receipt.session_id=meeting.id),
    (SELECT count(*)::integer FROM public.agenda_meeting_transcript_segments segment WHERE segment.session_id=meeting.id),
    (SELECT count(*)::integer FROM public.agenda_meeting_transcript_versions transcript WHERE transcript.session_id=meeting.id),
    (SELECT count(*)::integer FROM public.agenda_meeting_minutes_versions minutes WHERE minutes.session_id=meeting.id),
    encode(extensions.digest(convert_to(meeting.event_context::text,'UTF8'),'sha256'),'hex'),
    latest_transcript_hash,latest_minutes_hash,meeting.created_at
  )
  ON CONFLICT (session_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_session_delete_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.agenda_meeting_capture_tombstone(OLD.id,'session',auth.uid());
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS agenda_meeting_sessions_before_delete
  ON public.agenda_meeting_sessions;
CREATE TRIGGER agenda_meeting_sessions_before_delete
BEFORE DELETE ON public.agenda_meeting_sessions
FOR EACH ROW EXECUTE FUNCTION public.agenda_meeting_session_delete_tombstone();

CREATE OR REPLACE FUNCTION public.agenda_meeting_event_delete_tombstones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE session_row record;
BEGIN
  FOR session_row IN
    SELECT meeting.id
      FROM public.agenda_meeting_sessions meeting
     WHERE meeting.event_id=OLD.id AND meeting.org_id=OLD.org_id
  LOOP
    PERFORM public.agenda_meeting_capture_tombstone(session_row.id,'event',auth.uid());
  END LOOP;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS agenda_meeting_event_before_delete
  ON public.cronograma_eventos;
CREATE TRIGGER agenda_meeting_event_before_delete
BEFORE DELETE ON public.cronograma_eventos
FOR EACH ROW EXECUTE FUNCTION public.agenda_meeting_event_delete_tombstones();

REVOKE ALL ON FUNCTION public.agenda_meeting_reject_append_only_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_validate_action_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_validate_consent_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_capture_tombstone(uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_session_delete_tombstone() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_event_delete_tombstones() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_capture_tombstone(uuid,text,uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Internal audit, aggregation and queue helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agenda_meeting_write_audit(
  p_session_id uuid,
  p_actor_user_id uuid,
  p_actor_kind text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_mutation_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
BEGIN
  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
  INSERT INTO public.agenda_meeting_audit_events (
    session_id, org_id, event_id, actor_user_id, actor_kind, action,
    entity_type, entity_id, mutation_id, metadata
  ) VALUES (
    meeting.id, meeting.org_id, meeting.event_id, p_actor_user_id, p_actor_kind,
    p_action, p_entity_type, p_entity_id, p_mutation_id, COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_enqueue_job(
  p_session_id uuid,
  p_kind text,
  p_dedupe_key text,
  p_transcript_version_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
  job_id uuid;
BEGIN
  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
  INSERT INTO public.agenda_meeting_processing_jobs (
    session_id, org_id, event_id, transcript_version_id, kind, dedupe_key
  ) VALUES (
    meeting.id, meeting.org_id, meeting.event_id, p_transcript_version_id, p_kind, p_dedupe_key
  )
  ON CONFLICT (session_id, kind, dedupe_key) DO UPDATE
    SET updated_at = public.agenda_meeting_processing_jobs.updated_at
  RETURNING id INTO job_id;
  RETURN job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_refresh_sequence_state(p_session_id uuid)
RETURNS public.agenda_meeting_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
  max_sequence integer;
  first_gap integer;
  known_gaps integer[];
  unresolved integer[];
BEGIN
  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;

  SELECT COALESCE(max(sequence), -1) INTO max_sequence
    FROM public.agenda_meeting_segment_receipts WHERE session_id = p_session_id;

  SELECT min(candidate.sequence) INTO first_gap
    FROM generate_series(0, GREATEST(max_sequence, 0)) AS candidate(sequence)
    LEFT JOIN public.agenda_meeting_segment_receipts receipt
      ON receipt.session_id = p_session_id
     AND receipt.sequence = candidate.sequence
     AND receipt.status IN ('transcribed','lost')
   WHERE receipt.id IS NULL;

  IF meeting.closed_sequence IS NULL OR meeting.closed_sequence < 0 THEN
    known_gaps := '{}'::integer[];
    unresolved := '{}'::integer[];
  ELSE
    SELECT COALESCE(array_agg(candidate.sequence ORDER BY candidate.sequence), '{}'::integer[])
      INTO unresolved
      FROM generate_series(0, meeting.closed_sequence) AS candidate(sequence)
      LEFT JOIN public.agenda_meeting_segment_receipts receipt
        ON receipt.session_id = p_session_id
       AND receipt.sequence = candidate.sequence
       AND receipt.status IN ('transcribed','lost')
     WHERE receipt.id IS NULL;

    SELECT COALESCE(array_agg(receipt.sequence ORDER BY receipt.sequence), '{}'::integer[])
      INTO known_gaps
      FROM public.agenda_meeting_segment_receipts receipt
     WHERE receipt.session_id = p_session_id
       AND receipt.sequence BETWEEN 0 AND meeting.closed_sequence
       AND receipt.status = 'lost';
  END IF;

  UPDATE public.agenda_meeting_sessions
     SET last_received_sequence = max_sequence,
         last_contiguous_sequence = CASE
           WHEN max_sequence < 0 THEN -1
           WHEN first_gap IS NULL THEN max_sequence
           ELSE first_gap - 1
         END,
         missing_sequences = known_gaps,
         unresolved_sequences = unresolved,
         processing_state = CASE
           WHEN closed_sequence IS NOT NULL AND cardinality(unresolved) > 0 THEN 'awaiting_client_replay'
           WHEN closed_sequence IS NOT NULL AND cardinality(known_gaps) > 0
             AND processing_state IN ('awaiting_client_replay','transcribing','accepting_segments')
             THEN 'partial_transcript'
           ELSE processing_state
         END,
         updated_at = now()
   WHERE id = p_session_id
   RETURNING * INTO meeting;
  RETURN meeting;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_session_summary_json(p_session_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',meeting.id,
    'orgId',meeting.org_id,
    'eventId',meeting.event_id,
    'state',CASE
      WHEN meeting.deleted_at IS NOT NULL THEN 'deleted'
      WHEN meeting.processing_state='failed' THEN 'failed'
      WHEN meeting.processing_state='cancelled' OR meeting.capture_state='cancelled' THEN 'cancelled'
      WHEN meeting.processing_state='completed' THEN 'completed'
      WHEN meeting.processing_state='review_required' THEN 'review_required'
      WHEN meeting.processing_state='analyzing' THEN 'analyzing'
      WHEN meeting.processing_state='analysis_queued' THEN 'analysis_queued'
      WHEN meeting.processing_state='partial_transcript' THEN 'transcript_ready_with_gaps'
      WHEN meeting.processing_state='transcript_complete' THEN 'transcript_ready'
      WHEN meeting.capture_state='stopped' THEN 'finalizing_transcript'
      WHEN meeting.capture_state='interrupted' THEN 'capture_interrupted'
      WHEN meeting.capture_state='paused' THEN 'paused'
      WHEN meeting.capture_state='recording' THEN 'recording'
      ELSE 'created'
    END,
    'captureState',CASE meeting.capture_state
      WHEN 'recording' THEN 'recording'
      WHEN 'paused' THEN 'paused'
      WHEN 'interrupted' THEN 'interrupted'
      WHEN 'idle' THEN 'idle'
      ELSE 'ended'
    END,
    'processingState',CASE meeting.processing_state
      WHEN 'assembling' THEN 'finalizing_transcript'
      WHEN 'awaiting_client_replay' THEN 'finalizing_transcript'
      WHEN 'transcript_complete' THEN 'transcript_ready'
      WHEN 'partial_transcript' THEN 'transcript_ready_with_gaps'
      WHEN 'analysis_queued' THEN 'analysis_queued'
      WHEN 'analyzing' THEN 'analyzing'
      WHEN 'review_required' THEN 'review_required'
      WHEN 'completed' THEN 'completed'
      WHEN 'failed' THEN 'failed'
      ELSE 'idle'
    END,
    'createdBy',meeting.started_by,
    'createdAt',meeting.created_at,
    'startedAt',meeting.started_at,
    'endedAt',meeting.ended_at,
    'activeDurationMs',meeting.active_duration_ms,
    'transcriptCoverage',CASE
      WHEN latest.id IS NULL THEN 'pending'
      WHEN cardinality(latest.missing_sequences)>0 THEN 'with_gaps'
      ELSE 'complete'
    END,
    'transcriptSegmentCount',(
      SELECT count(*) FROM public.agenda_meeting_transcript_segments segment
       WHERE segment.session_id=meeting.id
    ),
    'actionItemCount',(
      SELECT count(*) FROM public.agenda_meeting_action_items action_item
       WHERE action_item.session_id=meeting.id
    ),
    'pendingActionItemCount',(
      SELECT count(*) FROM public.agenda_meeting_action_items action_item
       WHERE action_item.session_id=meeting.id
         AND action_item.status NOT IN ('completed','dismissed')
    ),
    'version',meeting.version
  )
  FROM public.agenda_meeting_sessions meeting
  LEFT JOIN LATERAL (
    SELECT transcript.id,transcript.kind,transcript.missing_sequences
      FROM public.agenda_meeting_transcript_versions transcript
     WHERE transcript.session_id=meeting.id
     ORDER BY transcript.version DESC LIMIT 1
  ) latest ON true
  WHERE meeting.id=p_session_id;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_detail_json(p_session_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'session',public.agenda_meeting_session_summary_json(meeting.id) || jsonb_build_object(
      'eventSnapshot',jsonb_build_object(
        'title',COALESCE(meeting.event_context->>'title',''),
        'description',meeting.event_context->>'description',
        'startsAt',COALESCE(meeting.event_context->>'startsAt',meeting.event_context->>'startDate'),
        'endsAt',COALESCE(meeting.event_context->>'endsAt',meeting.event_context->>'endDate'),
        'location',meeting.event_context->>'location',
        'responsibleNames',COALESCE((
          SELECT jsonb_agg(item->>'name')
            FROM jsonb_array_elements(COALESCE(meeting.event_context->'responsibles','[]'::jsonb)) item
           WHERE NULLIF(btrim(item->>'name'),'') IS NOT NULL
        ),'[]'::jsonb),
        'commissionNames',COALESCE((
          SELECT jsonb_agg(item->>'name')
            FROM jsonb_array_elements(COALESCE(meeting.event_context->'commissions','[]'::jsonb)) item
           WHERE NULLIF(btrim(item->>'name'),'') IS NOT NULL
        ),'[]'::jsonb)
      ),
      'failedStage',COALESCE((
        SELECT job.kind
          FROM public.agenda_meeting_processing_jobs job
         WHERE job.session_id=meeting.id AND job.last_error_code IS NOT NULL
         ORDER BY job.updated_at DESC LIMIT 1
      ),CASE WHEN meeting.last_error_code IS NOT NULL THEN 'transcription' ELSE NULL END),
      'errorCode',meeting.last_error_code,
      'retryable',EXISTS (
        SELECT 1 FROM public.agenda_meeting_processing_jobs job
         WHERE job.session_id=meeting.id AND job.status='retry_wait'
        UNION ALL
        SELECT 1 FROM public.agenda_meeting_segment_receipts receipt
         WHERE receipt.session_id=meeting.id AND receipt.status='retryable_error'
      )
    ),
    'receipts',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'segmentId',receipt.segment_id,
        'sequence',receipt.sequence,
        'status',CASE WHEN receipt.status='lost' THEN 'terminal_error' ELSE receipt.status END,
        'canonicalReceiptId',CASE WHEN receipt.status='transcribed' THEN receipt.id ELSE NULL END,
        'retryAfterMs',receipt.retry_after_ms,
        'errorCode',receipt.error_code
      ) ORDER BY receipt.sequence)
      FROM public.agenda_meeting_segment_receipts receipt
      WHERE receipt.session_id=meeting.id
    ),'[]'::jsonb),
    'transcriptVersions',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',transcript.id,
        'version',transcript.version,
        'kind',CASE WHEN transcript.kind='manual_revision' THEN 'normalized_manual' ELSE 'canonical' END,
        'coverage',CASE WHEN cardinality(transcript.missing_sequences)>0 THEN 'with_gaps'
                        ELSE 'complete' END,
        'language',meeting.language,
        'sha256',transcript.content_hash,
        'createdAt',transcript.created_at,
        'createdBy',transcript.created_by
      ) ORDER BY transcript.version ASC)
      FROM public.agenda_meeting_transcript_versions transcript
      WHERE transcript.session_id=meeting.id
    ),'[]'::jsonb),
    'transcriptSegments',COALESCE((
      SELECT jsonb_agg(segment_view.payload ORDER BY segment_view.version_number,segment_view.sequence,segment_view.sort_order)
      FROM (
        SELECT transcript.version AS version_number,source.sequence,0 AS sort_order,
          jsonb_build_object(
            'id',source.id,
            'transcriptVersionId',transcript.id,
            'sequence',source.sequence,
            'kind','speech',
            'captureStartMs',receipt.capture_start_ms,
            'captureEndMs',receipt.capture_end_ms,
            'text',source.transcript_text,
            'confidence',source.confidence,
            'speakerLabel',NULL,
            -- Revisions reference the immutable canonical transcript row, not
            -- the browser-generated upload identifier.
            'sourceSegmentId',source.id
          ) AS payload
        FROM public.agenda_meeting_transcript_versions transcript
        JOIN public.agenda_meeting_transcript_segments source ON source.session_id=transcript.session_id
        JOIN public.agenda_meeting_segment_receipts receipt ON receipt.id=source.receipt_id
        WHERE transcript.session_id=meeting.id AND transcript.kind='canonical'
        UNION ALL
        SELECT transcript.version,gap.sequence,1,
          jsonb_build_object(
            'id',transcript.id::text || ':gap:' || gap.sequence::text,
            'transcriptVersionId',transcript.id,
            'sequence',gap.sequence,
            'kind','gap',
            'captureStartMs',COALESCE(receipt.capture_start_ms,0),
            'captureEndMs',COALESCE(receipt.capture_end_ms,0),
            'text','',
            'confidence',NULL,
            'speakerLabel',NULL,
            'sourceSegmentId',NULL
          )
        FROM public.agenda_meeting_transcript_versions transcript
        JOIN LATERAL unnest(transcript.missing_sequences) gap(sequence) ON true
        LEFT JOIN public.agenda_meeting_segment_receipts receipt
          ON receipt.session_id=transcript.session_id AND receipt.sequence=gap.sequence
        WHERE transcript.session_id=meeting.id
        UNION ALL
        SELECT transcript.version,revision.sequence,0,
          jsonb_build_object(
            'id',revision.id,
            'transcriptVersionId',transcript.id,
            'sequence',revision.sequence,
            'kind','manual',
            'captureStartMs',receipt.capture_start_ms,
            'captureEndMs',receipt.capture_end_ms,
            'text',revision.revised_text,
            'confidence',source.confidence,
            'speakerLabel',NULL,
            'sourceSegmentId',revision.source_segment_id
          )
        FROM public.agenda_meeting_transcript_versions transcript
        JOIN public.agenda_meeting_transcript_revision_segments revision
          ON revision.transcript_version_id=transcript.id
        JOIN public.agenda_meeting_transcript_segments source ON source.id=revision.source_segment_id
        JOIN public.agenda_meeting_segment_receipts receipt ON receipt.id=source.receipt_id
        WHERE transcript.session_id=meeting.id AND transcript.kind='manual_revision'
      ) segment_view
    ),'[]'::jsonb),
    'minutesVersions',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',minutes.id,
        'version',minutes.version,
        'state',CASE WHEN minutes.status='reviewed' THEN 'reviewed'
                     WHEN minutes.status='superseded' THEN 'superseded'
                     ELSE 'ai_draft' END,
        'title',minutes.title,
        'executiveSummary',minutes.summary,
        'minutesMarkdown',minutes.minutes_markdown,
        'sourceTranscriptVersionId',minutes.transcript_version_id,
        'coverage',minutes.transcript_coverage,
        'model',minutes.analysis_model,
        'promptVersion',minutes.prompt_version,
        'schemaVersion',minutes.schema_version,
        'createdAt',minutes.created_at,
        'reviewedAt',minutes.reviewed_at,
        'reviewedBy',minutes.reviewed_by
      ) ORDER BY minutes.version ASC)
      FROM public.agenda_meeting_minutes_versions minutes
      WHERE minutes.session_id=meeting.id
    ),'[]'::jsonb),
    'insights',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',insight.id,
        'kind',CASE insight.insight_type
          WHEN 'pending_item' THEN 'pending'
          WHEN 'important_point' THEN 'important'
          ELSE insight.insight_type END,
        'title',insight.title,
        'detail',insight.description,
        'evidence',insight.evidence
      ) ORDER BY insight.created_at DESC,insight.position)
      FROM public.agenda_meeting_insights insight
      WHERE insight.session_id=meeting.id
    ),'[]'::jsonb),
    'actions',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',action_item.id,
        'title',action_item.title,
        'description',NULLIF(action_item.description,''),
        'status',action_item.status,
        'responsibleText',action_item.responsible_text,
        'suggestedMemberId',action_item.suggested_user_id,
        'confirmedMemberId',action_item.confirmed_user_id,
        'responsibleResolution',CASE
          WHEN action_item.confirmed_user_id IS NOT NULL THEN 'confirmed'
          WHEN action_item.suggested_user_id IS NOT NULL THEN 'suggested'
          ELSE 'unresolved' END,
        'dueDateText',action_item.due_date_text,
        'dueDate',action_item.due_date,
        'dueDateConfirmed',action_item.due_date_confirmed,
        'evidence',action_item.evidence
      ) ORDER BY action_item.created_at DESC,action_item.position)
      FROM public.agenda_meeting_action_items action_item
      WHERE action_item.session_id=meeting.id
    ),'[]'::jsonb)
  )
  FROM public.agenda_meeting_sessions meeting
  WHERE meeting.id=p_session_id;
$$;

REVOKE ALL ON FUNCTION public.agenda_meeting_write_audit(uuid,uuid,text,text,text,uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_enqueue_job(uuid,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_refresh_sequence_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_detail_json(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_write_audit(uuid,uuid,text,text,text,uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_enqueue_job(uuid,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_refresh_sequence_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_detail_json(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Coherent control-plane RPC. Called only after JWT-scoped authorization.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agenda_meeting_control(
  p_action text,
  p_actor_user_id uuid,
  p_org_id uuid,
  p_event_id uuid,
  p_session_id uuid DEFAULT NULL,
  p_mutation_id uuid DEFAULT NULL,
  p_expected_version bigint DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
  existing_response jsonb;
  existing_session_id uuid;
  existing_org_id uuid;
  existing_event_id uuid;
  receipt_response jsonb;
  result jsonb;
  event_context_value jsonb;
  target_sequence integer;
  target_segment_id uuid;
  target_minutes_id uuid;
  target_action_id uuid;
  target_transcript public.agenda_meeting_transcript_versions%ROWTYPE;
  new_transcript_id uuid;
  transcript_content text;
  transcript_hash text;
  next_version integer;
  decision text;
  assignee uuid;
  deletion_session_id uuid;
  gap_error_code text;
BEGIN
  IF p_action NOT IN (
    'start','list','detail','heartbeat','pause','resume','finalize','cancel','mark_lost',
    'get_segment_receipt','create_revision','review_minutes','update_action',
    'retry_analysis','delete'
  ) THEN RAISE EXCEPTION 'AGENDA_MEETING_INVALID_ACTION'; END IF;

  IF p_actor_user_id IS NULL OR p_org_id IS NULL OR p_event_id IS NULL THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_REQUEST';
  END IF;

  IF p_action = 'list' THEN
    IF NOT public.agenda_meeting_actor_allowed(p_actor_user_id, p_action, p_org_id, p_event_id, NULL) THEN
      RAISE EXCEPTION 'AGENDA_MEETING_FORBIDDEN';
    END IF;
    RETURN jsonb_build_object('sessions', COALESCE((
      SELECT jsonb_agg(public.agenda_meeting_session_summary_json(listed.id) ORDER BY listed.created_at DESC)
      FROM public.agenda_meeting_sessions listed
      WHERE listed.org_id = p_org_id AND listed.event_id = p_event_id AND listed.deleted_at IS NULL
        AND public.agenda_meeting_session_readable(
          p_actor_user_id,listed.org_id,listed.event_id,listed.id
        )
    ), '[]'::jsonb));
  END IF;

  IF p_action IN ('detail','get_segment_receipt') THEN
    IF p_session_id IS NULL OR NOT public.agenda_meeting_actor_allowed(
      p_actor_user_id, p_action, p_org_id, p_event_id, p_session_id
    ) THEN RAISE EXCEPTION 'AGENDA_MEETING_FORBIDDEN'; END IF;
    IF p_action = 'detail' THEN
      result := public.agenda_meeting_detail_json(p_session_id);
      IF result IS NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
      RETURN result;
    END IF;
    RETURN jsonb_build_object('receipt', (
      SELECT jsonb_build_object(
        'id', receipt.id,
        'canonicalReceiptId', CASE WHEN receipt.status='transcribed' THEN receipt.id ELSE NULL END,
        'segmentId', receipt.segment_id,
        'attemptId', receipt.attempt_id,
        'sequence', receipt.sequence,
        'status', receipt.status,
        'retryAfterMs', receipt.retry_after_ms,
        'errorCode', receipt.error_code,
        'transcribedAt', receipt.transcribed_at,
        'updatedAt', receipt.updated_at
      )
      FROM public.agenda_meeting_segment_receipts receipt
      WHERE receipt.session_id = p_session_id
        AND (
          (p_payload ? 'segmentId' AND receipt.segment_id = (p_payload->>'segmentId')::uuid)
          OR (p_payload ? 'sequence' AND receipt.sequence = (p_payload->>'sequence')::integer)
        )
      LIMIT 1
    ));
  END IF;

  IF p_mutation_id IS NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_MUTATION_ID_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_actor_user_id::text || ':' || p_action || ':' || p_mutation_id::text, 0
  ));

  SELECT mutation.response,mutation.session_id,mutation.org_id,mutation.event_id
    INTO existing_response,existing_session_id,existing_org_id,existing_event_id
    FROM public.agenda_meeting_mutation_receipts mutation
   WHERE mutation.actor_user_id = p_actor_user_id
     AND mutation.action = p_action
     AND mutation.mutation_id = p_mutation_id;
  IF existing_response IS NOT NULL THEN
    IF existing_org_id <> p_org_id OR existing_event_id <> p_event_id
       OR (p_session_id IS NOT NULL AND existing_session_id IS DISTINCT FROM p_session_id) THEN
      RAISE EXCEPTION 'AGENDA_MEETING_IDEMPOTENCY_CONFLICT';
    END IF;
    IF p_action = 'delete' THEN RETURN existing_response; END IF;
    result := public.agenda_meeting_detail_json(existing_session_id);
    IF result IS NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_IDEMPOTENCY_TARGET_NOT_FOUND'; END IF;
    RETURN result;
  END IF;

  IF p_action = 'start' THEN
    IF NOT public.agenda_meeting_actor_allowed(p_actor_user_id, p_action, p_org_id, p_event_id, NULL) THEN
      RAISE EXCEPTION 'AGENDA_MEETING_FORBIDDEN';
    END IF;
    IF COALESCE((p_payload->>'consentConfirmed')::boolean, false) IS NOT TRUE
       OR COALESCE((p_payload->>'participantsInformed')::boolean, false) IS NOT TRUE
       OR NULLIF(btrim(p_payload->>'consentPolicyVersion'), '') IS NULL THEN
      RAISE EXCEPTION 'AGENDA_MEETING_CONSENT_REQUIRED';
    END IF;

    SELECT jsonb_build_object(
      'title', event.title,
      'description', event.description,
      'startDate', event.start_date,
      'endDate', event.end_date,
      'startTime', event.start_time,
      'endTime', event.end_time,
      'startsAt', CASE
        WHEN event.start_date IS NULL THEN NULL
        WHEN event.start_time IS NULL THEN event.start_date::text
        ELSE (event.start_date + event.start_time)::text
      END,
      'endsAt', CASE
        WHEN COALESCE(event.end_date,event.start_date) IS NULL THEN NULL
        WHEN event.end_time IS NULL THEN COALESCE(event.end_date,event.start_date)::text
        ELSE (COALESCE(event.end_date,event.start_date) + event.end_time)::text
      END,
      'location', event.location,
      'status', event.status,
      'commissions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'commissionId', link.commission_id,
          'name', link.commission_name_snapshot,
          'slug', link.commission_slug,
          'role', link.relation_role
        ) ORDER BY link.relation_role, link.created_at)
        FROM public.cronograma_evento_comissoes link
        WHERE link.event_id = event.id AND link.org_id = event.org_id
      ), '[]'::jsonb),
      'responsibles', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'userId', responsible.org_member_user_id,
          'name', responsible.name_snapshot,
          'role', responsible.role,
          'type', responsible.responsible_type,
          'primary', responsible.is_primary
        ) ORDER BY responsible.is_primary DESC, responsible.created_at)
        FROM public.cronograma_evento_responsaveis responsible
        WHERE responsible.event_id = event.id AND responsible.org_id = event.org_id
      ), '[]'::jsonb)
    ) INTO event_context_value
    FROM public.cronograma_eventos event
    WHERE event.id = p_event_id AND event.org_id = p_org_id;
    IF event_context_value IS NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_EVENT_NOT_FOUND'; END IF;

    INSERT INTO public.agenda_meeting_sessions (
      org_id, event_id, started_by, client_session_key, capture_state,
      processing_state, consent_confirmed, consent_policy_version,
      consent_confirmed_at, event_context, heartbeat_at, started_at
    ) VALUES (
      p_org_id, p_event_id, p_actor_user_id, p_mutation_id, 'recording',
      'accepting_segments', true, btrim(p_payload->>'consentPolicyVersion'),
      now(), event_context_value, now(), now()
    )
    ON CONFLICT (started_by, client_session_key) DO NOTHING
    RETURNING * INTO meeting;
    IF NOT FOUND THEN
      SELECT * INTO meeting FROM public.agenda_meeting_sessions
       WHERE started_by = p_actor_user_id AND client_session_key = p_mutation_id;
      IF meeting.org_id <> p_org_id OR meeting.event_id <> p_event_id THEN
        RAISE EXCEPTION 'AGENDA_MEETING_IDEMPOTENCY_CONFLICT';
      END IF;
    END IF;
    INSERT INTO public.agenda_meeting_user_consents (
      session_id,org_id,event_id,user_id,policy_version,consent_version,decision,recorded_by
    ) VALUES (
      meeting.id,meeting.org_id,meeting.event_id,p_actor_user_id,
      meeting.consent_policy_version,1,'consented',p_actor_user_id
    ) ON CONFLICT (session_id,user_id,policy_version,decision) DO NOTHING;
    PERFORM public.agenda_meeting_write_audit(
      meeting.id, p_actor_user_id, 'user', 'session_started', 'session',
      meeting.id, p_mutation_id, jsonb_build_object(
        'consentPolicyVersion', meeting.consent_policy_version,
        'participantsInformed', true
      )
    );
    result := public.agenda_meeting_detail_json(meeting.id);
  ELSE
    IF p_session_id IS NULL OR NOT public.agenda_meeting_actor_allowed(
      p_actor_user_id, p_action, p_org_id, p_event_id, p_session_id
    ) THEN RAISE EXCEPTION 'AGENDA_MEETING_FORBIDDEN'; END IF;
    SELECT * INTO meeting FROM public.agenda_meeting_sessions
     WHERE id = p_session_id AND org_id = p_org_id AND event_id = p_event_id AND deleted_at IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
    IF p_expected_version IS NOT NULL AND meeting.version <> p_expected_version THEN
      RAISE EXCEPTION 'AGENDA_MEETING_VERSION_CONFLICT:%', meeting.version;
    END IF;

    CASE p_action
      WHEN 'heartbeat' THEN
        IF meeting.capture_state NOT IN ('recording','paused','interrupted') THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION';
        END IF;
        IF COALESCE((p_payload->>'activeDurationMs')::bigint,meeting.active_duration_ms) NOT BETWEEN 0 AND 14400000 THEN
          RAISE EXCEPTION 'AGENDA_MEETING_ACTIVE_DURATION_INVALID';
        END IF;
        UPDATE public.agenda_meeting_sessions
           SET heartbeat_at=now(),
               active_duration_ms=GREATEST(
                 active_duration_ms,COALESCE((p_payload->>'activeDurationMs')::bigint,active_duration_ms)
               ),
               updated_at=now()
         WHERE id = meeting.id RETURNING * INTO meeting;

      WHEN 'pause' THEN
        IF meeting.capture_state <> 'recording' THEN RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION'; END IF;
        UPDATE public.agenda_meeting_sessions
           SET capture_state = 'paused', paused_at = now(), heartbeat_at = now(),
               version = version + 1, updated_at = now()
         WHERE id = meeting.id RETURNING * INTO meeting;
        PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','session_paused','session',meeting.id,p_mutation_id);

      WHEN 'resume' THEN
        IF meeting.capture_state NOT IN ('paused','interrupted')
           AND NOT (
             meeting.capture_state='recording'
             AND COALESCE((p_payload->>'resumedAfterInterruption')::boolean,false)
           ) THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION';
        END IF;
        UPDATE public.agenda_meeting_sessions
           SET capture_state = 'recording', paused_at = NULL, heartbeat_at = now(),
               version = version + 1, updated_at = now()
         WHERE id = meeting.id RETURNING * INTO meeting;
        PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','session_resumed','session',meeting.id,p_mutation_id);

      WHEN 'finalize' THEN
        IF meeting.capture_state NOT IN ('recording','paused','interrupted') THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION';
        END IF;
        target_sequence := COALESCE((p_payload->>'lastSequence')::integer, meeting.last_received_sequence);
        IF target_sequence < -1 OR target_sequence > 10000
           OR target_sequence < meeting.last_received_sequence THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_SEQUENCE';
        END IF;
        IF COALESCE((p_payload->>'activeDurationMs')::bigint,meeting.active_duration_ms) NOT BETWEEN 0 AND 14400000 THEN
          RAISE EXCEPTION 'AGENDA_MEETING_ACTIVE_DURATION_INVALID';
        END IF;
        UPDATE public.agenda_meeting_sessions
           SET capture_state = 'stopped', closed_sequence = target_sequence,
               active_duration_ms=GREATEST(
                 active_duration_ms,COALESCE((p_payload->>'activeDurationMs')::bigint,active_duration_ms)
               ),
               partial_analysis_confirmed=COALESCE((p_payload->>'allowPartial')::boolean,false),
               ended_at = now(), finalized_at = now(), version = version + 1, updated_at = now()
         WHERE id = meeting.id;
        meeting := public.agenda_meeting_refresh_sequence_state(meeting.id);
        IF cardinality(meeting.unresolved_sequences) = 0 THEN
          PERFORM public.agenda_meeting_enqueue_job(meeting.id, 'assemble_transcript', 'closed:' || meeting.closed_sequence::text);
          UPDATE public.agenda_meeting_sessions SET processing_state = 'assembling', updated_at = now()
           WHERE id = meeting.id RETURNING * INTO meeting;
        ELSE
          UPDATE public.agenda_meeting_sessions SET processing_state = 'awaiting_client_replay', updated_at = now()
           WHERE id = meeting.id RETURNING * INTO meeting;
        END IF;
        PERFORM public.agenda_meeting_write_audit(
          meeting.id,p_actor_user_id,'user','session_finalized','session',meeting.id,p_mutation_id,
          jsonb_build_object('closedSequence',meeting.closed_sequence,'missingSequences',to_jsonb(meeting.missing_sequences))
        );

      WHEN 'cancel' THEN
        IF meeting.capture_state NOT IN ('recording','paused','interrupted') THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION';
        END IF;
        UPDATE public.agenda_meeting_processing_jobs
           SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,updated_at=now()
         WHERE session_id=meeting.id AND status IN ('queued','retry_wait','in_flight');
        UPDATE public.agenda_meeting_sessions
           SET capture_state='cancelled',processing_state='cancelled',ended_at=now(),finalized_at=now(),
               version=version+1,updated_at=now()
         WHERE id=meeting.id RETURNING * INTO meeting;
        PERFORM public.agenda_meeting_write_audit(
          meeting.id,p_actor_user_id,'user','session_cancelled','session',meeting.id,p_mutation_id
        );

      WHEN 'mark_lost' THEN
        target_sequence := (p_payload->>'sequence')::integer;
        target_segment_id := (p_payload->>'segmentId')::uuid;
        IF target_sequence < 0 OR target_sequence > 10000 OR target_segment_id IS NULL
           OR (p_payload->>'captureStartMs')::bigint < 0
           OR (p_payload->>'captureEndMs')::bigint <= (p_payload->>'captureStartMs')::bigint
           OR (p_payload->>'captureEndMs')::bigint > 14400000 THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_SEGMENT';
        END IF;
        gap_error_code := CASE
          WHEN NULLIF(btrim(p_payload->>'reason'),'') IS NULL THEN 'client_segment_lost'
          ELSE left('client_gap_' || regexp_replace(lower(p_payload->>'reason'),'[^a-z0-9_-]+','_','g'),120)
        END;
        IF EXISTS (
          SELECT 1 FROM public.agenda_meeting_segment_receipts existing
           WHERE existing.session_id=meeting.id
             AND (
               (existing.sequence=target_sequence AND existing.segment_id<>target_segment_id)
               OR (existing.segment_id=target_segment_id AND existing.sequence<>target_sequence)
             )
        ) THEN
          RAISE EXCEPTION 'AGENDA_MEETING_SEGMENT_CONFLICT';
        END IF;
        INSERT INTO public.agenda_meeting_segment_receipts (
          session_id, org_id, event_id, segment_id, sequence, capture_start_ms,
          capture_end_ms, mime_type, sha256, mutation_id, status, lost_at, error_code
        ) VALUES (
          meeting.id, meeting.org_id, meeting.event_id, target_segment_id, target_sequence,
          COALESCE((p_payload->>'captureStartMs')::bigint, 0),
          GREATEST(COALESCE((p_payload->>'captureEndMs')::bigint, 1), COALESCE((p_payload->>'captureStartMs')::bigint, 0) + 1),
          NULLIF(p_payload->>'mimeType',''), NULLIF(lower(p_payload->>'sha256'),''),
          p_mutation_id, 'lost', now(), gap_error_code
        )
        ON CONFLICT (session_id, sequence) DO UPDATE
          SET status = CASE WHEN public.agenda_meeting_segment_receipts.status = 'transcribed'
                            THEN 'transcribed' ELSE 'lost' END,
              lost_at = CASE WHEN public.agenda_meeting_segment_receipts.status = 'transcribed'
                             THEN public.agenda_meeting_segment_receipts.lost_at ELSE now() END,
              error_code = CASE WHEN public.agenda_meeting_segment_receipts.status = 'transcribed'
                                 THEN public.agenda_meeting_segment_receipts.error_code ELSE gap_error_code END,
              updated_at = now();
        meeting := public.agenda_meeting_refresh_sequence_state(meeting.id);
        IF meeting.closed_sequence IS NOT NULL AND cardinality(meeting.unresolved_sequences)=0 THEN
          PERFORM public.agenda_meeting_enqueue_job(
            meeting.id,'assemble_transcript','closed:' || meeting.closed_sequence::text
          );
          UPDATE public.agenda_meeting_sessions
             SET processing_state='assembling',version=version+1,updated_at=now()
           WHERE id=meeting.id RETURNING * INTO meeting;
        ELSE
          UPDATE public.agenda_meeting_sessions
             SET processing_state=CASE WHEN closed_sequence IS NULL THEN processing_state ELSE 'awaiting_client_replay' END,
                 version=version+1,updated_at=now()
           WHERE id=meeting.id RETURNING * INTO meeting;
        END IF;
        PERFORM public.agenda_meeting_write_audit(
          meeting.id,p_actor_user_id,'user','segment_marked_lost','segment',target_segment_id,p_mutation_id,
          jsonb_build_object('sequence',target_sequence,'reason',NULLIF(p_payload->>'reason',''))
        );

      WHEN 'create_revision' THEN
        IF jsonb_typeof(p_payload->'segments') <> 'array'
           OR jsonb_array_length(p_payload->'segments') = 0 THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_REVISION';
        END IF;
        SELECT * INTO target_transcript FROM public.agenda_meeting_transcript_versions
         WHERE session_id = meeting.id ORDER BY version DESC LIMIT 1;
        IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_TRANSCRIPT_NOT_READY'; END IF;
        IF jsonb_array_length(p_payload->'segments') <> (
          SELECT count(*) FROM public.agenda_meeting_transcript_segments source
           WHERE source.session_id=meeting.id
        ) OR EXISTS (
          SELECT 1
            FROM jsonb_array_elements(p_payload->'segments') item
           GROUP BY item->>'sourceSegmentId'
          HAVING count(*) <> 1
        ) THEN
          RAISE EXCEPTION 'AGENDA_MEETING_REVISION_SEGMENTS_INCOMPLETE';
        END IF;
        SELECT string_agg(btrim(item->>'text'), E'\n' ORDER BY source.sequence)
          INTO transcript_content
          FROM jsonb_array_elements(p_payload->'segments') item
          JOIN public.agenda_meeting_transcript_segments source
            ON source.id=(item->>'sourceSegmentId')::uuid
           AND source.session_id=meeting.id
         WHERE NULLIF(btrim(item->>'text'),'') IS NOT NULL;
        IF transcript_content IS NULL OR (
          SELECT count(*)
            FROM jsonb_array_elements(p_payload->'segments') item
            JOIN public.agenda_meeting_transcript_segments source
              ON source.id=(item->>'sourceSegmentId')::uuid
             AND source.session_id=meeting.id
           WHERE NULLIF(btrim(item->>'text'),'') IS NOT NULL
        ) <> jsonb_array_length(p_payload->'segments') THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_REVISION_SEGMENT';
        END IF;
        SELECT COALESCE(max(version),0)+1 INTO next_version
          FROM public.agenda_meeting_transcript_versions WHERE session_id = meeting.id;
        transcript_hash := encode(extensions.digest(convert_to(transcript_content,'UTF8'),'sha256'),'hex');
        INSERT INTO public.agenda_meeting_transcript_versions (
          session_id,org_id,event_id,version,kind,parent_version_id,transcript_text,
          content_hash,is_complete,missing_sequences,revision_reason,created_by
        ) VALUES (
          meeting.id,meeting.org_id,meeting.event_id,next_version,'manual_revision',target_transcript.id,
          transcript_content,transcript_hash,target_transcript.is_complete,target_transcript.missing_sequences,
          NULLIF(btrim(p_payload->>'reason'),''),p_actor_user_id
        ) RETURNING id INTO new_transcript_id;
        INSERT INTO public.agenda_meeting_transcript_revision_segments (
          transcript_version_id,session_id,org_id,event_id,source_segment_id,sequence,
          revised_text,source_content_hash,revised_content_hash
        )
        SELECT new_transcript_id,meeting.id,meeting.org_id,meeting.event_id,source.id,source.sequence,
               btrim(item->>'text'),source.content_hash,
               encode(extensions.digest(convert_to(btrim(item->>'text'),'UTF8'),'sha256'),'hex')
          FROM jsonb_array_elements(p_payload->'segments') item
          JOIN public.agenda_meeting_transcript_segments source
            ON source.id=(item->>'sourceSegmentId')::uuid
           AND source.session_id=meeting.id
         ORDER BY source.sequence;
        PERFORM public.agenda_meeting_enqueue_job(
          meeting.id,'analysis_generate','revision:' || new_transcript_id::text,new_transcript_id
        );
        UPDATE public.agenda_meeting_sessions
           SET processing_state='analysis_queued',version=version+1,updated_at=now()
         WHERE id=meeting.id RETURNING * INTO meeting;
        PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','transcript_revision_created','transcript_version',new_transcript_id,p_mutation_id);

      WHEN 'review_minutes' THEN
        target_minutes_id := (p_payload->>'minutesVersionId')::uuid;
        decision := p_payload->>'decision';
        IF decision NOT IN ('approve','request_changes') THEN RAISE EXCEPTION 'AGENDA_MEETING_INVALID_REVIEW'; END IF;
        UPDATE public.agenda_meeting_minutes_versions
           SET status = CASE WHEN decision='approve' THEN 'reviewed' ELSE 'changes_requested' END,
               reviewed_by=p_actor_user_id,reviewed_at=now(),review_note=NULLIF(btrim(p_payload->>'note'),'')
         WHERE id=target_minutes_id AND session_id=meeting.id
           AND status IN ('draft','changes_requested')
           AND NOT EXISTS (
             SELECT 1 FROM public.agenda_meeting_minutes_versions newer
              WHERE newer.session_id=meeting.id
                AND newer.version > agenda_meeting_minutes_versions.version
           );
        IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_MINUTES_NOT_FOUND'; END IF;
        UPDATE public.agenda_meeting_sessions
           SET processing_state=CASE WHEN decision='approve' THEN 'completed' ELSE 'review_required' END,
               completed_at=CASE WHEN decision='approve' THEN now() ELSE NULL END,
               version=version+1,updated_at=now()
         WHERE id=meeting.id RETURNING * INTO meeting;
        PERFORM public.agenda_meeting_write_audit(
          meeting.id,p_actor_user_id,'user',CASE WHEN decision='approve' THEN 'minutes_approved' ELSE 'minutes_changes_requested' END,
          'minutes_version',target_minutes_id,p_mutation_id
        );

      WHEN 'update_action' THEN
        target_action_id := (p_payload->>'actionId')::uuid;
        IF p_payload ? 'confirmedUserId' AND NULLIF(p_payload->>'confirmedUserId','') IS NOT NULL THEN
          assignee := (p_payload->>'confirmedUserId')::uuid;
          IF NOT EXISTS (
            SELECT 1 FROM public.org_members member
             WHERE member.org_id=meeting.org_id AND member.user_id=assignee AND member.is_active=true
          ) THEN RAISE EXCEPTION 'AGENDA_MEETING_INVALID_ASSIGNEE'; END IF;
        END IF;
        UPDATE public.agenda_meeting_action_items action_item
           SET title=CASE WHEN p_payload ? 'title' THEN NULLIF(btrim(p_payload->>'title'),'') ELSE action_item.title END,
               description=CASE WHEN p_payload ? 'description' THEN COALESCE(p_payload->>'description','') ELSE action_item.description END,
               confirmed_user_id=CASE WHEN p_payload ? 'confirmedUserId' THEN assignee ELSE action_item.confirmed_user_id END,
               due_date=CASE WHEN p_payload ? 'dueDate' AND NULLIF(p_payload->>'dueDate','') IS NOT NULL
                              THEN (p_payload->>'dueDate')::date
                              WHEN p_payload ? 'dueDate' THEN NULL ELSE action_item.due_date END,
               due_date_confirmed=CASE WHEN p_payload ? 'dueDate'
                                       THEN NULLIF(p_payload->>'dueDate','') IS NOT NULL
                                       ELSE action_item.due_date_confirmed END,
               status=CASE WHEN p_payload ? 'status' THEN p_payload->>'status' ELSE action_item.status END,
               confirmed_by=CASE WHEN p_payload ? 'confirmedUserId' THEN p_actor_user_id ELSE action_item.confirmed_by END,
               confirmed_at=CASE WHEN p_payload ? 'confirmedUserId' THEN now() ELSE action_item.confirmed_at END,
               updated_by=p_actor_user_id,updated_at=now()
         WHERE action_item.id=target_action_id AND action_item.session_id=meeting.id
           AND action_item.minutes_version_id = (
             SELECT latest_minutes.id
               FROM public.agenda_meeting_minutes_versions latest_minutes
              WHERE latest_minutes.session_id=meeting.id
                AND latest_minutes.status <> 'superseded'
              ORDER BY latest_minutes.version DESC
              LIMIT 1
           );
        IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_ACTION_NOT_FOUND'; END IF;
        UPDATE public.agenda_meeting_sessions SET version=version+1,updated_at=now()
         WHERE id=meeting.id RETURNING * INTO meeting;
        PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','action_item_updated','action_item',target_action_id,p_mutation_id);

      WHEN 'retry_analysis' THEN
        SELECT * INTO target_transcript FROM public.agenda_meeting_transcript_versions
         WHERE session_id=meeting.id ORDER BY version DESC LIMIT 1;
        IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_TRANSCRIPT_NOT_READY'; END IF;
        IF cardinality(target_transcript.missing_sequences)>0
           AND meeting.partial_analysis_confirmed IS NOT TRUE
           AND COALESCE((p_payload->>'confirmPartial')::boolean,false) IS NOT TRUE THEN
          RAISE EXCEPTION 'AGENDA_MEETING_PARTIAL_ANALYSIS_CONFIRMATION_REQUIRED';
        END IF;
        PERFORM public.agenda_meeting_enqueue_job(
          meeting.id,'analysis_generate','manual-retry:' || p_mutation_id::text,target_transcript.id
        );
        UPDATE public.agenda_meeting_sessions
           SET processing_state='analysis_queued',last_error_code=NULL,last_error_at=NULL,
               partial_analysis_confirmed=partial_analysis_confirmed
                 OR COALESCE((p_payload->>'confirmPartial')::boolean,false),
               version=version+1,updated_at=now()
         WHERE id=meeting.id RETURNING * INTO meeting;
        PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','analysis_retry_requested','session',meeting.id,p_mutation_id);

      WHEN 'delete' THEN
        UPDATE public.agenda_meeting_processing_jobs SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,updated_at=now()
         WHERE session_id=meeting.id AND status IN ('queued','retry_wait','in_flight');
        PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','session_deleted','session',meeting.id,p_mutation_id);
        deletion_session_id := meeting.id;
        PERFORM public.agenda_meeting_capture_tombstone(meeting.id,'session',p_actor_user_id);
        DELETE FROM public.agenda_meeting_sessions WHERE id=meeting.id;
        result := jsonb_build_object('deletedSessionId',deletion_session_id);
    END CASE;
    IF p_action <> 'delete' THEN
      result := public.agenda_meeting_detail_json(meeting.id);
    END IF;
  END IF;

  receipt_response := CASE WHEN p_action='delete' THEN result ELSE jsonb_build_object(
    'sessionId',COALESCE(meeting.id,p_session_id),
    'sessionVersion',meeting.version,
    'action',p_action
  ) END;
  INSERT INTO public.agenda_meeting_mutation_receipts (
    actor_user_id,org_id,event_id,action,mutation_id,session_id,response
  ) VALUES (
    p_actor_user_id,p_org_id,p_event_id,p_action,p_mutation_id,
    COALESCE(deletion_session_id,meeting.id,p_session_id),receipt_response
  );
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.agenda_meeting_control(text,uuid,uuid,uuid,uuid,uuid,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_control(text,uuid,uuid,uuid,uuid,uuid,bigint,jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Ephemeral segment handoff and replay-safe callback persistence
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agenda_meeting_prepare_segment(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_segment_id uuid,
  p_sequence integer,
  p_capture_start_ms bigint,
  p_capture_end_ms bigint,
  p_mime_type text,
  p_byte_size bigint,
  p_sha256 text,
  p_mutation_id uuid,
  p_callback_token_hash text,
  p_callback_token_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
  receipt public.agenda_meeting_segment_receipts%ROWTYPE;
  should_forward boolean := true;
  keyterms jsonb;
BEGIN
  IF p_actor_user_id IS NULL OR p_session_id IS NULL OR p_segment_id IS NULL OR p_mutation_id IS NULL
     OR p_sequence < 0 OR p_sequence > 10000
     OR p_capture_start_ms < 0 OR p_capture_end_ms <= p_capture_start_ms
     OR p_capture_end_ms > 14400000
     OR p_byte_size <= 0 OR p_byte_size > 2097152
     OR lower(p_sha256) !~ '^[0-9a-f]{64}$'
     OR lower(p_callback_token_hash) !~ '^[0-9a-f]{64}$'
     OR p_callback_token_expires_at <= now()
     OR lower(p_mime_type) !~ '^audio/(webm|ogg|mp4|wav|wave|x-wav)(;.*)?$' THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_SEGMENT';
  END IF;

  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR meeting.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
  IF NOT public.agenda_meeting_actor_allowed(
    p_actor_user_id,'transcribe_segment',meeting.org_id,meeting.event_id,meeting.id
  ) THEN RAISE EXCEPTION 'AGENDA_MEETING_FORBIDDEN'; END IF;
  IF meeting.capture_state IN ('cancelled') OR meeting.processing_state IN ('cancelled','completed') THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION';
  END IF;
  IF meeting.closed_sequence IS NOT NULL AND p_sequence > meeting.closed_sequence THEN
    RAISE EXCEPTION 'AGENDA_MEETING_SEQUENCE_CLOSED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text || ':' || p_sequence::text,0));
  SELECT * INTO receipt
    FROM public.agenda_meeting_segment_receipts
   WHERE session_id=p_session_id AND (sequence=p_sequence OR segment_id=p_segment_id)
   FOR UPDATE;

  IF FOUND THEN
    IF receipt.sequence <> p_sequence OR receipt.segment_id <> p_segment_id
       OR receipt.sha256 IS DISTINCT FROM lower(p_sha256)
       OR receipt.byte_size IS DISTINCT FROM p_byte_size
       OR receipt.capture_start_ms <> p_capture_start_ms
       OR receipt.capture_end_ms <> p_capture_end_ms THEN
      RAISE EXCEPTION 'AGENDA_MEETING_SEGMENT_CONFLICT';
    END IF;
    IF receipt.status = 'transcribed' THEN
      should_forward := false;
    ELSIF receipt.status = 'terminal_error' OR receipt.status = 'lost' THEN
      should_forward := false;
    ELSIF receipt.attempt_count >= 5 OR receipt.created_at <= now() - interval '15 minutes' THEN
      UPDATE public.agenda_meeting_segment_receipts
         SET status='terminal_error',retry_after_ms=NULL,
             error_code='segment_retry_exhausted',updated_at=now()
       WHERE id=receipt.id RETURNING * INTO receipt;
      should_forward := false;
      PERFORM public.agenda_meeting_write_audit(
        receipt.session_id,p_actor_user_id,'user','segment_failed','segment',receipt.segment_id,p_mutation_id,
        jsonb_build_object('sequence',receipt.sequence,'errorCode',receipt.error_code,'terminal',true)
      );
    ELSIF receipt.status = 'processing' AND receipt.provider_request_id IS NOT NULL THEN
      should_forward := false;
    ELSIF receipt.status = 'accepted' AND receipt.updated_at > now() - interval '2 minutes' THEN
      should_forward := false;
    ELSE
      UPDATE public.agenda_meeting_segment_receipts
         SET attempt_id=gen_random_uuid(),mutation_id=p_mutation_id,status='accepted',
             attempt_count=attempt_count+1,retry_after_ms=NULL,
             callback_token_hash=lower(p_callback_token_hash),
             callback_token_expires_at=p_callback_token_expires_at,
             callback_digest=NULL,callback_received_at=NULL,
             provider_request_id=NULL,provider_accepted_at=NULL,
             error_code=NULL,updated_at=now()
       WHERE id=receipt.id RETURNING * INTO receipt;
    END IF;
  ELSE
    INSERT INTO public.agenda_meeting_segment_receipts (
      session_id,org_id,event_id,segment_id,sequence,capture_start_ms,capture_end_ms,
      mime_type,byte_size,sha256,mutation_id,status,callback_token_hash,callback_token_expires_at
    ) VALUES (
      meeting.id,meeting.org_id,meeting.event_id,p_segment_id,p_sequence,p_capture_start_ms,p_capture_end_ms,
      lower(p_mime_type),p_byte_size,lower(p_sha256),p_mutation_id,'accepted',
      lower(p_callback_token_hash),p_callback_token_expires_at
    ) RETURNING * INTO receipt;
  END IF;

  UPDATE public.agenda_meeting_sessions
     SET last_received_sequence=GREATEST(last_received_sequence,p_sequence),
         processing_state=CASE WHEN processing_state='accepting_segments' THEN 'transcribing' ELSE processing_state END,
         updated_at=now()
   WHERE id=meeting.id;

  SELECT jsonb_build_array(event_context->>'title',event_context->>'location')
         || COALESCE(event_context->'responsibles','[]'::jsonb)
         || COALESCE(event_context->'commissions','[]'::jsonb)
    INTO keyterms
    FROM public.agenda_meeting_sessions WHERE id=meeting.id;

  IF should_forward THEN
    PERFORM public.agenda_meeting_write_audit(
      meeting.id,p_actor_user_id,'user','segment_accepted','segment',p_segment_id,p_mutation_id,
      jsonb_build_object('sequence',p_sequence,'byteSize',p_byte_size,'mimeType',lower(p_mime_type))
    );
  END IF;
  RETURN jsonb_build_object(
    'receiptId',receipt.id,
    'canonicalReceiptId',CASE WHEN receipt.status='transcribed' THEN receipt.id ELSE NULL END,
    'attemptId',receipt.attempt_id,
    'segmentId',receipt.segment_id,
    'sequence',receipt.sequence,
    'status',receipt.status,
    'retryAfterMs',receipt.retry_after_ms,
    'shouldForward',should_forward,
    'keyterms',keyterms
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_accept_segment(
  p_receipt_id uuid,
  p_provider_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE receipt public.agenda_meeting_segment_receipts%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_provider_request_id),'') IS NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_PROVIDER_REQUEST_REQUIRED'; END IF;
  SELECT * INTO receipt FROM public.agenda_meeting_segment_receipts WHERE id=p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_RECEIPT_NOT_FOUND'; END IF;
  IF receipt.status='transcribed' THEN
    RETURN jsonb_build_object('receiptId',receipt.id,'canonicalReceiptId',receipt.id,'status','transcribed');
  END IF;
  IF receipt.status NOT IN ('accepted','processing') THEN RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION'; END IF;
  IF receipt.provider_request_id IS NOT NULL AND receipt.provider_request_id <> p_provider_request_id THEN
    RAISE EXCEPTION 'AGENDA_MEETING_PROVIDER_REQUEST_CONFLICT';
  END IF;
  UPDATE public.agenda_meeting_segment_receipts
     SET status='processing',provider_request_id=p_provider_request_id,
         provider_accepted_at=COALESCE(provider_accepted_at,now()),updated_at=now()
   WHERE id=receipt.id RETURNING * INTO receipt;
  RETURN jsonb_build_object(
    'receiptId',receipt.id,'attemptId',receipt.attempt_id,'segmentId',receipt.segment_id,
    'sequence',receipt.sequence,'status',receipt.status,'providerRequestId',receipt.provider_request_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_fail_segment(
  p_receipt_id uuid,
  p_error_code text,
  p_terminal boolean,
  p_retry_after_ms integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE receipt public.agenda_meeting_segment_receipts%ROWTYPE;
BEGIN
  SELECT * INTO receipt FROM public.agenda_meeting_segment_receipts WHERE id=p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_RECEIPT_NOT_FOUND'; END IF;
  IF receipt.status='transcribed' THEN
    RETURN jsonb_build_object('receiptId',receipt.id,'canonicalReceiptId',receipt.id,'status','transcribed');
  END IF;
  UPDATE public.agenda_meeting_segment_receipts
     SET status=CASE WHEN p_terminal THEN 'terminal_error' ELSE 'retryable_error' END,
         retry_after_ms=CASE WHEN p_terminal THEN NULL ELSE GREATEST(0,COALESCE(p_retry_after_ms,15000)) END,
         error_code=left(COALESCE(NULLIF(p_error_code,''),'provider_request_failed'),120),updated_at=now()
   WHERE id=receipt.id RETURNING * INTO receipt;
  PERFORM public.agenda_meeting_write_audit(
    receipt.session_id,NULL,'service','segment_failed','segment',receipt.segment_id,NULL,
    jsonb_build_object('sequence',receipt.sequence,'errorCode',receipt.error_code,'terminal',p_terminal)
  );
  RETURN jsonb_build_object(
    'receiptId',receipt.id,'segmentId',receipt.segment_id,'sequence',receipt.sequence,
    'status',receipt.status,'retryAfterMs',receipt.retry_after_ms,'errorCode',receipt.error_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_complete_segment(
  p_callback_token_hash text,
  p_callback_digest text,
  p_provider_request_id text,
  p_attempt_id uuid,
  p_transcript text,
  p_words jsonb DEFAULT '[]'::jsonb,
  p_duration_ms bigint DEFAULT NULL,
  p_confidence numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  receipt public.agenda_meeting_segment_receipts%ROWTYPE;
  meeting public.agenda_meeting_sessions%ROWTYPE;
  segment_id_value uuid;
  transcript_hash text;
BEGIN
  IF lower(p_callback_token_hash) !~ '^[0-9a-f]{64}$'
     OR lower(p_callback_digest) !~ '^[0-9a-f]{64}$'
     OR NULLIF(btrim(p_provider_request_id),'') IS NULL
     OR p_attempt_id IS NULL
     OR jsonb_typeof(COALESCE(p_words,'[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_CALLBACK';
  END IF;
  SELECT * INTO receipt FROM public.agenda_meeting_segment_receipts
   WHERE callback_token_hash=lower(p_callback_token_hash) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_CALLBACK_NOT_FOUND'; END IF;

  IF receipt.status='transcribed' THEN
    IF receipt.callback_digest=lower(p_callback_digest)
       AND receipt.provider_request_id=p_provider_request_id
       AND receipt.attempt_id=p_attempt_id THEN
      RETURN jsonb_build_object(
        'receiptId',receipt.id,'canonicalReceiptId',receipt.id,'segmentId',receipt.segment_id,
        'sequence',receipt.sequence,'status','transcribed','duplicate',true
      );
    END IF;
    RAISE EXCEPTION 'AGENDA_MEETING_CALLBACK_REPLAY_CONFLICT';
  END IF;
  IF receipt.callback_token_expires_at < now() THEN RAISE EXCEPTION 'AGENDA_MEETING_CALLBACK_EXPIRED'; END IF;
  IF receipt.attempt_id <> p_attempt_id THEN RAISE EXCEPTION 'AGENDA_MEETING_CALLBACK_ATTEMPT_CONFLICT'; END IF;
  IF receipt.provider_request_id IS NOT NULL AND receipt.provider_request_id <> p_provider_request_id THEN
    RAISE EXCEPTION 'AGENDA_MEETING_PROVIDER_REQUEST_CONFLICT';
  END IF;
  IF receipt.status NOT IN ('accepted','processing') THEN RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION'; END IF;

  transcript_hash := encode(extensions.digest(convert_to(COALESCE(p_transcript,''),'UTF8'),'sha256'),'hex');
  INSERT INTO public.agenda_meeting_transcript_segments (
    session_id,org_id,event_id,receipt_id,segment_id,sequence,transcript_text,words,
    duration_ms,confidence,provider_request_id,content_hash
  ) VALUES (
    receipt.session_id,receipt.org_id,receipt.event_id,receipt.id,receipt.segment_id,receipt.sequence,
    COALESCE(p_transcript,''),COALESCE(p_words,'[]'::jsonb),p_duration_ms,p_confidence,
    p_provider_request_id,transcript_hash
  )
  ON CONFLICT (receipt_id) DO NOTHING
  RETURNING id INTO segment_id_value;
  IF segment_id_value IS NULL THEN
    SELECT id INTO segment_id_value FROM public.agenda_meeting_transcript_segments WHERE receipt_id=receipt.id;
  END IF;

  UPDATE public.agenda_meeting_segment_receipts
     SET status='transcribed',callback_digest=lower(p_callback_digest),callback_received_at=now(),
         provider_request_id=p_provider_request_id,transcribed_at=now(),retry_after_ms=NULL,error_code=NULL,updated_at=now()
   WHERE id=receipt.id RETURNING * INTO receipt;
  meeting := public.agenda_meeting_refresh_sequence_state(receipt.session_id);
  IF meeting.closed_sequence IS NOT NULL AND cardinality(meeting.unresolved_sequences)=0 THEN
    PERFORM public.agenda_meeting_enqueue_job(
      meeting.id,'assemble_transcript','closed:' || meeting.closed_sequence::text
    );
    UPDATE public.agenda_meeting_sessions SET processing_state='assembling',updated_at=now()
     WHERE id=meeting.id;
  END IF;
  PERFORM public.agenda_meeting_write_audit(
    receipt.session_id,NULL,'provider','segment_transcribed','transcript_segment',segment_id_value,NULL,
    jsonb_build_object('sequence',receipt.sequence,'providerRequestId',p_provider_request_id)
  );
  RETURN jsonb_build_object(
    'receiptId',receipt.id,'canonicalReceiptId',receipt.id,'segmentId',receipt.segment_id,
    'sequence',receipt.sequence,'status','transcribed','duplicate',false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.agenda_meeting_prepare_segment(uuid,uuid,uuid,integer,bigint,bigint,text,bigint,text,uuid,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_accept_segment(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_fail_segment(uuid,text,boolean,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_complete_segment(text,text,text,uuid,text,jsonb,bigint,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_prepare_segment(uuid,uuid,uuid,integer,bigint,bigint,text,bigint,text,uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_accept_segment(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_fail_segment(uuid,text,boolean,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_complete_segment(text,text,text,uuid,text,jsonb,bigint,numeric) TO service_role;

-- ---------------------------------------------------------------------------
-- Lease-based textual assembly and analysis worker RPCs. These jobs never
-- reference audio: only canonical transcript rows and structured JSON enter.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agenda_meeting_expire_stale_captures(
  p_stale_seconds integer DEFAULT 180
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stale_session record;
  affected integer := 0;
BEGIN
  IF p_stale_seconds NOT BETWEEN 60 AND 86400 THEN
    RAISE EXCEPTION 'AGENDA_MEETING_STALE_WINDOW_INVALID';
  END IF;
  FOR stale_session IN
    UPDATE public.agenda_meeting_sessions meeting
       SET capture_state='interrupted',paused_at=now(),
           last_error_code='capture_heartbeat_expired',last_error_at=now(),
           version=version+1,updated_at=now()
     WHERE meeting.deleted_at IS NULL
       AND meeting.capture_state='recording'
       AND COALESCE(meeting.heartbeat_at,meeting.started_at,meeting.created_at)
           <= now()-make_interval(secs => p_stale_seconds)
     RETURNING meeting.id
  LOOP
    affected := affected + 1;
    PERFORM public.agenda_meeting_write_audit(
      stale_session.id,NULL,'service','capture_heartbeat_expired','session',stale_session.id
    );
  END LOOP;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_claim_jobs(
  p_batch_size integer DEFAULT 2,
  p_lease_seconds integer DEFAULT 360
)
RETURNS SETOF public.agenda_meeting_processing_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  expired_job public.agenda_meeting_processing_jobs%ROWTYPE;
  batch_size integer := LEAST(5,GREATEST(1,COALESCE(p_batch_size,2)));
  lease_seconds integer := LEAST(390,GREATEST(30,COALESCE(p_lease_seconds,360)));
BEGIN
  -- Exhausted stale leases are dead-lettered before the next claim. This makes
  -- worker termination recoverable without allowing an infinite poison loop.
  FOR expired_job IN
    SELECT *
      FROM public.agenda_meeting_processing_jobs job
     WHERE job.status='in_flight'
       AND job.lease_expires_at <= now()
       AND job.attempts >= job.max_attempts
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.agenda_meeting_processing_jobs
       SET status='dead_letter',lease_token=NULL,lease_expires_at=NULL,
           last_error_code=COALESCE(last_error_code,'worker_lease_exhausted'),updated_at=now()
     WHERE id=expired_job.id;
    UPDATE public.agenda_meeting_sessions
       SET processing_state='failed',last_error_code='worker_lease_exhausted',last_error_at=now(),
           version=version+1,updated_at=now()
     WHERE id=expired_job.session_id AND processing_state NOT IN ('completed','cancelled');
    PERFORM public.agenda_meeting_write_audit(
      expired_job.session_id,NULL,'service','processing_job_dead_lettered','processing_job',
      expired_job.id,NULL,jsonb_build_object('errorCode','worker_lease_exhausted','attempts',expired_job.attempts)
    );
  END LOOP;

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
      FROM public.agenda_meeting_processing_jobs job
     WHERE (
       (job.status IN ('queued','retry_wait') AND job.available_at <= now())
       OR (
         job.status='in_flight'
         AND job.lease_expires_at <= now()
         AND job.attempts < job.max_attempts
       )
     )
       AND job.attempts < job.max_attempts
     ORDER BY job.available_at,job.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT batch_size
  )
  UPDATE public.agenda_meeting_processing_jobs job
     SET status='in_flight',attempts=job.attempts+1,lease_token=gen_random_uuid(),
         lease_expires_at=now()+make_interval(secs => lease_seconds),updated_at=now()
    FROM candidates
   WHERE job.id=candidates.id
  RETURNING job.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_fail_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_retry_after_seconds integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.agenda_meeting_processing_jobs%ROWTYPE;
  sanitized_error text;
  retry_delay integer;
  terminal boolean;
BEGIN
  SELECT * INTO job
    FROM public.agenda_meeting_processing_jobs
   WHERE id=p_job_id AND lease_token=p_lease_token AND status='in_flight'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_JOB_LEASE_CONFLICT'; END IF;

  sanitized_error := left(regexp_replace(
    lower(COALESCE(NULLIF(btrim(p_error_code),''),'meeting_job_failed')),
    '[^a-z0-9_-]+','_','g'
  ),120);
  terminal := COALESCE(p_retry_after_seconds,0) <= 0 OR job.attempts >= job.max_attempts;
  retry_delay := LEAST(900,GREATEST(
    COALESCE(p_retry_after_seconds,30),
    (power(2,LEAST(job.attempts,8))*5)::integer
  ));

  UPDATE public.agenda_meeting_processing_jobs
     SET status=CASE WHEN terminal THEN 'dead_letter' ELSE 'retry_wait' END,
         available_at=CASE WHEN terminal THEN available_at ELSE now()+make_interval(secs => retry_delay) END,
         lease_token=NULL,lease_expires_at=NULL,last_error_code=sanitized_error,updated_at=now()
   WHERE id=job.id RETURNING * INTO job;

  IF terminal THEN
    UPDATE public.agenda_meeting_sessions
       SET processing_state='failed',last_error_code=sanitized_error,last_error_at=now(),
           version=version+1,updated_at=now()
     WHERE id=job.session_id AND processing_state NOT IN ('completed','cancelled');
  ELSE
    UPDATE public.agenda_meeting_sessions
       SET last_error_code=sanitized_error,last_error_at=now(),updated_at=now()
     WHERE id=job.session_id AND processing_state NOT IN ('completed','cancelled');
  END IF;
  PERFORM public.agenda_meeting_write_audit(
    job.session_id,NULL,'service',
    CASE WHEN terminal THEN 'processing_job_dead_lettered' ELSE 'processing_job_retry_scheduled' END,
    'processing_job',job.id,NULL,
    jsonb_build_object('errorCode',sanitized_error,'attempts',job.attempts,'retryAfterSeconds',CASE WHEN terminal THEN NULL ELSE retry_delay END)
  );
  RETURN jsonb_build_object(
    'jobId',job.id,'status',job.status,'attempts',job.attempts,
    'retryAfterSeconds',CASE WHEN terminal THEN NULL ELSE retry_delay END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_strip_text_overlap(
  p_previous text,
  p_current text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  previous_words text[];
  current_words text[];
  previous_count integer;
  current_count integer;
  overlap_size integer;
  previous_tail text;
  current_head text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_current,'')),'') IS NULL THEN RETURN ''; END IF;
  IF NULLIF(btrim(COALESCE(p_previous,'')),'') IS NULL THEN RETURN btrim(p_current); END IF;
  previous_words := regexp_split_to_array(btrim(p_previous), E'\\s+');
  current_words := regexp_split_to_array(btrim(p_current), E'\\s+');
  previous_count := cardinality(previous_words);
  current_count := cardinality(current_words);
  IF LEAST(previous_count,current_count) < 3 THEN RETURN btrim(p_current); END IF;

  FOR overlap_size IN REVERSE LEAST(64,previous_count,current_count)..3 LOOP
    previous_tail := regexp_replace(
      lower(array_to_string(previous_words[(previous_count-overlap_size+1):previous_count],' ')),
      '[^[:alnum:]]+','','g'
    );
    current_head := regexp_replace(
      lower(array_to_string(current_words[1:overlap_size],' ')),
      '[^[:alnum:]]+','','g'
    );
    IF previous_tail <> '' AND previous_tail = current_head THEN
      IF overlap_size = current_count THEN RETURN ''; END IF;
      RETURN array_to_string(current_words[(overlap_size+1):current_count],' ');
    END IF;
  END LOOP;
  RETURN btrim(p_current);
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_complete_assemble_job(
  p_job_id uuid,
  p_lease_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  job public.agenda_meeting_processing_jobs%ROWTYPE;
  meeting public.agenda_meeting_sessions%ROWTYPE;
  transcript_content text;
  transcript_hash text;
  transcript_id uuid;
  transcript_version integer;
  analysis_job_id uuid;
  has_speech boolean;
BEGIN
  SELECT * INTO job
    FROM public.agenda_meeting_processing_jobs
   WHERE id=p_job_id AND lease_token=p_lease_token AND status='in_flight'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_JOB_LEASE_CONFLICT'; END IF;
  IF job.kind <> 'assemble_transcript' THEN RAISE EXCEPTION 'AGENDA_MEETING_JOB_KIND_CONFLICT'; END IF;

  meeting := public.agenda_meeting_refresh_sequence_state(job.session_id);
  IF meeting.closed_sequence IS NULL OR cardinality(meeting.unresolved_sequences)>0 THEN
    RAISE EXCEPTION 'AGENDA_MEETING_ASSEMBLY_INCOMPLETE';
  END IF;

  WITH ordered_segments AS (
    SELECT segment.sequence,segment.transcript_text,receipt.capture_start_ms,
           lag(segment.transcript_text) OVER (ORDER BY segment.sequence) AS previous_text,
           lag(receipt.capture_end_ms) OVER (ORDER BY segment.sequence) AS previous_end_ms
      FROM public.agenda_meeting_transcript_segments segment
      JOIN public.agenda_meeting_segment_receipts receipt ON receipt.id=segment.receipt_id
     WHERE segment.session_id=meeting.id
       AND segment.sequence BETWEEN 0 AND meeting.closed_sequence
  )
  SELECT COALESCE(string_agg(NULLIF(btrim(
           CASE WHEN capture_start_ms < previous_end_ms
                THEN public.agenda_meeting_strip_text_overlap(previous_text,transcript_text)
                ELSE transcript_text END
         ),''),E'\n' ORDER BY sequence),'')
    INTO transcript_content
    FROM ordered_segments;
  transcript_hash := encode(extensions.digest(convert_to(transcript_content,'UTF8'),'sha256'),'hex');
  SELECT COALESCE(max(version),0)+1 INTO transcript_version
    FROM public.agenda_meeting_transcript_versions WHERE session_id=meeting.id;
  INSERT INTO public.agenda_meeting_transcript_versions (
    session_id,org_id,event_id,version,kind,transcript_text,content_hash,is_complete,
    missing_sequences,created_by
  ) VALUES (
    meeting.id,meeting.org_id,meeting.event_id,transcript_version,'canonical',
    transcript_content,transcript_hash,cardinality(meeting.missing_sequences)=0,
    meeting.missing_sequences,NULL
  ) RETURNING id INTO transcript_id;

  has_speech := NULLIF(btrim(transcript_content),'') IS NOT NULL;
  IF has_speech AND (
    cardinality(meeting.missing_sequences)=0 OR meeting.partial_analysis_confirmed
  ) THEN
    analysis_job_id := public.agenda_meeting_enqueue_job(
      meeting.id,'analysis_generate','transcript:' || transcript_id::text,transcript_id
    );
    UPDATE public.agenda_meeting_sessions
       SET processing_state='analysis_queued',last_error_code=NULL,last_error_at=NULL,
           version=version+1,updated_at=now()
     WHERE id=meeting.id RETURNING * INTO meeting;
  ELSE
    UPDATE public.agenda_meeting_sessions
       SET processing_state=CASE
             WHEN NOT has_speech THEN 'review_required'
             WHEN cardinality(missing_sequences)>0 THEN 'partial_transcript'
             ELSE 'transcript_complete'
           END,
           last_error_code=CASE WHEN NOT has_speech THEN 'analysis_transcript_has_no_speech' ELSE NULL END,
           last_error_at=CASE WHEN NOT has_speech THEN now() ELSE NULL END,
           version=version+1,updated_at=now()
     WHERE id=meeting.id RETURNING * INTO meeting;
  END IF;
  UPDATE public.agenda_meeting_processing_jobs
     SET status='succeeded',lease_token=NULL,lease_expires_at=NULL,completed_at=now(),updated_at=now()
   WHERE id=job.id;
  PERFORM public.agenda_meeting_write_audit(
    meeting.id,NULL,'service','transcript_version_assembled','transcript_version',transcript_id,NULL,
    jsonb_build_object(
      'version',transcript_version,'coverage',CASE WHEN cardinality(meeting.missing_sequences)>0 THEN 'with_gaps' ELSE 'complete' END,
      'analysisJobId',analysis_job_id
    )
  );
  RETURN jsonb_build_object(
    'jobId',job.id,'transcriptVersionId',transcript_id,'analysisJobId',analysis_job_id,
    'coverage',CASE WHEN cardinality(meeting.missing_sequences)>0 THEN 'with_gaps' ELSE 'complete' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_analysis_evidence(
  p_session_id uuid,
  p_segment_ids jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_count integer;
  matched_count integer;
  evidence jsonb;
BEGIN
  IF jsonb_typeof(p_segment_ids) <> 'array' OR jsonb_array_length(p_segment_ids)=0 THEN
    RAISE EXCEPTION 'AGENDA_MEETING_ANALYSIS_EVIDENCE_REQUIRED';
  END IF;
  requested_count := jsonb_array_length(p_segment_ids);
  SELECT count(*),jsonb_agg(jsonb_build_object(
           'transcriptSegmentId',segment.id,
           'quoteStartMs',receipt.capture_start_ms,
           'quoteEndMs',receipt.capture_end_ms
         ) ORDER BY receipt.capture_start_ms,segment.sequence)
    INTO matched_count,evidence
    FROM jsonb_array_elements_text(p_segment_ids) requested(segment_id)
    JOIN public.agenda_meeting_transcript_segments segment
      ON segment.id=requested.segment_id::uuid AND segment.session_id=p_session_id
    JOIN public.agenda_meeting_segment_receipts receipt ON receipt.id=segment.receipt_id;
  IF matched_count <> requested_count OR (
    SELECT count(DISTINCT item) FROM jsonb_array_elements_text(p_segment_ids) item
  ) <> requested_count THEN
    RAISE EXCEPTION 'AGENDA_MEETING_ANALYSIS_EVIDENCE_INVALID';
  END IF;
  RETURN evidence;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_complete_analysis_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_transcript_version_id uuid,
  p_result jsonb,
  p_provider_response_id text,
  p_usage jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.agenda_meeting_processing_jobs%ROWTYPE;
  meeting public.agenda_meeting_sessions%ROWTYPE;
  transcript public.agenda_meeting_transcript_versions%ROWTYPE;
  minutes_id uuid;
  minutes_version integer;
  insight_group record;
  analysis_item jsonb;
  analysis_position bigint;
  evidence jsonb;
  due_date_value date;
  suggested_user uuid;
BEGIN
  SELECT * INTO job
    FROM public.agenda_meeting_processing_jobs
   WHERE id=p_job_id AND lease_token=p_lease_token AND status='in_flight'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_JOB_LEASE_CONFLICT'; END IF;
  IF job.kind <> 'analysis_generate' OR job.transcript_version_id IS DISTINCT FROM p_transcript_version_id THEN
    RAISE EXCEPTION 'AGENDA_MEETING_JOB_KIND_CONFLICT';
  END IF;
  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id=job.session_id FOR UPDATE;
  SELECT * INTO transcript FROM public.agenda_meeting_transcript_versions
   WHERE id=p_transcript_version_id AND session_id=meeting.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_TRANSCRIPT_NOT_READY'; END IF;
  IF cardinality(transcript.missing_sequences)>0 AND meeting.partial_analysis_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'AGENDA_MEETING_PARTIAL_ANALYSIS_CONFIRMATION_REQUIRED';
  END IF;
  IF jsonb_typeof(p_result) <> 'object'
     OR NULLIF(btrim(p_result->>'title'),'') IS NULL
     OR NULLIF(btrim(p_result->>'executiveSummary'),'') IS NULL
     OR NULLIF(btrim(p_result->>'minutesMarkdown'),'') IS NULL
     OR NULLIF(btrim(p_result->>'analysisModel'),'') IS NULL
     OR NULLIF(btrim(p_result->>'promptVersion'),'') IS NULL
     OR NULLIF(btrim(p_result->>'schemaVersion'),'') IS NULL
     OR jsonb_typeof(p_result->'decisions') <> 'array'
     OR jsonb_typeof(p_result->'pendingItems') <> 'array'
     OR jsonb_typeof(p_result->'risks') <> 'array'
     OR jsonb_typeof(p_result->'importantPoints') <> 'array'
     OR jsonb_typeof(p_result->'nextSteps') <> 'array'
     OR jsonb_typeof(p_result->'nextMeetings') <> 'array'
     OR jsonb_typeof(p_result->'actionItems') <> 'array' THEN
    RAISE EXCEPTION 'AGENDA_MEETING_ANALYSIS_SCHEMA_INVALID';
  END IF;

  UPDATE public.agenda_meeting_minutes_versions
     SET status='superseded'
   WHERE session_id=meeting.id AND status IN ('draft','changes_requested');
  SELECT COALESCE(max(version),0)+1 INTO minutes_version
    FROM public.agenda_meeting_minutes_versions WHERE session_id=meeting.id;
  INSERT INTO public.agenda_meeting_minutes_versions (
    session_id,org_id,event_id,transcript_version_id,version,status,title,summary,
    minutes_markdown,transcript_coverage,analysis_model,reasoning_effort,prompt_version,schema_version,
    provider_response_id,provider_usage
  ) VALUES (
    meeting.id,meeting.org_id,meeting.event_id,transcript.id,minutes_version,'draft',
    btrim(p_result->>'title'),btrim(p_result->>'executiveSummary'),btrim(p_result->>'minutesMarkdown'),
    CASE WHEN cardinality(transcript.missing_sequences)>0 THEN 'with_gaps' ELSE 'complete' END,
    btrim(p_result->>'analysisModel'),COALESCE(NULLIF(btrim(p_result->>'reasoningEffort'),''),'medium'),
    btrim(p_result->>'promptVersion'),btrim(p_result->>'schemaVersion'),
    NULLIF(btrim(p_provider_response_id),''),
    CASE WHEN jsonb_typeof(COALESCE(p_usage,'{}'::jsonb))='object' THEN COALESCE(p_usage,'{}'::jsonb) ELSE '{}'::jsonb END
  ) RETURNING id INTO minutes_id;

  FOR insight_group IN
    SELECT * FROM (VALUES
      ('decisions','decision'),('pendingItems','pending_item'),('risks','risk'),
      ('importantPoints','important_point'),('nextSteps','next_step'),('nextMeetings','next_meeting')
    ) AS groups(json_key,insight_type)
  LOOP
    FOR analysis_item,analysis_position IN
      SELECT item.value,item.ordinality
        FROM jsonb_array_elements(p_result -> (insight_group.json_key)) WITH ORDINALITY item(value,ordinality)
    LOOP
      IF jsonb_typeof(analysis_item) <> 'object'
         OR NULLIF(btrim(analysis_item->>'title'),'') IS NULL
         OR NULLIF(btrim(analysis_item->>'detail'),'') IS NULL THEN
        RAISE EXCEPTION 'AGENDA_MEETING_ANALYSIS_SCHEMA_INVALID';
      END IF;
      evidence := public.agenda_meeting_analysis_evidence(meeting.id,analysis_item->'evidenceSegmentIds');
      INSERT INTO public.agenda_meeting_insights (
        session_id,org_id,event_id,minutes_version_id,insight_type,position,title,description,evidence
      ) VALUES (
        meeting.id,meeting.org_id,meeting.event_id,minutes_id,insight_group.insight_type,
        analysis_position-1,btrim(analysis_item->>'title'),btrim(analysis_item->>'detail'),evidence
      );
    END LOOP;
  END LOOP;

  FOR analysis_item,analysis_position IN
    SELECT item.value,item.ordinality
      FROM jsonb_array_elements(p_result->'actionItems') WITH ORDINALITY item(value,ordinality)
  LOOP
    IF jsonb_typeof(analysis_item) <> 'object'
       OR NULLIF(btrim(analysis_item->>'title'),'') IS NULL
       OR NULLIF(btrim(analysis_item->>'description'),'') IS NULL THEN
      RAISE EXCEPTION 'AGENDA_MEETING_ANALYSIS_SCHEMA_INVALID';
    END IF;
    evidence := public.agenda_meeting_analysis_evidence(meeting.id,analysis_item->'evidenceSegmentIds');
    due_date_value := CASE WHEN NULLIF(btrim(analysis_item->>'dueDate'),'') IS NULL
                           THEN NULL ELSE (analysis_item->>'dueDate')::date END;
    suggested_user := CASE WHEN NULLIF(btrim(analysis_item->>'suggestedMemberId'),'') IS NULL
                           THEN NULL ELSE (analysis_item->>'suggestedMemberId')::uuid END;
    INSERT INTO public.agenda_meeting_action_items (
      session_id,org_id,event_id,minutes_version_id,position,title,description,responsible_text,
      suggested_user_id,due_date_text,due_date,due_date_confirmed,status,evidence
    ) VALUES (
      meeting.id,meeting.org_id,meeting.event_id,minutes_id,analysis_position-1,
      btrim(analysis_item->>'title'),btrim(analysis_item->>'description'),
      NULLIF(btrim(analysis_item->>'responsibleText'),''),suggested_user,
      NULLIF(btrim(analysis_item->>'dueDateText'),''),due_date_value,false,'proposed',evidence
    );
  END LOOP;

  UPDATE public.agenda_meeting_processing_jobs
     SET status='succeeded',lease_token=NULL,lease_expires_at=NULL,completed_at=now(),updated_at=now()
   WHERE id=job.id;
  UPDATE public.agenda_meeting_sessions
     SET processing_state='review_required',analysis_model=btrim(p_result->>'analysisModel'),
         analysis_reasoning_effort=COALESCE(NULLIF(btrim(p_result->>'reasoningEffort'),''),'medium'),
         last_error_code=NULL,last_error_at=NULL,version=version+1,updated_at=now()
   WHERE id=meeting.id RETURNING * INTO meeting;
  PERFORM public.agenda_meeting_write_audit(
    meeting.id,NULL,'service','analysis_version_created','minutes_version',minutes_id,NULL,
    jsonb_build_object(
      'minutesVersion',minutes_version,'analysisModel',meeting.analysis_model,
      'promptVersion',p_result->>'promptVersion','schemaVersion',p_result->>'schemaVersion',
      'coverage',CASE WHEN cardinality(transcript.missing_sequences)>0 THEN 'with_gaps' ELSE 'complete' END
    )
  );
  RETURN jsonb_build_object('jobId',job.id,'minutesVersionId',minutes_id,'session',public.agenda_meeting_session_summary_json(meeting.id));
END;
$$;

REVOKE ALL ON FUNCTION public.agenda_meeting_claim_jobs(integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_expire_stale_captures(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_fail_job(uuid,uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_complete_assemble_job(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_strip_text_overlap(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_analysis_evidence(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_complete_analysis_job(uuid,uuid,uuid,jsonb,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_claim_jobs(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_expire_stale_captures(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_fail_job(uuid,uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_complete_assemble_job(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_strip_text_overlap(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_analysis_evidence(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_complete_analysis_job(uuid,uuid,uuid,jsonb,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_agenda_meeting_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  worker_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO worker_secret
    FROM vault.decrypted_secrets
   WHERE name='agenda_meeting_worker_service_role_key'
   LIMIT 1;
  IF NULLIF(worker_secret,'') IS NULL THEN RETURN NULL; END IF;
  SELECT net.http_post(
    url := 'https://btfaumhroqtqzxomqorx.supabase.co/functions/v1/agenda-meeting-worker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || worker_secret
    ),
    body := '{}'::jsonb
  ) INTO request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_agenda_meeting_worker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_agenda_meeting_worker() TO service_role;

DO $schedule$
DECLARE existing_job bigint;
BEGIN
  SELECT jobid INTO existing_job FROM cron.job WHERE jobname='agenda-meeting-worker-every-minute';
  IF existing_job IS NOT NULL THEN PERFORM cron.unschedule(existing_job); END IF;
  PERFORM cron.schedule(
    'agenda-meeting-worker-every-minute','* * * * *',
    'SELECT public.invoke_agenda_meeting_worker();'
  );
END
$schedule$;
