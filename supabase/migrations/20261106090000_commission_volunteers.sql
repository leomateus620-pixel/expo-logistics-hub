-- Institutional identity, unit membership and private contact. No account provisioning.
-- commission_responsibles IDs remain stable; only verified user_id joins identities.
CREATE SCHEMA IF NOT EXISTS team_private;
REVOKE ALL ON SCHEMA team_private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.commission_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 160),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  avatar_path text,
  legacy_photo boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, org_id), UNIQUE(org_id, user_id)
);
ALTER TABLE public.commission_people ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commission_people FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commission_people TO authenticated;
GRANT ALL ON public.commission_people TO service_role;
REVOKE ALL ON public.commission_people FROM anon;

ALTER TABLE public.commission_responsibles ADD COLUMN person_id uuid;
ALTER TABLE public.commission_responsibles ADD COLUMN version integer NOT NULL DEFAULT 1;
-- Record every old ID, including inactive records. Names alone never merge people.
WITH identities AS (
 SELECT DISTINCT ON (org_id, coalesce(user_id,id)) id,org_id,user_id,display_name
 FROM public.commission_responsibles ORDER BY org_id,coalesce(user_id,id),created_at,id
)
INSERT INTO public.commission_people(id,org_id,user_id,display_name,legacy_photo)
SELECT id,org_id,user_id,display_name,true FROM identities;
-- Backfill is metadata only: preserve timestamps and do not enqueue Google sync/notifications.
-- Restore each trigger's original mode in the same transaction; FK constraint triggers remain on.
DO $backfill$
DECLARE triggers jsonb; t record;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',tgname,'mode',tgenabled)),'[]'::jsonb) INTO triggers
 FROM pg_trigger WHERE tgrelid='public.commission_responsibles'::regclass AND NOT tgisinternal AND tgenabled IN ('O','A');
 FOR t IN SELECT * FROM jsonb_to_recordset(triggers) AS x(name text,mode text) LOOP
  EXECUTE format('ALTER TABLE public.commission_responsibles DISABLE TRIGGER %I',t.name);
 END LOOP;
 UPDATE public.commission_responsibles r SET person_id=p.id
FROM public.commission_people p WHERE p.org_id=r.org_id
AND ((r.user_id IS NOT NULL AND p.user_id=r.user_id) OR (r.user_id IS NULL AND p.id=r.id));
 FOR t IN SELECT * FROM jsonb_to_recordset(triggers) AS x(name text,mode text) LOOP
  EXECUTE format('ALTER TABLE public.commission_responsibles ENABLE %s TRIGGER %I',CASE WHEN t.mode='A' THEN 'ALWAYS' ELSE '' END,t.name);
 END LOOP;
END $backfill$;
ALTER TABLE public.commission_responsibles ALTER COLUMN person_id SET NOT NULL;
ALTER TABLE public.commission_responsibles ADD CONSTRAINT team_person_org_fk
 FOREIGN KEY(person_id,org_id) REFERENCES public.commission_people(id,org_id);
DROP INDEX public.commission_responsibles_unique_person;
CREATE UNIQUE INDEX team_unit_person_unique ON public.commission_responsibles(commission_id,person_id);
CREATE INDEX team_person_memberships ON public.commission_responsibles(org_id,person_id,active);
CREATE INDEX team_active_leadership ON public.commission_responsibles(user_id,commission_id)
 WHERE active AND relationship_role IN ('principal','corresponsavel','copresidente');
-- Writes go through scoped RPCs. Retire the old unrestricted institutional reseed entry point.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.commission_responsibles FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_official_units_2028(uuid) FROM PUBLIC, anon, authenticated;

