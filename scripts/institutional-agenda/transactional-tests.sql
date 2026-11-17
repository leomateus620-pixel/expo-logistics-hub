-- Execute after the migration, inside BEGIN/ROLLBACK. Never commit this fixture.
-- Synthetic identities with the institutional permission shape; no real login is impersonated.
CREATE TEMP TABLE qa_ids AS SELECT
 '985888b8-155f-4bbe-b6b9-6bef2893d99b'::uuid org,
 (SELECT id FROM public.commissions WHERE org_id='985888b8-155f-4bbe-b6b9-6bef2893d99b' AND slug='acolhimento-e-bem-comum') owner,
 (SELECT id FROM public.commissions WHERE org_id='985888b8-155f-4bbe-b6b9-6bef2893d99b' AND slug='assessoria-de-marketing') marketing,
 (SELECT id FROM public.commissions WHERE org_id='985888b8-155f-4bbe-b6b9-6bef2893d99b' AND slug='seguranca') other_unit;
CREATE TEMP TABLE qa_actors AS SELECT n,gen_random_uuid() uid,gen_random_uuid() person FROM generate_series(1,6) n;
CREATE TEMP TABLE qa_state(key text PRIMARY KEY,value jsonb);
CREATE TEMP TABLE qa_checks(name text, passed boolean);
GRANT ALL ON qa_ids,qa_actors,qa_state,qa_checks TO authenticated;
CREATE FUNCTION pg_temp.check_result(name text, ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'QA FAILED: %',name; END IF;
INSERT INTO qa_checks VALUES(name,true); END $$;
INSERT INTO auth.users(id) SELECT uid FROM qa_actors;
INSERT INTO public.org_members(org_id,user_id,role,nome_exibicao,is_active)
 SELECT i.org,a.uid,CASE WHEN a.n=6 THEN 'admin'::public.org_role ELSE 'leitura'::public.org_role END,'Agenda QA synthetic '||a.n,true FROM qa_ids i,qa_actors a;
INSERT INTO public.commission_people(id,org_id,display_name,user_id)
 SELECT a.person,i.org,'Agenda QA synthetic '||a.n,CASE WHEN a.n=5 THEN NULL ELSE a.uid END FROM qa_ids i,qa_actors a;
INSERT INTO public.commission_responsibles(org_id,commission_id,person_id,user_id,display_name,relationship_role,active)
 SELECT i.org,CASE WHEN n IN (1,3) THEN i.owner WHEN n IN (2,5) THEN i.marketing ELSE i.other_unit END,
 a.person,CASE WHEN n=5 THEN NULL ELSE a.uid END,'Agenda QA synthetic '||n,
 CASE WHEN n IN (1,2) THEN 'principal' ELSE 'equipe_apoio' END,true FROM qa_ids i,qa_actors a WHERE n<6;
INSERT INTO public.user_capabilities(org_id,user_id,capability)
 SELECT i.org,a.uid,'cronograma_scoped_access' FROM qa_ids i,qa_actors a WHERE n<6;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT uid::text FROM qa_actors WHERE n=1),true);
SELECT pg_temp.check_result('leader has unit write without global capability',
 NOT public.has_capability(auth.uid(),(SELECT org FROM qa_ids),'cronograma_eventos_write')
 AND (SELECT owner FROM qa_ids) IN (SELECT public.cronograma_managed_commission_ids()));
INSERT INTO qa_state SELECT 'payload',jsonb_build_object('org_id',i.org,'source_key','qa-institutional-'||gen_random_uuid(),
 'request_id',gen_random_uuid(),'title','Reunião QA institucional','category','Agenda das comissões','event_type','reuniao',
 'start_date','2028-05-04','start_time','09:00','end_time','10:00','source_year',2028,
 'origin_commission_id',i.owner,'commission_slug','acolhimento-e-bem-comum',
 'commissions',jsonb_build_array(jsonb_build_object('commission_id',i.owner,'relation_role','principal'),
   jsonb_build_object('commission_id',i.marketing,'relation_role','participante')),
 'responsibles',jsonb_build_array(jsonb_build_object('person_id',(SELECT person FROM qa_actors WHERE n=1),'is_primary',true),
   jsonb_build_object('person_id',(SELECT person FROM qa_actors WHERE n=4),'is_primary',false),
   jsonb_build_object('person_id',(SELECT person FROM qa_actors WHERE n=5),'is_primary',false))) FROM qa_ids i;
