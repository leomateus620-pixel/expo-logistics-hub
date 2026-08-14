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