CREATE TABLE team_private.contacts (
 org_id uuid NOT NULL,
 commission_id uuid NOT NULL,
 person_id uuid NOT NULL,
 email text NOT NULL CHECK(length(email)<=254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 PRIMARY KEY(commission_id,person_id),
 FOREIGN KEY(commission_id,person_id) REFERENCES public.commission_responsibles(commission_id,person_id),
 FOREIGN KEY(person_id,org_id) REFERENCES public.commission_people(id,org_id),
 FOREIGN KEY(commission_id,org_id) REFERENCES public.commissions(id,org_id),
 UNIQUE(commission_id,email), CHECK(email=lower(btrim(email)))
);
CREATE INDEX team_contact_reconciliation ON team_private.contacts(org_id,email);
CREATE TABLE team_private.reconciliation_queue (
 id uuid NOT NULL DEFAULT gen_random_uuid(), resolved_at timestamptz,
 org_id uuid NOT NULL,commission_id uuid NOT NULL,requested_by uuid NOT NULL,
 proposed_name text NOT NULL,proposed_email text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(commission_id,proposed_email)
);
ALTER TABLE team_private.reconciliation_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON team_private.reconciliation_queue FROM PUBLIC,anon,authenticated;
CREATE TABLE team_private.requests (
 actor_id uuid NOT NULL, commission_id uuid NOT NULL, request_id uuid NOT NULL,
 payload_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,commission_id,request_id)
);
CREATE TABLE team_private.audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid, org_id uuid NOT NULL, commission_id uuid NOT NULL, person_id uuid,
 action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE team_private.access_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
 commission_id uuid NOT NULL, person_id uuid NOT NULL,
 requested_by uuid NOT NULL, state text NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','processing','completed','declined')),
 attempts integer NOT NULL DEFAULT 1, requested_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(commission_id,person_id),
 FOREIGN KEY(commission_id,person_id) REFERENCES public.commission_responsibles(commission_id,person_id)
);
CREATE TABLE team_private.avatar_objects (
 path text PRIMARY KEY, org_id uuid NOT NULL, commission_id uuid NOT NULL, person_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), committed boolean NOT NULL DEFAULT false
);
CREATE TABLE team_private.avatar_requests (
 actor_id uuid NOT NULL, commission_id uuid NOT NULL, request_id uuid NOT NULL,
 person_id uuid NOT NULL, expected_version integer NOT NULL, path text, version integer NOT NULL,
 PRIMARY KEY(actor_id,commission_id,request_id)
);
ALTER TABLE team_private.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_private.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_private.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_private.access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_private.avatar_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_private.avatar_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA team_private FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.team_visible_org_ids() RETURNS SETOF uuid
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT org_id FROM public.org_members WHERE user_id=(SELECT auth.uid()) AND is_active;
$$;
CREATE FUNCTION public.team_manageable_commission_ids() RETURNS SETOF uuid
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT c.id FROM public.commissions c
 JOIN public.org_members m ON m.org_id=c.org_id AND m.user_id=(SELECT auth.uid()) AND m.is_active
 WHERE c.is_active AND c.unit_type IN ('comissao','assessoria') AND (
   m.role='admin'::public.org_role OR EXISTS (
     SELECT 1 FROM public.commission_responsibles r WHERE r.commission_id=c.id
     AND r.user_id=m.user_id AND r.active AND r.relationship_role IN ('principal','corresponsavel','copresidente')
   )
 );
$$;
CREATE POLICY team_people_read ON public.commission_people FOR SELECT TO authenticated
 USING(org_id IN (SELECT public.team_visible_org_ids()));
-- Evaluate membership once, without nested RLS checks for every person.
DROP POLICY IF EXISTS commission_responsibles_select ON public.commission_responsibles;
CREATE POLICY commission_responsibles_select ON public.commission_responsibles FOR SELECT TO authenticated
 USING(org_id IN (SELECT public.team_visible_org_ids()));

CREATE FUNCTION team_private.assert_manager(_commission_id uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.team_manageable_commission_ids() x WHERE x=_commission_id) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Sem permissão para gerenciar esta equipe.';
 END IF;
 SELECT org_id INTO STRICT result FROM public.commissions WHERE id=_commission_id;
 RETURN result;
END; $$;