INSERT INTO qa_state SELECT 'saved',public.cronograma_save_event(value,NULL) FROM qa_state WHERE key='payload';
SELECT pg_temp.check_result('persisted with canonical id and all explicit links',
 (SELECT count(*)=1 FROM public.cronograma_eventos WHERE id=(SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved'))
 AND (SELECT count(*)=2 FROM public.cronograma_evento_comissoes WHERE event_id=(SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved'))
 AND (SELECT count(*)=3 FROM public.cronograma_evento_responsaveis WHERE event_id=(SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved')));
SELECT pg_temp.check_result('durable idempotent retry returns same id',
 (SELECT public.cronograma_save_event(value,NULL)->>'id' FROM qa_state WHERE key='payload')=(SELECT value->>'id' FROM qa_state WHERE key='saved'));
SELECT pg_temp.check_result('general agenda and both unit RPCs return the same id without Central',
 EXISTS(SELECT 1 FROM public.cronograma_eventos_full WHERE id=(SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved'))
 AND EXISTS(SELECT 1 FROM public.cronograma_unit_agenda((SELECT owner FROM qa_ids)) WHERE id=(SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved'))
 AND EXISTS(SELECT 1 FROM public.cronograma_unit_agenda((SELECT marketing FROM qa_ids)) WHERE id=(SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved')));
SELECT pg_temp.check_result('verified invited account is linked; volunteer without account remains valid',
 EXISTS(SELECT 1 FROM public.cronograma_evento_responsaveis WHERE event_id=(SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved')
 AND person_id=(SELECT person FROM qa_actors WHERE n=4) AND org_member_user_id=(SELECT uid FROM qa_actors WHERE n=4) AND responsible_type='member')
 AND EXISTS(SELECT 1 FROM public.cronograma_evento_responsaveis WHERE event_id=(SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved')
 AND person_id=(SELECT person FROM qa_actors WHERE n=5) AND org_member_user_id IS NULL));
SELECT set_config('request.jwt.claim.sub',(SELECT uid::text FROM qa_actors WHERE n=2),true);
INSERT INTO qa_state SELECT 'edited',public.cronograma_save_event(value||jsonb_build_object('id',(SELECT value->>'id' FROM qa_state WHERE key='saved'),
 'request_id',gen_random_uuid(),'description','Revisão pela assessoria participante'),1) FROM qa_state WHERE key='payload';
SELECT pg_temp.check_result('participant leader edits same event preserving origin and owner',
 (SELECT value->>'id' FROM qa_state WHERE key='saved')=(SELECT value->>'id' FROM qa_state WHERE key='edited')
 AND (SELECT value->>'origin_commission_id' FROM qa_state WHERE key='edited')=(SELECT owner::text FROM qa_ids)
 AND (SELECT (value->>'lock_version')::int FROM qa_state WHERE key='edited')=2);
DO $$ BEGIN
 BEGIN
  PERFORM public.cronograma_save_event((SELECT value FROM qa_state WHERE key='payload')||jsonb_build_object('id',(SELECT value->>'id' FROM qa_state WHERE key='saved'),'request_id',gen_random_uuid()),1);
  RAISE EXCEPTION 'stale version accepted';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'CRONOGRAMA_CONFLICT%' THEN RAISE; END IF; END;
 PERFORM pg_temp.check_result('stale concurrent edit rejected',true);
 BEGIN
  PERFORM public.cronograma_save_event((SELECT value FROM qa_state WHERE key='payload')||jsonb_build_object('id',(SELECT value->>'id' FROM qa_state WHERE key='saved'),'request_id',gen_random_uuid(),'origin_commission_id',(SELECT marketing FROM qa_ids)),2);
  RAISE EXCEPTION 'changed owner accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.check_result('origin cannot be transferred during editing',true);
END $$;
INSERT INTO qa_state SELECT 'advisor',public.cronograma_save_event(jsonb_build_object('org_id',org,'source_key','qa-advisor-'||gen_random_uuid(),
 'request_id',gen_random_uuid(),'title','Agenda QA assessoria','start_date','2028-06-03','origin_commission_id',marketing,
 'commission_slug','assessoria-de-marketing','commissions',jsonb_build_array(jsonb_build_object('commission_id',marketing,'relation_role','principal'))),NULL) FROM qa_ids;
SELECT pg_temp.check_result('advisory creates its own event', (SELECT value->>'origin_commission_id' FROM qa_state WHERE key='advisor')=(SELECT marketing::text FROM qa_ids));
SELECT set_config('request.jwt.claim.sub',(SELECT uid::text FROM qa_actors WHERE n=3),true);
SELECT pg_temp.check_result('read-only unit member sees event without acquiring write',
 EXISTS(SELECT 1 FROM public.cronograma_eventos_full WHERE id=(SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved'))
 AND NOT EXISTS(SELECT 1 FROM public.cronograma_managed_commission_ids() x WHERE x=(SELECT owner FROM qa_ids)));
DO $$ BEGIN
 BEGIN
  PERFORM public.cronograma_save_event((SELECT value FROM qa_state WHERE key='payload')||jsonb_build_object('request_id',gen_random_uuid(),'source_key','qa-forbidden-'||gen_random_uuid()),NULL);
  RAISE EXCEPTION 'reader write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.check_result('read-only creation denied by RPC',true);
END $$;
SELECT set_config('request.jwt.claim.sub',(SELECT uid::text FROM qa_actors WHERE n=4),true);
SELECT pg_temp.check_result('invited person can read without edit or automatic unit distribution',
 EXISTS(SELECT 1 FROM public.cronograma_eventos_full WHERE id=(SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved'))
 AND (SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved') NOT IN (SELECT public.cronograma_writable_event_ids())
 AND NOT EXISTS(SELECT 1 FROM public.cronograma_unit_agenda((SELECT other_unit FROM qa_ids)) WHERE id=(SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved')));
SELECT set_config('request.jwt.claim.sub',(SELECT uid::text FROM qa_actors WHERE n=1),true);
DO $$ DECLARE before_count int; bad jsonb; BEGIN
 SELECT count(*) INTO before_count FROM public.cronograma_eventos;
 SELECT value||jsonb_build_object('source_key','qa-invalid-'||gen_random_uuid(),'request_id',gen_random_uuid(),
 'responsibles',jsonb_build_array(jsonb_build_object('person_id',gen_random_uuid(),'name','Inexistente'))) INTO bad FROM qa_state WHERE key='payload';
 BEGIN PERFORM public.cronograma_save_event(bad,NULL); RAISE EXCEPTION 'invalid relation accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 PERFORM pg_temp.check_result('invalid relationship rolls back the entire creation',before_count=(SELECT count(*) FROM public.cronograma_eventos));
 BEGIN
  INSERT INTO public.cronograma_evento_comissoes(org_id,event_id,commission_id,relation_role)
   SELECT i.org,(SELECT (value->>'id')::uuid FROM qa_state WHERE key='advisor'),i.owner,'participante' FROM qa_ids i;
  RAISE EXCEPTION 'self attachment accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.check_result('cannot acquire write access by attaching own unit to unrelated event',true);
END $$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT name,passed FROM qa_checks ORDER BY name;
-- Caller must ROLLBACK, including generated notification/sync queue entries and auth users.
