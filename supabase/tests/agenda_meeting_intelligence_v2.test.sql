BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(51);

-- Stable fixture identifiers make failures reproducible and keep this test
-- independent from production rows. Everything is rolled back at the end.
INSERT INTO public.organizations (id, nome) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Agenda Meeting Test A'),
  ('00000000-0000-4000-8000-000000000002', 'Agenda Meeting Test B');

INSERT INTO public.org_members (org_id, user_id, role, nome_exibicao, is_active) VALUES
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'admin', 'Admin A', true),
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'operador', 'Criador A', true),
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'operador', 'Responsável A', true),
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'operador', 'Comissão A', true),
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'leitura', 'Leitura A', true),
  ('00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000006', 'admin', 'Admin B', true);

INSERT INTO public.cronograma_eventos (id, org_id, source_key, title) VALUES
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'meeting-test-a', 'Reunião A'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'meeting-test-b', 'Reunião B');

INSERT INTO public.cronograma_evento_responsaveis (
  event_id, org_id, org_member_user_id, responsible_type, name_snapshot
) VALUES (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'member',
  'Responsável A'
);

INSERT INTO public.commissions (id, org_id, slug, nome) VALUES (
  '30000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'meeting-test-commission',
  'Comissão Meeting Test'
);
INSERT INTO public.cronograma_evento_comissoes (event_id, org_id, commission_id, commission_slug) VALUES (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'meeting-test-commission'
);
INSERT INTO public.commission_responsibles (
  commission_id, org_id, user_id, display_name, responsible_type
) VALUES (
  '30000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004',
  'Comissão A',
  'pessoa'
);

INSERT INTO public.agenda_meeting_sessions (
  id, org_id, event_id, started_by, client_session_key, capture_state, event_context
) VALUES (
  '40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000001',
  'recording',
  '{"title":"Reunião A","responsibles":[],"commissions":[]}'::jsonb
);

INSERT INTO public.agenda_meeting_audit_events (
  id, session_id, org_id, event_id, actor_kind, action, entity_type
) VALUES (
  '60000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'service', 'fixture_created', 'session'
);

-- Schema, grants, publication and invariant checks.
SELECT is((
  SELECT count(*) FROM information_schema.tables
   WHERE table_schema='public' AND table_name LIKE 'agenda_meeting_%'
), 13::bigint, 'all thirteen meeting tables exist');

SELECT is((
  SELECT count(*) FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
  WHERE namespace.nspname='public' AND relation.relname LIKE 'agenda_meeting_%'
    AND relation.relkind='r' AND relation.relrowsecurity
), 13::bigint, 'RLS is enabled on every meeting table');

SELECT ok((
  SELECT bool_and(NOT has_table_privilege('authenticated', format('public.%I', table_name), privilege))
  FROM information_schema.tables
  CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE']) privilege
  WHERE table_schema='public' AND table_name LIKE 'agenda_meeting_%'
), 'authenticated users have no direct meeting write grants');