CREATE FUNCTION public.team_admin_contacts(_commission_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM team_private.assert_manager(_commission_id);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('person_id',r.person_id,'membership_id',r.id,
 'email',c.email,'version',p.version,'membership_version',r.version,
 'can_edit_identity',public.get_user_org_role(auth.uid(),r.org_id)='admin'::public.org_role OR
 (SELECT count(*) FROM public.commission_responsibles x WHERE x.person_id=p.id AND x.active)=1,
 'access_state',a.state))
 FROM public.commission_responsibles r JOIN public.commission_people p ON p.id=r.person_id
 LEFT JOIN team_private.contacts c ON c.commission_id=r.commission_id AND c.person_id=r.person_id
 LEFT JOIN team_private.access_requests a ON a.commission_id=r.commission_id AND a.person_id=r.person_id
 WHERE r.commission_id=_commission_id AND r.active AND r.relationship_role='equipe_apoio' AND r.responsible_type='pessoa'), '[]'::jsonb);
END; $$;

CREATE FUNCTION public.team_save_volunteer(_commission_id uuid,_request_id uuid,_name text,_email text,
 _person_id uuid DEFAULT NULL,_expected_version integer DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid; v_person public.commission_people; v_link public.commission_responsibles;
 v_hash text; v_previous team_private.requests; v_result jsonb; v_email text:=lower(btrim(_email));
 v_name text:=btrim(regexp_replace(_name,'\s+',' ','g'));
BEGIN
 v_org:=team_private.assert_manager(_commission_id);
 IF _request_id IS NULL THEN RAISE EXCEPTION 'Identificador de envio obrigatório.'; END IF;
 IF v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 160 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Informe o nome completo (2 a 160 caracteres).'; END IF;
 IF v_email IS NULL OR length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Informe um e-mail válido.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_commission_id::text||_request_id::text,0));
 v_hash:=md5(jsonb_build_array(_name,_email,_person_id,_expected_version)::text);
 SELECT * INTO v_previous FROM team_private.requests WHERE actor_id=auth.uid() AND commission_id=_commission_id AND request_id=_request_id;
 IF FOUND THEN
  IF v_previous.payload_hash<>v_hash THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Envio já utilizado. Atualize o formulário.'; END IF;
  RETURN v_previous.result;
 END IF;
 -- Same-scope deduplication. Never match names or attach an account by typed email.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text||v_email,1));
 IF EXISTS(SELECT 1 FROM team_private.contacts WHERE commission_id=_commission_id AND email=v_email AND person_id IS DISTINCT FROM _person_id) THEN
  IF _person_id IS NULL AND EXISTS(SELECT 1 FROM team_private.contacts c JOIN public.commission_responsibles r USING(commission_id,person_id)
    WHERE c.commission_id=_commission_id AND c.email=v_email AND NOT r.active) THEN
   INSERT INTO team_private.reconciliation_queue(org_id,commission_id,requested_by,proposed_name,proposed_email)
    VALUES(v_org,_commission_id,auth.uid(),v_name,v_email)
    ON CONFLICT(commission_id,proposed_email) DO UPDATE SET proposed_name=excluded.proposed_name,
      requested_by=excluded.requested_by,created_at=now(),resolved_at=NULL
    WHERE team_private.reconciliation_queue.resolved_at IS NOT NULL;
   RETURN jsonb_build_object('reconciliation_required',true);
  END IF;
  RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Este e-mail já está cadastrado nesta equipe. Edite o cadastro existente.';
 END IF;
 IF _person_id IS NULL AND EXISTS(SELECT 1 FROM team_private.contacts WHERE org_id=v_org AND email=v_email AND commission_id<>_commission_id) THEN
  INSERT INTO team_private.reconciliation_queue(org_id,commission_id,requested_by,proposed_name,proposed_email)
   VALUES(v_org,_commission_id,auth.uid(),v_name,v_email)
    ON CONFLICT(commission_id,proposed_email) DO UPDATE SET proposed_name=excluded.proposed_name,
      requested_by=excluded.requested_by,created_at=now(),resolved_at=NULL
    WHERE team_private.reconciliation_queue.resolved_at IS NOT NULL;
  RETURN jsonb_build_object('reconciliation_required',true);
 END IF;
 IF _person_id IS NULL THEN
  INSERT INTO public.commission_people(org_id,display_name) VALUES(v_org,v_name) RETURNING * INTO v_person;
  INSERT INTO public.commission_responsibles(org_id,commission_id,person_id,display_name,relationship_role,responsible_type,is_primary)
    VALUES(v_org,_commission_id,v_person.id,v_name,'equipe_apoio','pessoa',false) RETURNING * INTO v_link;
 ELSE
  SELECT * INTO v_person FROM public.commission_people WHERE id=_person_id AND org_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Integrante indisponível nesta equipe.'; END IF;
  SELECT * INTO v_link FROM public.commission_responsibles WHERE commission_id=_commission_id AND person_id=_person_id AND active AND relationship_role='equipe_apoio' AND responsible_type='pessoa' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Integrante indisponível nesta equipe.'; END IF;
  IF _expected_version IS DISTINCT FROM v_person.version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Este cadastro foi atualizado. Reabra a edição antes de salvar.'; END IF;
  IF v_name<>v_person.display_name AND public.get_user_org_role(auth.uid(),v_org)<>'admin'::public.org_role
    AND (SELECT count(*) FROM public.commission_responsibles WHERE person_id=_person_id AND active)>1 THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Nome e foto de pessoas em várias equipes são gerenciados pela administração.';
  END IF;
  UPDATE public.commission_people SET display_name=v_name,version=version+1,updated_at=now() WHERE id=_person_id RETURNING * INTO v_person;
  UPDATE public.commission_responsibles SET display_name=v_name WHERE person_id=_person_id;
 END IF;
 INSERT INTO team_private.contacts(org_id,commission_id,person_id,email) VALUES(v_org,_commission_id,v_person.id,v_email)
 ON CONFLICT(commission_id,person_id) DO UPDATE SET email=excluded.email;
 INSERT INTO team_private.audit(actor_id,org_id,commission_id,person_id,action) VALUES(auth.uid(),v_org,_commission_id,v_person.id,CASE WHEN _person_id IS NULL THEN 'created' ELSE 'updated' END);
 v_result:=jsonb_build_object('person_id',v_person.id,'membership_id',v_link.id,'version',v_person.version);
 INSERT INTO team_private.requests(actor_id,commission_id,request_id,payload_hash,result) VALUES(auth.uid(),_commission_id,_request_id,v_hash,v_result);
 RETURN v_result;
