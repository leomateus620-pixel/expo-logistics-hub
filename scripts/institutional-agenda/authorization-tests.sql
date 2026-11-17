-- Additional organization/privilege boundary checks. Caller must ROLLBACK.
RESET ROLE;
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO qa_state VALUES('foreign_org',jsonb_build_object('id',gen_random_uuid()));
INSERT INTO public.organizations(id,nome) SELECT (value->>'id')::uuid,'Agenda QA foreign organization' FROM qa_state WHERE key='foreign_org';
INSERT INTO qa_state VALUES('foreign_unit',jsonb_build_object('id',gen_random_uuid()));
INSERT INTO public.commissions(id,org_id,nome,slug)
 SELECT (SELECT (value->>'id')::uuid FROM qa_state WHERE key='foreign_unit'),(SELECT (value->>'id')::uuid FROM qa_state WHERE key='foreign_org'),'Foreign QA','qa-foreign';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT uid::text FROM qa_actors WHERE n=1),true);
DO $$ BEGIN
 BEGIN
  PERFORM public.cronograma_save_event((SELECT value FROM qa_state WHERE key='payload')||jsonb_build_object(
    'org_id',(SELECT value->>'id' FROM qa_state WHERE key='foreign_org'),'source_key','qa-cross-org','request_id',gen_random_uuid()),NULL);
  RAISE EXCEPTION 'foreign organization accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.check_result('cross-organization creation denied',true);
 BEGIN
  PERFORM public.cronograma_save_event((SELECT value FROM qa_state WHERE key='payload')||jsonb_build_object('source_key','qa-cross-unit','request_id',gen_random_uuid(),
   'commissions',jsonb_build_array(jsonb_build_object('commission_id',(SELECT owner FROM qa_ids),'relation_role','principal'),
     jsonb_build_object('commission_id',(SELECT value->>'id' FROM qa_state WHERE key='foreign_unit'),'relation_role','participante'))),NULL);
  RAISE EXCEPTION 'foreign unit accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 PERFORM pg_temp.check_result('cross-organization relationship denied',true);
 PERFORM pg_temp.check_result('foreign organization permission query returns no grants',
   public.cronograma_agenda_permissions((SELECT (value->>'id')::uuid FROM qa_state WHERE key='foreign_org'))=
   jsonb_build_object('global_write',false,'managed_commission_ids','[]'::jsonb,'writable_event_ids','[]'::jsonb,'deletable_event_ids','[]'::jsonb));
END $$;
SELECT set_config('request.jwt.claim.sub',(SELECT uid::text FROM qa_actors WHERE n=5),true);
SELECT pg_temp.check_result('uninvited scoped reader cannot see or edit unrelated event',
 NOT EXISTS(SELECT 1 FROM public.cronograma_eventos_full WHERE id=(SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved'))
 AND NOT EXISTS(SELECT 1 FROM public.cronograma_writable_event_ids()));
RESET ROLE;
SELECT pg_temp.check_result('anonymous cannot execute canonical mutation or permission RPC',
 NOT has_function_privilege('anon','public.cronograma_save_event(jsonb,bigint)','EXECUTE')
 AND NOT has_function_privilege('anon','public.cronograma_agenda_permissions(uuid)','EXECUTE'));
SELECT pg_temp.check_result('RLS remains enabled',
 NOT EXISTS(SELECT 1 FROM pg_class WHERE relname IN ('cronograma_eventos','cronograma_evento_comissoes','cronograma_evento_responsaveis','cronograma_evento_logs') AND NOT relrowsecurity));
SET CONSTRAINTS ALL IMMEDIATE;
SELECT name,passed FROM qa_checks ORDER BY name;

-- Restricted operators must not inherit global capabilities through has_capability().
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT uid::text FROM qa_actors WHERE n=6),true);
UPDATE public.org_members SET role='operador' WHERE user_id=(SELECT uid FROM qa_actors WHERE n=4);
INSERT INTO public.user_capabilities(org_id,user_id,capability) SELECT org,(SELECT uid FROM qa_actors WHERE n=4),'restricted_scope' FROM qa_ids;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT uid::text FROM qa_actors WHERE n=4),true);
SELECT pg_temp.check_result('restricted operator has own-unit authority without global write',
 NOT EXISTS(SELECT 1 FROM public.cronograma_writer_org_ids())
 AND (SELECT other_unit FROM qa_ids) IN (SELECT public.cronograma_managed_commission_ids())
 AND (SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved') NOT IN (SELECT public.cronograma_writable_event_ids()));
DO $$ BEGIN
 BEGIN PERFORM public._cronograma_require_deleter((SELECT org FROM qa_ids)); RAISE EXCEPTION 'restricted operator deletion allowed';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'CRONOGRAMA_PERMISSION_DENIED%' THEN RAISE; END IF; END;
 PERFORM pg_temp.check_result('restricted operator canonical deletion denied',true);
END $$;
WITH deleted AS (DELETE FROM public.cronograma_eventos WHERE id=(SELECT (value->>'id')::uuid FROM qa_state WHERE key='saved') RETURNING id)
 SELECT pg_temp.check_result('restricted operator direct deletion denied by RLS',count(*)=0) FROM deleted;
RESET ROLE;
DELETE FROM public.user_capabilities WHERE user_id=(SELECT uid FROM qa_actors WHERE n=4) AND capability='restricted_scope';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',(SELECT uid::text FROM qa_actors WHERE n=4),true);
SELECT pg_temp.check_result('unrestricted operational writer keeps existing authority',(SELECT org FROM qa_ids) IN (SELECT public.cronograma_writer_org_ids()));
SELECT set_config('request.jwt.claim.sub',(SELECT uid::text FROM qa_actors WHERE n=6),true);
SELECT pg_temp.check_result('administrator keeps existing authority',(SELECT org FROM qa_ids) IN (SELECT public.cronograma_writer_org_ids()));
RESET ROLE;
UPDATE public.org_members SET role='gestor' WHERE user_id=(SELECT uid FROM qa_actors WHERE n=6);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_result('institutional manager keeps existing authority',(SELECT org FROM qa_ids) IN (SELECT public.cronograma_writer_org_ids()));
RESET ROLE;
SELECT name,passed FROM qa_checks ORDER BY name;
