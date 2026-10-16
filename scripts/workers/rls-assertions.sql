-- Apply db-fixture.sql and both workers migrations to an isolated database first.
-- This file exercises real PostgreSQL policies/functions with caller roles.
BEGIN;
SET LOCAL ROLE authenticated;

-- Every organization role can create its own read-only chat, not another user's.
DO $$ DECLARE actor text; result jsonb; BEGIN
  FOREACH actor IN ARRAY ARRAY['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005'] LOOP
    PERFORM set_config('request.jwt.claim.sub',actor,true);
    result := public.ai_workers_begin_turn('10000000-0000-4000-8000-000000000001',gen_random_uuid(),'agenda','Pergunta fixture',NULL);
    PERFORM public.workers_test_assert((SELECT count(*)=1 FROM public.ai_conversations),'own conversation isolated by role '||actor);
    PERFORM public.workers_test_assert((SELECT count(*)=2 FROM public.ai_messages),'own messages isolated by role '||actor);
    PERFORM public.workers_test_assert((SELECT bool_and(user_id=actor::uuid) FROM public.ai_messages),'no other user messages');
  END LOOP;
END $$;

-- Admin remains unable to read peers' private conversations.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SELECT public.workers_test_assert((SELECT count(*)=1 FROM public.ai_conversations),'admin cannot read peer private chats');
SELECT public.workers_test_denied($sql$SELECT public.ai_workers_begin_turn('10000000-0000-4000-8000-000000000002',gen_random_uuid(),'agenda','cross org',NULL)$sql$,'cross-org admission');
SELECT public.workers_test_denied($sql$INSERT INTO public.ai_usage(org_id,user_id,conversation_id,request_id,worker_id,provider,model,input_tokens,output_tokens) VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'agenda','lovable','google/test',0,0)$sql$,'direct usage insert');
SELECT public.workers_test_denied($sql$DELETE FROM public.ai_audit_events$sql$,'audit delete');
SELECT public.workers_test_denied($sql$UPDATE public.ai_usage SET input_tokens=0$sql$,'usage update');
SELECT public.workers_test_denied($sql$UPDATE public.ai_messages SET content='spoofed assistant'$sql$,'direct assistant spoof');

-- Deterministic idempotency, safe replay and telemetry append once.
DO $$ DECLARE c uuid; first jsonb; replay jsonb; r uuid:='40000000-0000-4000-8000-000000000001'; BEGIN
  first:=public.ai_workers_begin_turn('10000000-0000-4000-8000-000000000001',r,'agenda','ana@example.com 123.456.789-00 https://host.example/areas/pav/opaqueRemote /areas/pav/opaqueLocal',NULL);
  c:=(first->>'conversationId')::uuid;
  PERFORM public.workers_test_assert((SELECT content NOT LIKE '%ana@example.com%' AND content NOT LIKE '%123.456.789-00%' AND content NOT LIKE '%opaqueRemote%' AND content NOT LIKE '%opaqueLocal%' FROM public.ai_messages WHERE request_id=r AND role='user'),'message minimization and public token removal');
  PERFORM public.workers_test_denied(format('SELECT public.ai_workers_begin_turn(%L,%L,%L,%L,NULL)','10000000-0000-4000-8000-000000000001',r,'agenda','same'),'pending retry does not duplicate');
  PERFORM public.ai_workers_finish_turn('10000000-0000-4000-8000-000000000001',r,'1 evento encontrado. /areas/pav/opaqueOutput https://host.example/areas/pav/opaqueUrl','[{"label":"Agenda","url":"/cronograma-eventos","source":"app"}]','google/test',15,4,ARRAY['list_events']);
  PERFORM public.ai_workers_finish_turn('10000000-0000-4000-8000-000000000001',r,'outra resposta','[]','google/test',99,99,ARRAY[]::text[]);
  replay:=public.ai_workers_begin_turn('10000000-0000-4000-8000-000000000001',r,'agenda','same',c);
  PERFORM public.workers_test_assert((replay->>'replayed')::boolean AND replay->>'content' LIKE '1 evento encontrado.%' AND replay->>'content' NOT LIKE '%opaque%','completion replays original after token removal');
  PERFORM public.workers_test_assert((SELECT count(*)=2 FROM public.ai_messages WHERE request_id=r),'exactly two messages');
  PERFORM public.workers_test_assert((SELECT count(*)=1 AND max(input_tokens)=15 FROM public.ai_usage WHERE request_id=r),'usage once');
  PERFORM public.workers_test_assert((SELECT count(*)=1 FROM public.ai_audit_events WHERE request_id=r AND event='turn_completed'),'audit once');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000007',true);
  PERFORM public.workers_test_denied(format('SELECT public.ai_workers_begin_turn(%L,gen_random_uuid(),%L,%L,%L)','10000000-0000-4000-8000-000000000001','agenda','steal chat',c),'cross-user conversation reuse');
END $$;