END; $$;

CREATE FUNCTION public.team_deactivate_volunteer(_commission_id uuid,_person_id uuid,_expected_version integer) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid;
BEGIN
 v_org:=team_private.assert_manager(_commission_id);
 UPDATE public.commission_responsibles SET active=false,version=version+1
 WHERE commission_id=_commission_id AND person_id=_person_id AND relationship_role='equipe_apoio' AND active AND version=_expected_version;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Vínculo alterado ou indisponível. Atualize a equipe.'; END IF;
 INSERT INTO team_private.audit(actor_id,org_id,commission_id,person_id,action) VALUES(auth.uid(),v_org,_commission_id,_person_id,'deactivated');
END; $$;

-- Explicit admin-only linking; never copy contacts between units or assume identity by email.
CREATE FUNCTION public.team_link_existing_person(_commission_id uuid,_person_id uuid,_email text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid; p public.commission_people;
BEGIN
 v_org:=team_private.assert_manager(_commission_id);
 IF public.get_user_org_role(auth.uid(),v_org)<>'admin'::public.org_role THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Reconciliação reservada à administração.'; END IF;
 SELECT * INTO STRICT p FROM public.commission_people WHERE id=_person_id AND org_id=v_org FOR UPDATE;
 INSERT INTO public.commission_responsibles(org_id,commission_id,person_id,display_name,user_id,relationship_role)
 VALUES(v_org,_commission_id,p.id,p.display_name,p.user_id,'equipe_apoio')
 ON CONFLICT(commission_id,person_id) DO UPDATE SET active=true,version=public.commission_responsibles.version+1
 WHERE public.commission_responsibles.relationship_role='equipe_apoio';
 INSERT INTO team_private.contacts(org_id,commission_id,person_id,email) VALUES(v_org,_commission_id,p.id,lower(btrim(_email)))
 ON CONFLICT(commission_id,person_id) DO NOTHING;
 INSERT INTO team_private.audit(actor_id,org_id,commission_id,person_id,action) VALUES(auth.uid(),v_org,_commission_id,p.id,'linked_by_admin');
END; $$;

CREATE FUNCTION public.team_request_access(_commission_id uuid,_person_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid; v_request team_private.access_requests;
BEGIN
 v_org:=team_private.assert_manager(_commission_id);
 IF NOT EXISTS(SELECT 1 FROM public.commission_responsibles r JOIN team_private.contacts c USING(commission_id,person_id)
 WHERE r.commission_id=_commission_id AND r.person_id=_person_id AND r.active AND r.relationship_role='equipe_apoio') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Complete o contato do integrante antes de solicitar acesso.';
 END IF;
 INSERT INTO team_private.access_requests(org_id,commission_id,person_id,requested_by)
 VALUES(v_org,_commission_id,_person_id,auth.uid()) ON CONFLICT(commission_id,person_id) DO UPDATE
 SET attempts=team_private.access_requests.attempts+1,requested_by=auth.uid(),updated_at=now(),state='requested'
 WHERE team_private.access_requests.updated_at<now()-interval '24 hours' AND team_private.access_requests.state IN ('requested','declined')
 RETURNING * INTO v_request;
 IF NOT FOUND THEN SELECT * INTO v_request FROM team_private.access_requests WHERE commission_id=_commission_id AND person_id=_person_id; END IF;
 RETURN jsonb_build_object('id',v_request.id,'state',v_request.state,'attempts',v_request.attempts);
END; $$;
CREATE FUNCTION public.team_access_requests(_org_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF public.get_user_org_role(auth.uid(),_org_id) IS DISTINCT FROM 'admin'::public.org_role THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Acesso administrativo necessário.'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'person_id',a.person_id,'commission_id',a.commission_id,
 'name',p.display_name,'unit_name',u.nome,'email',c.email,'state',a.state,'attempts',a.attempts,'requested_at',a.requested_at))
 FROM team_private.access_requests a JOIN public.commission_people p ON p.id=a.person_id
 JOIN public.commissions u ON u.id=a.commission_id
 JOIN team_private.contacts c ON c.commission_id=a.commission_id AND c.person_id=a.person_id WHERE a.org_id=_org_id),'[]'::jsonb);