SELECT ok(
  NOT has_table_privilege('authenticated','public.agenda_meeting_processing_jobs','SELECT')
  AND NOT has_table_privilege('authenticated','public.agenda_meeting_mutation_receipts','SELECT'),
  'worker jobs and mutation receipts are internal only'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.agenda_meeting_event_accessible(uuid,uuid,uuid)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.agenda_meeting_session_readable(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'row policies remain executable without exposing the arbitrary-user event helper'
);

SELECT is((
  SELECT count(*) FROM information_schema.columns
   WHERE table_schema='public' AND table_name LIKE 'agenda_meeting_%' AND data_type='bytea'
), 0::bigint, 'meeting schema contains no binary columns');

SELECT is((
  SELECT count(*) FROM information_schema.columns
   WHERE table_schema='public' AND table_name LIKE 'agenda_meeting_%'
     AND column_name ~* '(^audio|blob|binary|storage|object_path|file_path)'
), 0::bigint, 'meeting schema contains no audio or storage path columns');

SELECT is(
  public.agenda_meeting_strip_text_overlap(
    'Precisamos fechar o contrato até sexta',
    'contrato até sexta e avisar a comissão'
  ),
  'e avisar a comissão',
  'overlapping textual boundaries are deduplicated deterministically'
);

SELECT is((
  SELECT array_agg(tablename::text ORDER BY tablename)
    FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND tablename LIKE 'agenda_meeting_%'
), ARRAY['agenda_meeting_segment_receipts','agenda_meeting_sessions']::text[],
  'Realtime publishes only lifecycle state and receipt metadata');

SELECT is((
  SELECT count(*) FROM (VALUES
    ('public.agenda_meeting_control(text,uuid,uuid,uuid,uuid,uuid,bigint,jsonb)'),
    ('public.agenda_meeting_prepare_segment(uuid,uuid,uuid,integer,bigint,bigint,text,bigint,text,uuid,text,timestamptz)'),
    ('public.agenda_meeting_complete_segment(text,text,text,uuid,text,jsonb,bigint,numeric)'),
    ('public.agenda_meeting_claim_jobs(integer,integer)'),
    ('public.agenda_meeting_fail_job(uuid,uuid,text,integer)'),
    ('public.agenda_meeting_complete_assemble_job(uuid,uuid)'),
    ('public.agenda_meeting_complete_analysis_job(uuid,uuid,uuid,jsonb,text,jsonb)'),
    ('public.agenda_meeting_actor_allowed(uuid,text,uuid,uuid,uuid)')
  ) expected(signature)
  WHERE to_regprocedure(expected.signature) IS NOT NULL
), 8::bigint, 'server-authoritative control, callback and worker RPCs exist');

SELECT is((
  SELECT count(*) FROM pg_trigger
   WHERE tgname IN ('agenda_meeting_audit_append_only','agenda_meeting_tombstones_append_only')
     AND NOT tgisinternal
), 2::bigint, 'audit and tombstone append-only triggers exist');

SELECT ok(EXISTS (
  SELECT 1 FROM pg_constraint WHERE conname='agenda_meeting_jobs_dedupe_key'
), 'processing jobs have a database dedupe constraint');

SELECT ok(EXISTS (
  SELECT 1 FROM pg_constraint
   WHERE conrelid='public.agenda_meeting_minutes_versions'::regclass
     AND contype='c' AND pg_get_constraintdef(oid) LIKE '%transcript_coverage%'
), 'minutes persist complete or with-gaps coverage');

SELECT is((
  SELECT count(*) FROM storage.buckets
   WHERE name ~* '(agenda|fenasoja).*(meeting|reuniao|reunião)'
), 0::bigint, 'no meeting audio bucket exists');

-- Authorization matrix: active membership plus event/session scope.
SELECT ok(public.agenda_meeting_actor_allowed(
  '10000000-0000-4000-8000-000000000001','start',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',NULL
), 'admin can start a scoped meeting');
SELECT ok(public.agenda_meeting_actor_allowed(
  '10000000-0000-4000-8000-000000000003','start',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',NULL
), 'current event responsible can start');
SELECT ok(public.agenda_meeting_actor_allowed(
  '10000000-0000-4000-8000-000000000004','start',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',NULL
), 'active linked commission member can start');
SELECT ok(public.agenda_meeting_actor_allowed(
  '10000000-0000-4000-8000-000000000002','detail',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001'
), 'session creator can read the session');
SELECT ok(public.agenda_meeting_actor_allowed(
  '10000000-0000-4000-8000-000000000002','review_minutes',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001'
), 'operational session creator can review');
SELECT ok(NOT public.agenda_meeting_actor_allowed(
  '10000000-0000-4000-8000-000000000005','start',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',NULL
), 'read-only member cannot start');
SELECT ok(NOT public.agenda_meeting_actor_allowed(
  '10000000-0000-4000-8000-000000000005','detail',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001'
), 'unscoped read-only member cannot read a meeting');
SELECT ok(NOT public.agenda_meeting_actor_allowed(
  '10000000-0000-4000-8000-000000000006','detail',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001'
), 'membership in another organization never grants access');
SELECT ok(NOT public.agenda_meeting_actor_allowed(
  '10000000-0000-4000-8000-000000000099','list',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',NULL
), 'non-member cannot list sessions');

SELECT is((public.agenda_meeting_control(
  'resume','10000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',
  NULL,'{"resumedAfterInterruption":true}'::jsonb
)->'session'->>'captureState'), 'recording',
  'resume reconciles a dropped interruption pause idempotently');

-- Segment identity, callback replay and provider receipt semantics.
SELECT throws_ok($test$
  SELECT public.agenda_meeting_prepare_segment(
    '10000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000099',10001,0,30000,'audio/webm;codecs=opus',1024,
    repeat('a',64),'80000000-0000-4000-8000-000000000099',repeat('b',64),now()+interval '15 minutes'
  )
$test$, 'P0001', 'AGENDA_MEETING_INVALID_SEGMENT', 'excessive segment sequences are rejected server-side');

SELECT is((public.agenda_meeting_prepare_segment(
  '10000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',0,0,30000,'audio/webm;codecs=opus',1024,
  repeat('a',64),'80000000-0000-4000-8000-000000000001',repeat('b',64),now()+interval '15 minutes'
)->>'status'), 'accepted', 'first valid segment is accepted');

SELECT throws_ok($test$
  SELECT public.agenda_meeting_prepare_segment(
    '10000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',0,0,30000,'audio/webm;codecs=opus',1024,
    repeat('f',64),'80000000-0000-4000-8000-000000000002',repeat('d',64),now()+interval '15 minutes'
  )
$test$, 'P0001', 'AGENDA_MEETING_SEGMENT_CONFLICT', 'a divergent hash cannot replace an accepted sequence');

SELECT is((public.agenda_meeting_complete_segment(
  repeat('b',64),repeat('c',64),'deepgram-request-test',
  (SELECT attempt_id FROM public.agenda_meeting_segment_receipts
    WHERE session_id='40000000-0000-4000-8000-000000000001' AND sequence=0),
  'Maria confirmou o encaminhamento.','[]'::jsonb,30000,0.98
)->>'duplicate')::boolean, false, 'first provider callback becomes canonical');

SELECT is((public.agenda_meeting_complete_segment(
  repeat('b',64),repeat('c',64),'deepgram-request-test',
  (SELECT attempt_id FROM public.agenda_meeting_segment_receipts
    WHERE session_id='40000000-0000-4000-8000-000000000001' AND sequence=0),
  'Maria confirmou o encaminhamento.','[]'::jsonb,30000,0.98
)->>'duplicate')::boolean, true, 'identical callback replay is idempotent');

SELECT throws_ok($test$
  SELECT public.agenda_meeting_complete_segment(
    repeat('b',64),repeat('e',64),'deepgram-request-test',
    (SELECT attempt_id FROM public.agenda_meeting_segment_receipts
      WHERE session_id='40000000-0000-4000-8000-000000000001' AND sequence=0),
    'Conteúdo divergente.','[]'::jsonb,30000,0.98
  )
$test$, 'P0001', 'AGENDA_MEETING_CALLBACK_REPLAY_CONFLICT', 'divergent callback replay is rejected');

SELECT is((public.agenda_meeting_prepare_segment(
  '10000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000002',1,30000,60000,'audio/webm;codecs=opus',1024,
  repeat('e',64),'80000000-0000-4000-8000-000000000003',repeat('f',64),now()+interval '15 minutes'
)->>'status'), 'accepted', 'retry budget fixture is initially accepted');
UPDATE public.agenda_meeting_segment_receipts
   SET status='retryable_error',attempt_count=5,updated_at=now()-interval '16 minutes'
 WHERE session_id='40000000-0000-4000-8000-000000000001' AND sequence=1;
SELECT is((public.agenda_meeting_prepare_segment(
  '10000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000002',1,30000,60000,'audio/webm;codecs=opus',1024,
  repeat('e',64),'80000000-0000-4000-8000-000000000004',repeat('1',64),now()+interval '15 minutes'
)->>'status'), 'terminal_error', 'a sixth online submission is rejected terminally');
SELECT is((public.agenda_meeting_prepare_segment(
  '10000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000002',1,30000,60000,'audio/webm;codecs=opus',1024,
  repeat('e',64),'80000000-0000-4000-8000-000000000005',repeat('2',64),now()+interval '15 minutes'
)->>'shouldForward')::boolean, false, 'retry-exhausted audio is never forwarded again');

UPDATE public.agenda_meeting_sessions
   SET capture_state='recording',heartbeat_at=now()-interval '10 minutes'
 WHERE id='40000000-0000-4000-8000-000000000001';
SELECT is(public.agenda_meeting_expire_stale_captures(180),1,'stale active capture is recovered by heartbeat');
SELECT is((
  SELECT capture_state FROM public.agenda_meeting_sessions
   WHERE id='40000000-0000-4000-8000-000000000001'
),'interrupted','stale capture becomes explicitly interrupted');

-- Lease, retry, stale recovery and dead-letter behavior.
INSERT INTO public.agenda_meeting_processing_jobs (
  id,session_id,org_id,event_id,kind,dedupe_key,max_attempts
) VALUES (
  '90000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  'assemble_transcript','test-retry',2
);
SELECT is((SELECT count(*) FROM public.agenda_meeting_claim_jobs(1,30)), 1::bigint, 'queued worker job is claimed atomically');
SELECT is((public.agenda_meeting_fail_job(
  '90000000-0000-4000-8000-000000000001',
  (SELECT lease_token FROM public.agenda_meeting_processing_jobs WHERE id='90000000-0000-4000-8000-000000000001'),
  'Provider 429 / timeout',30
)->>'status'), 'retry_wait', 'retryable worker failure is backed off');

INSERT INTO public.agenda_meeting_processing_jobs (
  id,session_id,org_id,event_id,kind,dedupe_key,max_attempts
) VALUES (
  '90000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  'assemble_transcript','test-dead-letter',1
);
SELECT is((SELECT count(*) FROM public.agenda_meeting_claim_jobs(1,30)), 1::bigint, 'terminal test job is claimed');
SELECT is((public.agenda_meeting_fail_job(
  '90000000-0000-4000-8000-000000000002',
  (SELECT lease_token FROM public.agenda_meeting_processing_jobs WHERE id='90000000-0000-4000-8000-000000000002'),
  'provider rejected',0
)->>'status'), 'dead_letter', 'terminal worker failure is dead-lettered');

INSERT INTO public.agenda_meeting_processing_jobs (
  id,session_id,org_id,event_id,kind,dedupe_key,status,attempts,max_attempts,lease_token,lease_expires_at
) VALUES (
  '90000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  'assemble_transcript','test-stale','in_flight',1,3,
  '91000000-0000-4000-8000-000000000003',now()-interval '1 minute'
);
SELECT is((SELECT count(*) FROM public.agenda_meeting_claim_jobs(1,30)), 1::bigint, 'expired non-terminal lease is reclaimed');
SELECT is((
  SELECT attempts FROM public.agenda_meeting_processing_jobs WHERE id='90000000-0000-4000-8000-000000000003'
), 2, 'stale recovery increments the attempt counter');

-- Invalid evidence fails after the minutes insert is attempted; PostgreSQL's
-- statement transaction must leave no partial minutes, insights or actions.
INSERT INTO public.agenda_meeting_transcript_versions (
  id,session_id,org_id,event_id,version,kind,transcript_text,content_hash,is_complete
) VALUES (
  '92000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  1,'canonical','Maria confirmou o encaminhamento.',repeat('9',64),true
);
INSERT INTO public.agenda_meeting_processing_jobs (
  id,session_id,org_id,event_id,transcript_version_id,kind,dedupe_key,status,attempts,lease_token,lease_expires_at
) VALUES (
  '90000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001','analysis_generate','test-atomic','in_flight',1,
  '91000000-0000-4000-8000-000000000004',now()+interval '5 minutes'
);
SELECT throws_ok($test$
  SELECT public.agenda_meeting_complete_analysis_job(
    '90000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000004',
    '92000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'title','Ata','executiveSummary','Resumo','minutesMarkdown','Ata completa',
      'analysisModel','gpt-5.6-terra','reasoningEffort','medium',
      'promptVersion','test','schemaVersion','test',
      'decisions',jsonb_build_array(jsonb_build_object(
        'title','Sem fonte','detail','Não sustentado',
        'evidenceSegmentIds',jsonb_build_array('93000000-0000-4000-8000-000000000099')
      )),
      'pendingItems','[]'::jsonb,'risks','[]'::jsonb,'importantPoints','[]'::jsonb,
      'nextSteps','[]'::jsonb,'nextMeetings','[]'::jsonb,'actionItems','[]'::jsonb
    ),'response-test','{}'::jsonb
  )
$test$, 'P0001', 'AGENDA_MEETING_ANALYSIS_EVIDENCE_INVALID', 'unknown analysis evidence rejects the whole transaction');
SELECT is((
  SELECT count(*) FROM public.agenda_meeting_minutes_versions
   WHERE session_id='40000000-0000-4000-8000-000000000001'
), 0::bigint, 'invalid analysis persists no partial minutes');

SELECT throws_ok(
  $$UPDATE public.agenda_meeting_audit_events SET action='tampered' WHERE id='60000000-0000-4000-8000-000000000001'$$,
  'P0001','AGENDA_MEETING_APPEND_ONLY','audit rows cannot be updated even by an internal caller'
);
SELECT throws_ok(
  $$DELETE FROM public.agenda_meeting_audit_events WHERE id='60000000-0000-4000-8000-000000000001'$$,
  'P0001','AGENDA_MEETING_APPEND_ONLY','audit rows cannot be directly deleted'
);

-- Exercise the actual SELECT policies under authenticated JWT identities.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.agenda_meeting_sessions),1::bigint,'admin sees the organization session through RLS');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.agenda_meeting_sessions),1::bigint,'creator sees the own session through RLS');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.agenda_meeting_sessions),1::bigint,'event responsible sees the session through RLS');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.agenda_meeting_sessions),1::bigint,'commission member sees the session through RLS');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.agenda_meeting_sessions),0::bigint,'unscoped reader cannot see meeting text or state');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.agenda_meeting_sessions),0::bigint,'other organization admin is isolated by RLS');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
