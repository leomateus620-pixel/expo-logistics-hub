-- Immutable report evidence and durable, leased artifact jobs. No commercial facts change.
CREATE TABLE IF NOT EXISTS workers_private.commercial_report_snapshots (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES public.organizations(id), user_id uuid NOT NULL,
 project_id uuid NOT NULL REFERENCES public.map_projects(id), conversation_id uuid NOT NULL,
 request_id uuid NOT NULL, generation text NOT NULL, payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 FOREIGN KEY(conversation_id,org_id,user_id) REFERENCES public.ai_conversations(id,org_id,user_id),
 UNIQUE(user_id,request_id)
);
CREATE TABLE IF NOT EXISTS workers_private.commercial_report_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), snapshot_id uuid NOT NULL REFERENCES workers_private.commercial_report_snapshots(id),
 org_id uuid NOT NULL, user_id uuid NOT NULL, project_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','rendering','ready','error','expired')),
 template_version text NOT NULL DEFAULT 'fenasoja-commercial-v1', attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 lease_until timestamptz, lease_token uuid, upload_paths text[] NOT NULL DEFAULT '{}', object_path text, file_size integer, page_count integer, sha256 text,
 error_code text CHECK(error_code IS NULL OR error_code IN('renderer_failed','lease_exhausted')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 UNIQUE(snapshot_id,template_version)
);
CREATE TABLE IF NOT EXISTS workers_private.commercial_report_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, report_id uuid NOT NULL REFERENCES workers_private.commercial_report_jobs(id),
 user_id uuid, kind text NOT NULL CHECK(kind IN('requested','rendering','ready','error','download','expired')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_report_snapshot_actor ON workers_private.commercial_report_snapshots(org_id,user_id,project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS commercial_report_queue ON workers_private.commercial_report_jobs(status,lease_until,created_at);
CREATE INDEX IF NOT EXISTS commercial_report_actor ON workers_private.commercial_report_jobs(org_id,user_id,project_id,created_at DESC);
ALTER TABLE workers_private.commercial_report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers_private.commercial_report_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers_private.commercial_report_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workers_private.commercial_report_snapshots,workers_private.commercial_report_jobs,workers_private.commercial_report_events FROM PUBLIC,anon,authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('workers-commercial-reports','workers-commercial-reports',false,52428800,ARRAY['application/pdf']) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.workers_commercial_report_store(_org_id uuid,_user_id uuid,_conversation_id uuid,_request_id uuid,_snapshot jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workers_private,pg_temp AS $$
DECLARE sid uuid:=(_snapshot->>'snapshotId')::uuid; pid uuid:=(_snapshot#>>'{spec,projectId}')::uuid; prior workers_private.commercial_report_snapshots;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.ai_conversations WHERE id=_conversation_id AND org_id=_org_id AND user_id=_user_id)
 OR NOT EXISTS(SELECT 1 FROM public.map_projects WHERE id=pid AND org_id=_org_id AND NOT is_archived)
 OR _snapshot#>>'{scope,projectId}' IS DISTINCT FROM pid::text
 OR _snapshot->>'schemaVersion' IS DISTINCT FROM '1'
 OR _snapshot->>'generation' !~ '^[a-f0-9]{32,64}$' OR octet_length(_snapshot::text)>40000000 THEN RAISE EXCEPTION 'REPORT_INVALID_SNAPSHOT' USING ERRCODE='22023';END IF;
 SELECT * INTO prior FROM workers_private.commercial_report_snapshots WHERE id=sid AND user_id=_user_id AND org_id=_org_id;
 IF FOUND THEN
  IF prior.conversation_id<>_conversation_id OR prior.project_id<>pid OR prior.request_id<>_request_id THEN RAISE EXCEPTION 'REPORT_IDEMPOTENCY_CONFLICT' USING ERRCODE='22023'; END IF;
  IF prior.payload IS DISTINCT FROM _snapshot THEN RAISE EXCEPTION 'REPORT_IMMUTABLE' USING ERRCODE='22023';END IF;
  RETURN prior.id;
 END IF;
 SELECT * INTO prior FROM workers_private.commercial_report_snapshots WHERE user_id=_user_id AND request_id=_request_id;
 IF FOUND THEN
  IF prior.org_id<>_org_id OR prior.conversation_id<>_conversation_id OR prior.project_id<>pid THEN RAISE EXCEPTION 'REPORT_IDEMPOTENCY_CONFLICT' USING ERRCODE='22023'; END IF;
  RETURN prior.id;
 END IF;
 INSERT INTO workers_private.commercial_report_snapshots(id,org_id,user_id,project_id,conversation_id,request_id,generation,payload)
 VALUES(sid,_org_id,_user_id,pid,_conversation_id,_request_id,_snapshot->>'generation',_snapshot)
 ON CONFLICT(user_id,request_id) DO NOTHING;
 SELECT id INTO sid FROM workers_private.commercial_report_snapshots WHERE user_id=_user_id AND request_id=_request_id;
 RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.workers_commercial_report_store(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workers_commercial_report_store(uuid,uuid,uuid,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.workers_commercial_report_snapshot(_org_id uuid,_snapshot_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,workers_private,pg_temp AS $$
DECLARE s workers_private.commercial_report_snapshots; caps jsonb;
BEGIN
 SELECT * INTO s FROM workers_private.commercial_report_snapshots WHERE id=_snapshot_id AND org_id=_org_id AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_FORBIDDEN' USING ERRCODE='42501';END IF;
 caps:=public.workers_commercial_report_authorize(s.project_id);
 IF caps->>'orgId' IS DISTINCT FROM _org_id::text THEN RAISE EXCEPTION 'REPORT_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF ((s.payload#>>'{capabilities,companyNames}')::boolean AND NOT (caps->>'companyNames')::boolean)
 OR ((s.payload#>>'{capabilities,monetaryValues}')::boolean AND NOT (caps->>'monetaryValues')::boolean)
 OR ((s.payload#>>'{capabilities,contractReferences}')::boolean AND NOT (caps->>'contractReferences')::boolean) THEN RAISE EXCEPTION 'REPORT_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF s.expires_at<=now() THEN RAISE EXCEPTION 'REPORT_EXPIRED' USING ERRCODE='22023';END IF;
 RETURN s.payload;
END $$;
REVOKE ALL ON FUNCTION public.workers_commercial_report_snapshot(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workers_commercial_report_snapshot(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION workers_private.commercial_report_view(j workers_private.commercial_report_jobs)
RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('id',j.id,'status',CASE WHEN j.expires_at<=now() THEN 'expired' ELSE j.status END,'expiresAt',j.expires_at,'pageCount',j.page_count,'fileSize',j.file_size,'errorCode',j.error_code) $$;
REVOKE ALL ON FUNCTION workers_private.commercial_report_view(workers_private.commercial_report_jobs) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.workers_commercial_report_prepare(_org_id uuid,_snapshot_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workers_private,pg_temp AS $$
DECLARE s workers_private.commercial_report_snapshots; j workers_private.commercial_report_jobs;
BEGIN
 PERFORM public.workers_commercial_report_snapshot(_org_id,_snapshot_id);
 SELECT * INTO s FROM workers_private.commercial_report_snapshots WHERE id=_snapshot_id;
 INSERT INTO workers_private.commercial_report_jobs(snapshot_id,org_id,user_id,project_id,expires_at)
 VALUES(s.id,s.org_id,s.user_id,s.project_id,s.expires_at) ON CONFLICT(snapshot_id,template_version) DO NOTHING RETURNING * INTO j;
 IF FOUND THEN INSERT INTO workers_private.commercial_report_events(report_id,user_id,kind) VALUES(j.id,auth.uid(),'requested');
 ELSE SELECT * INTO j FROM workers_private.commercial_report_jobs WHERE snapshot_id=s.id AND template_version='fenasoja-commercial-v1';END IF;
 -- Explicit retry keeps identity and snapshot. Leases bound attempts across double clicks.
 IF j.status='error' AND j.attempts<3 THEN UPDATE workers_private.commercial_report_jobs SET status='requested',error_code=NULL,updated_at=now() WHERE id=j.id RETURNING * INTO j;END IF;
 RETURN workers_private.commercial_report_view(j);
END $$;
CREATE OR REPLACE FUNCTION public.workers_commercial_report_status(_org_id uuid,_snapshot_id uuid,_report_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workers_private,pg_temp AS $$
DECLARE j workers_private.commercial_report_jobs;
BEGIN
 PERFORM public.workers_commercial_report_snapshot(_org_id,_snapshot_id);
 SELECT * INTO j FROM workers_private.commercial_report_jobs WHERE snapshot_id=_snapshot_id AND (_report_id IS NULL OR id=_report_id) AND user_id=auth.uid();
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN workers_private.commercial_report_view(j);
END $$;
CREATE OR REPLACE FUNCTION public.workers_commercial_report_download(_org_id uuid,_snapshot_id uuid,_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workers_private,pg_temp AS $$
DECLARE j workers_private.commercial_report_jobs;
BEGIN
 PERFORM public.workers_commercial_report_snapshot(_org_id,_snapshot_id);
 SELECT * INTO j FROM workers_private.commercial_report_jobs WHERE id=_report_id AND snapshot_id=_snapshot_id AND user_id=auth.uid();
 IF NOT FOUND OR j.status<>'ready' OR j.expires_at<=now() THEN RAISE EXCEPTION 'REPORT_NOT_READY' USING ERRCODE='22023';END IF;
 INSERT INTO workers_private.commercial_report_events(report_id,user_id,kind) VALUES(j.id,auth.uid(),'download');
 RETURN jsonb_build_object('objectPath',j.object_path,'sha256',j.sha256,'fileSize',j.file_size);
END $$;
REVOKE ALL ON FUNCTION public.workers_commercial_report_prepare(uuid,uuid),public.workers_commercial_report_status(uuid,uuid,uuid),public.workers_commercial_report_download(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workers_commercial_report_prepare(uuid,uuid),public.workers_commercial_report_status(uuid,uuid,uuid),public.workers_commercial_report_download(uuid,uuid,uuid) TO authenticated;

-- Internal worker only gets a previously authorized immutable payload. It never queries sales.
CREATE OR REPLACE FUNCTION public.workers_commercial_report_claim(_report_id uuid DEFAULT NULL,_worker_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workers_private,pg_temp AS $$
DECLARE j workers_private.commercial_report_jobs; s workers_private.commercial_report_snapshots;
BEGIN
 IF _worker_token IS NOT NULL AND NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='workers_commercial_report_worker_token' AND decrypted_secret=_worker_token) THEN RAISE EXCEPTION 'REPORT_FORBIDDEN' USING ERRCODE='42501';END IF;
 UPDATE workers_private.commercial_report_jobs SET status='error',error_code='lease_exhausted',lease_until=NULL,updated_at=now() WHERE status='rendering' AND lease_until<now() AND attempts>=3;
 SELECT * INTO j FROM workers_private.commercial_report_jobs WHERE (_report_id IS NULL OR id=_report_id) AND expires_at>now() AND attempts<3
 AND (status='requested' OR (status='rendering' AND lease_until<now())) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE workers_private.commercial_report_jobs SET status='rendering',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid(),updated_at=now() WHERE id=j.id RETURNING * INTO j;
 UPDATE workers_private.commercial_report_jobs SET upload_paths=array_append(upload_paths,concat(j.org_id,'/',j.user_id,'/',j.id,'/',j.lease_token,'.pdf')) WHERE id=j.id;
 SELECT * INTO s FROM workers_private.commercial_report_snapshots WHERE id=j.snapshot_id;
 INSERT INTO workers_private.commercial_report_events(report_id,kind) VALUES(j.id,'rendering');
 RETURN jsonb_build_object('id',j.id,'leaseToken',j.lease_token,'snapshot',s.payload,'objectPath',concat(j.org_id,'/',j.user_id,'/',j.id,'/',j.lease_token,'.pdf'));
END $$;
CREATE OR REPLACE FUNCTION public.workers_commercial_report_finish(_report_id uuid,_lease_token uuid,_success boolean,_file_size integer DEFAULT NULL,_page_count integer DEFAULT NULL,_sha256 text DEFAULT NULL,_object_path text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workers_private,pg_temp AS $$
DECLARE j workers_private.commercial_report_jobs;
BEGIN
 SELECT * INTO j FROM workers_private.commercial_report_jobs WHERE id=_report_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'rendering' OR j.lease_token IS DISTINCT FROM _lease_token OR j.lease_until<now() THEN RAISE EXCEPTION 'REPORT_LEASE_LOST' USING ERRCODE='40001';END IF;
 IF _success AND (_file_size IS NULL OR _file_size<=0 OR _file_size>52428800 OR _page_count IS NULL OR _page_count<1 OR _sha256 IS NULL OR _sha256 !~ '^[a-f0-9]{64}$' OR _object_path IS DISTINCT FROM concat(j.org_id,'/',j.user_id,'/',j.id,'/',j.lease_token,'.pdf')) THEN RAISE EXCEPTION 'REPORT_INVALID_ARTIFACT' USING ERRCODE='22023';END IF;
 UPDATE workers_private.commercial_report_jobs SET status=CASE WHEN _success THEN 'ready' ELSE 'error' END,error_code=CASE WHEN _success THEN NULL ELSE 'renderer_failed' END,
 file_size=_file_size,page_count=_page_count,sha256=_sha256,object_path=_object_path,lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=j.id;
 INSERT INTO workers_private.commercial_report_events(report_id,kind) VALUES(j.id,CASE WHEN _success THEN 'ready' ELSE 'error' END);
END $$;
REVOKE ALL ON FUNCTION public.workers_commercial_report_claim(uuid,text),public.workers_commercial_report_finish(uuid,uuid,boolean,integer,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workers_commercial_report_claim(uuid,text),public.workers_commercial_report_finish(uuid,uuid,boolean,integer,integer,text,text) TO service_role;

-- Retain files/evidence for 30 days; cleanup is mediated by the storage API worker.
CREATE OR REPLACE FUNCTION public.workers_commercial_report_expired_files()
RETURNS TABLE(id uuid,object_path text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH marked AS (UPDATE workers_private.commercial_report_jobs SET status='expired',updated_at=now() WHERE expires_at<=now() AND status<>'expired' RETURNING id)
 SELECT j.id,p FROM workers_private.commercial_report_jobs j CROSS JOIN unnest(j.upload_paths) p WHERE j.expires_at<=now() LIMIT 100
$$;
REVOKE ALL ON FUNCTION public.workers_commercial_report_expired_files() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workers_commercial_report_expired_files() TO service_role;

CREATE OR REPLACE FUNCTION public.workers_commercial_report_purge(_report_id uuid,_object_path text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- Acknowledgment follows a successful storage API removal of this exact leased
 -- object. Retrying never drops another lease's current artifact or cleanup path.
 IF _object_path IS NOT NULL THEN
  UPDATE workers_private.commercial_report_jobs SET upload_paths=array_remove(upload_paths,_object_path),
   object_path=CASE WHEN object_path=_object_path THEN NULL ELSE object_path END
   WHERE id=_report_id AND expires_at<=now();
 END IF;
 -- Includes expired errors, abandoned leases, and queries never exported. Run
 -- even when expired_files returns no paths. Retained metadata contains no rows.
 UPDATE workers_private.commercial_report_snapshots SET payload='{}'::jsonb WHERE id IN(
  SELECT s.id FROM workers_private.commercial_report_snapshots s WHERE s.expires_at<=now() AND s.payload<>'{}'::jsonb
   AND NOT EXISTS(SELECT 1 FROM workers_private.commercial_report_jobs j WHERE j.snapshot_id=s.id AND (cardinality(j.upload_paths)>0 OR j.object_path IS NOT NULL))
   ORDER BY s.expires_at LIMIT 100);
END $$;
REVOKE ALL ON FUNCTION public.workers_commercial_report_purge(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workers_commercial_report_purge(uuid,text) TO service_role;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='workers_commercial_report_worker_token') THEN
 PERFORM vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'workers_commercial_report_worker_token','Internal report queue dispatcher');END IF;
END $$;
CREATE OR REPLACE FUNCTION workers_private.dispatch_commercial_reports() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE token text;
BEGIN
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name='workers_commercial_report_worker_token';
 PERFORM net.http_post(url:='https://btfaumhroqtqzxomqorx.supabase.co/functions/v1/workers-commercial-reports',headers:=jsonb_build_object('Content-Type','application/json','x-report-worker-token',token),body:='{"operation":"process"}'::jsonb,timeout_milliseconds:=55000);
END $$;
REVOKE ALL ON FUNCTION workers_private.dispatch_commercial_reports() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='workers-commercial-reports') THEN PERFORM cron.schedule('workers-commercial-reports','* * * * *','SELECT workers_private.dispatch_commercial_reports()');END IF;
END $$;
NOTIFY pgrst,'reload schema';