END; $$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('team-avatars','team-avatars',false,524288,ARRAY['image/webp']) ON CONFLICT(id) DO NOTHING;
-- Only the image processor (service role) writes objects; members can sign current thumbnails.
CREATE POLICY team_avatar_read ON storage.objects FOR SELECT TO authenticated USING(
 bucket_id='team-avatars' AND name IN (SELECT avatar_path FROM public.commission_people WHERE org_id IN (SELECT public.team_visible_org_ids()))
);
CREATE FUNCTION public.team_avatar_prepare(_commission_id uuid,_person_id uuid,_expected_version integer,_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid; p public.commission_people; v_path text; prior team_private.avatar_requests;
BEGIN
 v_org:=team_private.assert_manager(_commission_id);
 SELECT p1.* INTO p FROM public.commission_people p1 JOIN public.commission_responsibles r ON r.person_id=p1.id
 WHERE r.commission_id=_commission_id AND r.person_id=_person_id AND r.active AND r.relationship_role='equipe_apoio';
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Integrante indisponível.'; END IF;
 SELECT * INTO prior FROM team_private.avatar_requests WHERE actor_id=auth.uid() AND commission_id=_commission_id AND request_id=_request_id;
 IF FOUND THEN
  IF prior.person_id<>_person_id OR prior.expected_version<>_expected_version THEN RAISE EXCEPTION 'Envio já utilizado.'; END IF;
  RETURN jsonb_build_object('already_committed',true,'version',prior.version);
 END IF;
 v_path:=v_org::text||'/'||_commission_id::text||'/'||_person_id::text||'/'||_request_id::text||'.webp';
 IF p.avatar_path=v_path THEN RETURN jsonb_build_object('already_committed',true,'version',p.version); END IF;
 IF p.version IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Cadastro alterado. Reabra a edição.'; END IF;
 IF public.get_user_org_role(auth.uid(),v_org)<>'admin'::public.org_role AND
 (SELECT count(*) FROM public.commission_responsibles WHERE person_id=_person_id AND active)>1 THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Foto compartilhada: solicite a alteração à administração.'; END IF;
 IF _request_id IS NULL THEN RAISE EXCEPTION 'Identificador obrigatório.'; END IF;
 v_path:=v_org::text||'/'||_commission_id::text||'/'||_person_id::text||'/'||_request_id::text||'.webp';
 INSERT INTO team_private.avatar_objects(path,org_id,commission_id,person_id) VALUES(v_path,v_org,_commission_id,_person_id) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('path',v_path,'old_path',p.avatar_path);
END; $$;
-- Service only; caller ID originates from auth.getUser() in the edge function.
CREATE FUNCTION public.team_avatar_commit(_actor_id uuid,_commission_id uuid,_person_id uuid,_expected_version integer,_path text,_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.commission_people; v_old text; prior team_private.avatar_requests;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',_actor_id::text,true);
 PERFORM team_private.assert_manager(_commission_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(_commission_id::text||_request_id::text,2));
 SELECT * INTO prior FROM team_private.avatar_requests WHERE actor_id=_actor_id AND commission_id=_commission_id AND request_id=_request_id;
 IF FOUND THEN
  IF prior.person_id<>_person_id OR prior.expected_version<>_expected_version OR prior.path IS DISTINCT FROM _path THEN RAISE EXCEPTION 'Envio já utilizado.'; END IF;
  RETURN jsonb_build_object('version',prior.version);
 END IF;
 SELECT * INTO STRICT p FROM public.commission_people WHERE id=_person_id FOR UPDATE;
 IF p.avatar_path=_path AND _path IS NOT NULL THEN RETURN jsonb_build_object('version',p.version); END IF;
 IF p.version IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Cadastro alterado. Reabra a edição.'; END IF;
 IF public.get_user_org_role(_actor_id,p.org_id)<>'admin'::public.org_role AND
 (SELECT count(*) FROM public.commission_responsibles WHERE person_id=_person_id AND active)>1 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Identidade compartilhada.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.commission_responsibles WHERE commission_id=_commission_id AND person_id=_person_id AND active AND relationship_role='equipe_apoio') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Integrante indisponível.'; END IF;
 IF _path IS NOT NULL AND NOT EXISTS(SELECT 1 FROM team_private.avatar_objects a JOIN storage.objects o ON o.name=a.path AND o.bucket_id='team-avatars'
 WHERE a.path=_path AND a.person_id=_person_id AND a.commission_id=_commission_id) THEN RAISE EXCEPTION 'Upload não confirmado.'; END IF;
 v_old:=p.avatar_path;
 UPDATE public.commission_people SET avatar_path=_path,legacy_photo=false,version=version+1,updated_at=now() WHERE id=_person_id RETURNING * INTO p;
 UPDATE team_private.avatar_objects SET committed=true WHERE path=_path;
 INSERT INTO team_private.avatar_requests(actor_id,commission_id,request_id,person_id,expected_version,path,version)
 VALUES(_actor_id,_commission_id,_request_id,_person_id,_expected_version,_path,p.version);
 INSERT INTO team_private.audit(actor_id,org_id,commission_id,person_id,action) VALUES(_actor_id,p.org_id,_commission_id,_person_id,'avatar_changed');
 RETURN jsonb_build_object('version',p.version,'old_path',v_old);
END; $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA team_private FROM PUBLIC,anon,authenticated;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'team_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.sig);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  IF f.sig::text NOT LIKE '%team_avatar_commit(%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig); END IF;
 END LOOP;
END $$;
-- Private schema is never included in Realtime or in any public directory projection.