-- Failed requests retain reported usage as an explicitly incomplete lower bound.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE r uuid:=gen_random_uuid(); link text; BEGIN
  PERFORM public.ai_workers_begin_turn('10000000-0000-4000-8000-000000000001',r,'agenda','falha fixture',NULL);
  PERFORM public.workers_test_denied(format('SELECT public.ai_workers_finish_turn(%L,%L,%L,%L::jsonb,%L,0,0)',
    '10000000-0000-4000-8000-000000000001',r,'spoof','[{"label":"public token","url":"/areas/pav/opaqueToken","source":"app"}]','google/test'),'public token citation denied');
  FOREACH link IN ARRAY ARRAY['https://www.fenasoja.com.br/areas/pav/opaqueToken','https://www.fenasoja.com.br/%61reas/pav/opaqueToken'] LOOP
    PERFORM public.workers_test_denied(format('SELECT public.ai_workers_finish_turn(%L,%L,%L,%L::jsonb,%L,0,0)',
      '10000000-0000-4000-8000-000000000001',r,'spoof',jsonb_build_array(jsonb_build_object('label','public web token','url',link,'source','web','date','2026-10-16'))::text,'google/test'),'web citation cannot carry public token');
  END LOOP;
  PERFORM public.ai_workers_fail_turn('10000000-0000-4000-8000-000000000001',r,'google/test',17,4);
  PERFORM public.ai_workers_fail_turn('10000000-0000-4000-8000-000000000001',r,'google/test',99,99);
  PERFORM public.workers_test_assert((SELECT count(*)=1 AND max(input_tokens)=17 AND bool_and(outcome='failed' AND NOT usage_complete AND cost_usd IS NULL) FROM public.ai_usage WHERE request_id=r),'failed partial usage once, unknown cost');
END $$;

-- Scoped Interest wrappers neither return other organizations nor secret columns.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE result jsonb; BEGIN
  result:=public.workers_interest_summary('10000000-0000-4000-8000-000000000001');
  PERFORM public.workers_test_assert(jsonb_array_length(result->'areas')=1 AND result->'areas'->0->>'visits'='1','org-bound analytics');
  result:=public.workers_public_links_overview('10000000-0000-4000-8000-000000000001');
  PERFORM public.workers_test_assert(jsonb_array_length(result)=1 AND result::text NOT LIKE '%TOKEN%' AND result::text NOT LIKE '%HASH%' AND result::text NOT LIKE '%EMAIL%' AND result::text NOT LIKE '%session%','no public tokens or visitor fields');
END $$;
SELECT public.workers_test_denied($sql$SELECT public.workers_interest_summary('10000000-0000-4000-8000-000000000002')$sql$,'analytics cross-org despite admin role');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
SELECT public.workers_test_denied($sql$SELECT public.workers_interest_summary('10000000-0000-4000-8000-000000000001')$sql$,'analytics-only grant cannot access commercial interest');
SELECT public.workers_test_denied($sql$SELECT public.workers_public_links_overview('10000000-0000-4000-8000-000000000001')$sql$,'analytics-only grant cannot list commercial links');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
SELECT public.workers_test_denied($sql$SELECT public.workers_interest_summary('10000000-0000-4000-8000-000000000001')$sql$,'operator broad legacy grant does not confer commercial sales');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000007',true);
SELECT public.workers_test_denied($sql$SELECT public.workers_interest_summary('10000000-0000-4000-8000-000000000001')$sql$,'sales-only grant still requires analytics');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
SELECT public.workers_test_assert(jsonb_array_length(public.workers_public_links_overview('10000000-0000-4000-8000-000000000001'))=1,'commission-profile read role with explicit analytics and sales grants');

-- Limits occur in admission before a provider can be invoked.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000007',true);
DO $$ DECLARE n integer; r uuid; BEGIN
  FOR n IN 1..8 LOOP
    r:=gen_random_uuid();
    PERFORM public.ai_workers_begin_turn('10000000-0000-4000-8000-000000000001',r,'agenda','rate fixture',NULL);
    PERFORM public.ai_workers_finish_turn('10000000-0000-4000-8000-000000000001',r,'Sem dados.','[]','google/test',0,0);
  END LOOP;
  PERFORM public.workers_test_denied($sql$SELECT public.ai_workers_begin_turn('10000000-0000-4000-8000-000000000001',gen_random_uuid(),'agenda','ninth request',NULL)$sql$,'database admission rate cap');
  PERFORM public.workers_test_assert((SELECT count(*)=8 FROM public.ai_messages WHERE role='user'),'denied request not persisted');
END $$;

RESET ROLE;
-- Composite ownership FK is checked even for a privileged accidental insert.
SELECT public.workers_test_denied($sql$INSERT INTO public.ai_messages(org_id,user_id,conversation_id,request_id,role,worker_id,content,state) SELECT '10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006',id,gen_random_uuid(),'user','agenda','cross scope','complete' FROM public.ai_conversations LIMIT 1$sql$,'composite scope FK');
UPDATE public.org_members SET is_active=false WHERE user_id='00000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
SELECT public.workers_test_assert((SELECT count(*)=0 FROM public.ai_conversations),'revoked membership hides history');
SELECT public.workers_test_assert((SELECT count(*)=0 FROM public.ai_messages),'revoked membership hides messages');
SELECT public.workers_test_denied($sql$SELECT public.ai_workers_begin_turn('10000000-0000-4000-8000-000000000001',gen_random_uuid(),'agenda','revoked',NULL)$sql$,'revoked membership admission');
SELECT public.workers_test_denied($sql$SELECT public.workers_public_links_overview('10000000-0000-4000-8000-000000000001')$sql$,'revoked analytics grant no membership');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT public.workers_test_denied($sql$SELECT * FROM public.ai_messages$sql$,'anonymous history');
SELECT public.workers_test_denied($sql$SELECT public.ai_workers_begin_turn('10000000-0000-4000-8000-000000000001',gen_random_uuid(),'agenda','anon',NULL)$sql$,'anonymous turn');
RESET ROLE;
ROLLBACK;
