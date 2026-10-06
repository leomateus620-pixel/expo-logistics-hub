-- Synthetic local database only. Run through scripts/agenda-restaurant/db-run.ps1.
CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION pg_temp.expect_error(statement text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught text;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN caught:=SQLERRM; END;
  IF caught IS NULL OR position(expected IN caught)=0 THEN RAISE EXCEPTION 'ASSERTION FAILED: % expected %, got %',label,expected,caught; END IF;
  RAISE NOTICE 'PASS: %',label;
END $$;
CREATE TEMP TABLE bridge_results(label text PRIMARY KEY,result jsonb);
GRANT ALL ON bridge_results TO authenticated;
INSERT INTO public.organizations(id) VALUES('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
INSERT INTO public.org_members(org_id,user_id,role,nome_exibicao) VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','leitura','Autora sintética'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','operador','Editor sintético'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','leitura','Responsável verificado sintético'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','admin','Administrador diferente'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000005','operador','Leitor de escopo restrito'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000006','admin','Outra organização');
INSERT INTO public.user_capabilities(org_id,user_id,capability) VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','cronograma_eventos_write'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','venue_events_access'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','venue_events_approve'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000005','restricted_scope'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000005','cronograma_scoped_access'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000005','cronograma_eventos_write');
INSERT INTO public.venue_spaces(id,org_id,name,slug,type,active) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Restaurante sintético','restaurante-fenasoja','restaurante',true),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Arena sintética','arena-fenasoja','arena',true);
INSERT INTO public.venue_booking_units(id,org_id,name,slug,active) VALUES
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Unidade sintética restaurante','restaurante-sintetico',true);
INSERT INTO public.venue_space_booking_units(org_id,space_id,booking_unit_id) VALUES
 ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001');

SELECT pg_temp.assert_true(agenda_private.matches_location(NULL,'  CÉNTRO   DE EVENTOS FENASOJA  ','centro_eventos_fenasoja'),'historical exact accent and whitespace normalization');
SELECT pg_temp.assert_true(NOT agenda_private.matches_location('sala_voluntarios','CENTRO DE EVENTOS FENASOJA','centro_eventos_fenasoja'),'explicit conflicting code is authoritative');
SELECT pg_temp.assert_true(NOT agenda_private.matches_location(NULL,'Evento no CENTRO DE EVENTOS FENASOJA','centro_eventos_fenasoja'),'no approximate location matching');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','agenda_private.sync_restaurant_source()','EXECUTE'),'privileged bridge is not client executable');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT pg_temp.expect_error($q$SELECT public.cronograma_save_event('{"org_id":"10000000-0000-0000-0000-000000000001","source_key":"manual-disabled","request_id":"50000000-0000-0000-0000-000000000001","title":"Evento sem configuração","location_code":"centro_eventos_fenasoja","location":"CENTRO DE EVENTOS FENASOJA"}')$q$,
 'CRONOGRAMA_RESTAURANT_CONFIGURATION_REQUIRED','missing configuration rolls back mandatory forwarding');
INSERT INTO bridge_results VALUES('room',public.cronograma_save_event('{"org_id":"10000000-0000-0000-0000-000000000001","source_key":"manual-room","request_id":"50000000-0000-0000-0000-000000000002","title":"Evento da sala","location_code":"sala_voluntarios","location":"SALA DOS VOLUNTÁRIOS"}'));
INSERT INTO bridge_results VALUES('conflicting-code',public.cronograma_save_event('{"org_id":"10000000-0000-0000-0000-000000000001","source_key":"manual-code","request_id":"50000000-0000-0000-0000-000000000003","title":"Código explícito diferente","location_code":"sala_voluntarios","location":"CENTRO DE EVENTOS FENASOJA"}'));
SELECT pg_temp.expect_error($q$INSERT INTO public.cronograma_eventos(org_id,source_key,title,category,event_type,source_year,source_sheet,location,created_by_user_id)
  VALUES('10000000-0000-0000-0000-000000000001','manual-forged-casa','Autoria forjada','Outros','planejamento',2028,'Cadastro manual','CASA FENASOJA','20000000-0000-0000-0000-000000000003')$q$,
  'CRONOGRAMA_CREATOR_INVALID','a direct other-location insert cannot forge creator before moving into bridge');
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.cronograma_eventos WHERE source_key='manual-disabled'),'origin rollback');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.venue_mutation_receipts WHERE idempotency_key='50000000-0000-0000-0000-000000000001'),'receipt rollback');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.venue_events)=0,'Sala and conflicting code create no venue request');
INSERT INTO agenda_private.cronograma_restaurant_config(org_id,responsible_user_id,enabled,configured_by)
VALUES('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003',true,'20000000-0000-0000-0000-000000000004');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.audit_log WHERE entity='cronograma_restaurant_config')=1,'explicit configuration is audited');
SELECT pg_temp.expect_error($q$UPDATE agenda_private.cronograma_restaurant_config SET responsible_user_id='20000000-0000-0000-0000-000000000001'$q$,
 'CRONOGRAMA_RESTAURANT_RESPONSIBLE_INVALID','configuration cannot enable a requester without existing approval permission');
SELECT pg_temp.expect_error($q$UPDATE agenda_private.cronograma_restaurant_config SET configured_by='20000000-0000-0000-0000-000000000001'$q$,
 'CRONOGRAMA_RESTAURANT_CONFIG_ADMIN_REQUIRED','configuration records a verified active administrator');
SELECT pg_temp.assert_true((SELECT responsible_user_id='20000000-0000-0000-0000-000000000003' AND revision=1 FROM agenda_private.cronograma_restaurant_config),'invalid configuration changes roll back');

SET ROLE authenticated;
INSERT INTO bridge_results VALUES('complete',public.cronograma_save_event('{"org_id":"10000000-0000-0000-0000-000000000001","source_key":"manual-complete","request_id":"50000000-0000-0000-0000-000000000004","title":"Evento de virada","description":"Descrição privada que não deve sair","start_date":"2028-05-10","end_date":"2028-05-10","start_time":"23:00","end_time":"02:00","has_exact_date":true,"location":"CENTRO DE EVENTOS FENASOJA","location_code":"centro_eventos_fenasoja","created_by_user_id":"20000000-0000-0000-0000-000000000004","responsible_user_id":"20000000-0000-0000-0000-000000000004"}'));
INSERT INTO bridge_results VALUES('complete-replay',public.cronograma_save_event('{"org_id":"10000000-0000-0000-0000-000000000001","source_key":"manual-complete","request_id":"50000000-0000-0000-0000-000000000004","title":"Evento de virada","description":"Descrição privada que não deve sair","start_date":"2028-05-10","end_date":"2028-05-10","start_time":"23:00","end_time":"02:00","has_exact_date":true,"location":"CENTRO DE EVENTOS FENASOJA","location_code":"centro_eventos_fenasoja","created_by_user_id":"20000000-0000-0000-0000-000000000004","responsible_user_id":"20000000-0000-0000-0000-000000000004"}'));
SELECT pg_temp.assert_true((SELECT result->>'replayed'='true' FROM bridge_results WHERE label='complete-replay'),'durable replay returns original result');
SELECT pg_temp.assert_true(NOT public.venue_has_capability('10000000-0000-0000-0000-000000000001','venue_events_access'),'Cronograma writer receives no Restaurant capability');
SELECT pg_temp.expect_error($q$SELECT public.cronograma_save_event('{"org_id":"10000000-0000-0000-0000-000000000001","source_key":"manual-complete","request_id":"50000000-0000-0000-0000-000000000004","title":"Payload diferente"}')$q$,
 'VENUE_IDEMPOTENCY_MISMATCH','reused submission cannot mutate payload');
SELECT pg_temp.expect_error($q$SELECT public.cronograma_save_event('{"org_id":"10000000-0000-0000-0000-000000000001","source_key":"manual-complete","request_id":"50000000-0000-0000-0000-000000000005","title":"Outra aba"}')$q$,
 'CRONOGRAMA_CONFLICT','same source in another submission cannot silently overwrite');
INSERT INTO bridge_results VALUES('pending',public.cronograma_save_event('{"org_id":"10000000-0000-0000-0000-000000000001","source_key":"manual-pending","request_id":"50000000-0000-0000-0000-000000000006","title":"Pedido com datas incompletas","start_date":"2028-05-12","end_date":"2028-05-15","has_exact_date":true,"location":"centro   de eventos fenasoja"}'));
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*) FROM public.venue_events)=2,'one target per origin under retries');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.venue_events WHERE status='solicitado' AND approval_status='pendente')=1,'complete request is submitted pending validation');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.venue_events WHERE status='pendente_informacoes' AND approval_status='pendente' AND start_at IS NULL AND end_at IS NULL)=1,'incomplete request remains pending without invented timestamps');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.venue_event_spaces WHERE space_id='30000000-0000-0000-0000-000000000001' AND NOT blocks_availability)=2,'Restaurant only, pending does not reserve availability');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.venue_occupancies)=0,'no occupancy before approval');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.venue_events WHERE created_by<>'20000000-0000-0000-0000-000000000001' OR requester_user_id<>created_by OR responsible_user_id<>'20000000-0000-0000-0000-000000000003'),'creator and requester verified server side, responsible separate');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.venue_events WHERE executive_description IS NOT NULL OR cronograma_source_snapshot::text LIKE '%Descrição privada%'),'restricted description is not mirrored');
SELECT pg_temp.assert_true((SELECT end_at-start_at=interval '3 hours' FROM public.venue_events WHERE title='Evento de virada'),'overnight interval preserved');
SELECT pg_temp.assert_true((SELECT cronograma_source_snapshot->>'start_date'='2028-05-12' AND cronograma_source_snapshot->>'end_date'='2028-05-15' FROM public.venue_events WHERE title='Pedido com datas incompletas'),'partial source interval retained explicitly');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.venue_event_approvals WHERE decision='enviado')=2,'submit history once per request');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.audit_log WHERE entity='venue_event' AND after_data->>'venue_action'='cronograma_forwarded')=2,'bridge audit uses existing event visibility-scoped history entity');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',false);
SELECT public.venue_save_event(e.org_id,e.id,e.version,'50000000-0000-0000-0000-000000000020',
  jsonb_build_object('title',e.title,'event_type',e.event_type,'requested_area',e.requested_area,'pending_date',e.pending_date,
    'start_at',e.start_at,'end_at',e.end_at,'setup_start_at',e.setup_start_at,'teardown_end_at',e.teardown_end_at,
    'requester_name',e.requester_name,'responsible_user_id',e.responsible_user_id,'priority',e.priority,'visibility',e.visibility,
    'venue_ids',jsonb_build_array('30000000-0000-0000-0000-000000000001'),'observations','Nota operacional preservada',
    'resources','[]'::jsonb,'supporting_responsible_user_ids','[]'::jsonb))
  FROM public.venue_events e WHERE e.title='Pedido com datas incompletas';
SELECT public.venue_save_event(e.org_id,e.id,e.version,'50000000-0000-0000-0000-000000000021',
  jsonb_build_object('title',e.title,'event_type',e.event_type,'requested_area',e.requested_area,'pending_date',e.pending_date,
    'start_at',e.start_at,'end_at',e.end_at,'setup_start_at',e.start_at-interval '2 hours','teardown_end_at',e.end_at+interval '1 hour',
    'requester_name',e.requester_name,'responsible_user_id',e.responsible_user_id,'priority',e.priority,'visibility',e.visibility,
    'venue_ids',jsonb_build_array('30000000-0000-0000-0000-000000000001'),
    'resources','[]'::jsonb,'supporting_responsible_user_ids','[]'::jsonb))
  FROM public.venue_events e WHERE e.title='Evento de virada';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT observations='Nota operacional preservada' AND status='pendente_informacoes' FROM public.venue_events WHERE title='Pedido com datas incompletas'),'existing Venue save accepts source-owned fields and preserves pending approval');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
INSERT INTO bridge_results SELECT 'edit-other',public.cronograma_save_event(jsonb_build_object('org_id','10000000-0000-0000-0000-000000000001','id',result->>'id','request_id','50000000-0000-0000-0000-000000000007','title','Evento editado por outra pessoa'),1) FROM bridge_results WHERE label='complete';
SELECT pg_temp.expect_error(format($q$SELECT public.cronograma_save_event(%L::jsonb,1)$q$,
  jsonb_build_object('org_id','10000000-0000-0000-0000-000000000001','id',(SELECT result->>'id' FROM bridge_results WHERE label='complete'),'request_id','50000000-0000-0000-0000-000000000008','title','Edição desatualizada')),
 'CRONOGRAMA_CONFLICT','stale source lock version rejected');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.cronograma_restaurant_alert('10000000-0000-0000-0000-000000000001','2028-05-10','2028-05-10',(SELECT (result->>'id')::uuid FROM bridge_results WHERE label='complete')))=0,'self alert excluded by explicit link');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.cronograma_restaurant_alert('10000000-0000-0000-0000-000000000001','2028-05-10','2028-05-10'))=1,'consultative alert still sees other request under existing rule');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT created_by='20000000-0000-0000-0000-000000000001' AND updated_by='20000000-0000-0000-0000-000000000002' FROM public.venue_events WHERE title='Evento editado por outra pessoa'),'another editor never becomes creator');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',false);
SELECT pg_temp.expect_error(format($q$SELECT public.venue_transition_event('10000000-0000-0000-0000-000000000001',%L::uuid,%s,'approve',NULL,'50000000-0000-0000-0000-000000000009')$q$,
  (SELECT result->'restaurant_forwarding'->>'event_id' FROM bridge_results WHERE label='edit-other'),
  (SELECT version FROM public.venue_events WHERE title='Evento editado por outra pessoa')),
 'VENUE_CRONOGRAMA_DESIGNATED_APPROVER_REQUIRED','another administrator cannot silently substitute the configured validator');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',false);
INSERT INTO bridge_results SELECT 'approved',public.venue_transition_event('10000000-0000-0000-0000-000000000001',id,version,'approve',NULL,'50000000-0000-0000-0000-000000000010') FROM public.venue_events WHERE title='Evento editado por outra pessoa';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*) FROM public.venue_occupancies)=1,'existing approval alone creates occupancy');
SELECT pg_temp.assert_true((SELECT status='planejado' FROM public.cronograma_eventos WHERE source_key='manual-complete'),'Restaurant approval does not alter Agenda status');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
INSERT INTO bridge_results SELECT 'minor-edit',public.cronograma_save_event(jsonb_build_object('org_id','10000000-0000-0000-0000-000000000001','id',result->>'id','request_id','50000000-0000-0000-0000-000000000011','description','Descrição minoritária mantida apenas na origem'),2) FROM bridge_results WHERE label='complete';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT status='aprovado' AND approval_status='aprovado' FROM public.venue_events WHERE title='Evento editado por outra pessoa'),'minor nonmirrored description preserves approval');
SET ROLE authenticated;
INSERT INTO bridge_results SELECT 'material-edit',public.cronograma_save_event(jsonb_build_object('org_id','10000000-0000-0000-0000-000000000001','id',result->>'id','request_id','50000000-0000-0000-0000-000000000012','start_date','2028-05-11','end_date','2028-05-11'),3) FROM bridge_results WHERE label='complete';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT status='solicitado' AND approval_status='pendente' FROM public.venue_events WHERE title='Evento editado por outra pessoa'),'material source change invalidates prior approval');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.venue_occupancies)=0,'material change releases approved occupancy for new analysis');
SELECT pg_temp.assert_true((SELECT start_at-setup_start_at=interval '2 hours' AND teardown_end_at-end_at=interval '1 hour' FROM public.venue_events WHERE title='Evento editado por outra pessoa'),'source date changes preserve independently edited operational buffers');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',false);
SELECT public.venue_transition_event('10000000-0000-0000-0000-000000000001',id,version,'approve',NULL,'50000000-0000-0000-0000-000000000013') FROM public.venue_events WHERE title='Evento editado por outra pessoa';
SELECT public.venue_transition_event('10000000-0000-0000-0000-000000000001',id,version,'confirm',NULL,'50000000-0000-0000-0000-000000000014') FROM public.venue_events WHERE title='Evento editado por outra pessoa';
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
SELECT pg_temp.expect_error(format($q$SELECT public.cronograma_save_event(%L::jsonb,4)$q$,
 jsonb_build_object('org_id','10000000-0000-0000-0000-000000000001','id',(SELECT result->>'id' FROM bridge_results WHERE label='complete'),'request_id','50000000-0000-0000-0000-000000000015','location_code','sala_voluntarios','location','SALA DOS VOLUNTÁRIOS')),
 'CRONOGRAMA_RESTAURANT_PROTECTED','confirmed target prevents silent source transfer and rolls back origin');
SELECT pg_temp.expect_error(format($q$SELECT public.cronograma_delete_event(%L::uuid,'10000000-0000-0000-0000-000000000001','manual-complete',4)$q$,(SELECT result->>'id' FROM bridge_results WHERE label='complete')),
 'CRONOGRAMA_RESTAURANT_PROTECTED','confirmed target prevents source deletion');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT lock_version=4 AND location_code='centro_eventos_fenasoja' FROM public.cronograma_eventos WHERE source_key='manual-complete'),'protected changes rolled back completely');
SELECT pg_temp.expect_error($q$UPDATE public.cronograma_eventos SET title='Importação indevida',lock_version=lock_version+1 WHERE source_key='manual-complete'$q$,
 'CRONOGRAMA_CONFLICT','direct linked imports cannot bypass versioned save');
SELECT pg_temp.expect_error($q$DELETE FROM public.venue_events WHERE title='Evento editado por outra pessoa'$q$,
 'VENUE_CRONOGRAMA_HISTORY_REQUIRED','linked Restaurant history cannot be deleted directly');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
SELECT public.cronograma_save_event(jsonb_build_object('org_id','10000000-0000-0000-0000-000000000001',
  'id',(SELECT result->>'id' FROM bridge_results WHERE label='complete'),'request_id','50000000-0000-0000-0000-000000000025',
  'location_code','centro_eventos_fenasoja','location','  centro   de eventos fenasoja  '),4);
RESET ROLE;
SELECT pg_temp.assert_true((SELECT status='confirmado' AND approval_status='aprovado' FROM public.venue_events WHERE title='Evento editado por outra pessoa'),'same canonical location spelling is a minor edit and preserves protected approval');
SELECT pg_temp.expect_error($q$INSERT INTO public.venue_event_resources(org_id,event_id,resource_type,quantity,created_by,updated_by)
 SELECT org_id,id,'limpeza',1,created_by,updated_by FROM public.venue_events WHERE title='Evento editado por outra pessoa'$q$,
 'CRONOGRAMA_RESTAURANT_PROTECTED','resource changes cannot bypass confirmed-operation protections');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
INSERT INTO bridge_results SELECT 'detached',public.cronograma_save_event(jsonb_build_object('org_id','10000000-0000-0000-0000-000000000001','id',result->>'id','request_id','50000000-0000-0000-0000-000000000016','location_code','sala_voluntarios','location','SALA DOS VOLUNTÁRIOS'),1) FROM bridge_results WHERE label='pending';
SELECT public.cronograma_delete_event((SELECT (result->>'id')::uuid FROM bridge_results WHERE label='pending'),'10000000-0000-0000-0000-000000000001','manual-pending',2);
RESET ROLE;
SELECT pg_temp.assert_true((SELECT status='cancelado' FROM public.venue_events WHERE title='Pedido com datas incompletas'),'location removal cancels only unprotected pending target');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.cronograma_evento_tombstones WHERE source_key='manual-pending')=1,'source tombstone kept');
SELECT pg_temp.assert_true((SELECT deleted_at IS NOT NULL AND detached_at IS NOT NULL FROM agenda_private.cronograma_restaurant_links WHERE source_event_id=(SELECT (result->>'id')::uuid FROM bridge_results WHERE label='pending')),'deleted relation retains source and destination history');
SELECT pg_temp.assert_true((SELECT observations='Nota operacional preservada' FROM public.venue_events WHERE title='Pedido com datas incompletas'),'operational data survives detach and source deletion');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
SELECT pg_temp.expect_error($q$SELECT public.cronograma_save_event('{"org_id":"10000000-0000-0000-0000-000000000001","source_key":"manual-pending","request_id":"50000000-0000-0000-0000-000000000022","title":"Tentativa de ressuscitar evento excluído","location_code":"centro_eventos_fenasoja"}')$q$,
 'CRONOGRAMA_DELETED_SOURCE','a new retry identity cannot resurrect an origin tombstone');
RESET ROLE;
DELETE FROM public.user_capabilities WHERE org_id='10000000-0000-0000-0000-000000000001' AND user_id='20000000-0000-0000-0000-000000000003' AND capability='venue_events_approve';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',false);
SELECT pg_temp.expect_error(format($q$SELECT public.venue_transition_event('10000000-0000-0000-0000-000000000001',%L::uuid,%s,'approve',NULL,'50000000-0000-0000-0000-000000000010')$q$,
 (SELECT result->>'event_id' FROM bridge_results WHERE label='approved'),(SELECT (result->>'version')::integer-1 FROM bridge_results WHERE label='approved')),
 'CRONOGRAMA_RESTAURANT_RESPONSIBLE_INVALID','approval replay rechecks current permission and verified configuration');
RESET ROLE;
INSERT INTO public.user_capabilities VALUES('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','venue_events_approve');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',false);
SELECT pg_temp.assert_true((SELECT count(*) FROM public.cronograma_eventos)=0,'restricted user cannot see other source events just because location is shared');
SELECT pg_temp.expect_error(format($q$SELECT public.cronograma_restaurant_alert('10000000-0000-0000-0000-000000000001','2028-05-10','2028-05-10',%L::uuid)$q$,(SELECT result->>'id' FROM bridge_results WHERE label='complete')),
 'Not authorized','restricted user cannot exclude or learn hidden source linkage');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000006',false);
SELECT pg_temp.expect_error($q$SELECT public.cronograma_save_event('{"org_id":"10000000-0000-0000-0000-000000000001","source_key":"manual-foreign","request_id":"50000000-0000-0000-0000-000000000017","title":"Outra organização","location_code":"centro_eventos_fenasoja"}')$q$,
 'CRONOGRAMA_PERMISSION_DENIED','organization isolation');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*) FROM agenda_private.cronograma_restaurant_write_context)=0 AND (SELECT count(*) FROM agenda_private.cronograma_source_write_context)=0,'transaction capability context is cleaned');

-- Existing commission entry point participates in the same transaction and returns
-- the version that was actually viewed; its visibility remains an invoker query.
INSERT INTO public.commissions(id,org_id,nome,slug) VALUES
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Unidade sintética','unidade-sintetica'),
 ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Unidade outra organização','outra-unidade');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
INSERT INTO bridge_results VALUES('unit',public.cronograma_save_event('{"org_id":"10000000-0000-0000-0000-000000000001","source_key":"manual-unit","request_id":"50000000-0000-0000-0000-000000000023","title":"Evento longo da unidade","start_date":"2028-11-10","end_date":"2028-11-13","start_time":"08:00","end_time":"17:00","has_exact_date":true,"location_code":"centro_eventos_fenasoja","location":"CENTRO DE EVENTOS FENASOJA","origin_commission_id":"60000000-0000-0000-0000-000000000001","commissions":[{"commission_id":"60000000-0000-0000-0000-000000000001","commission_slug":"unidade-sintetica","commission_name":"Unidade sintética","relation_role":"principal"}]}'));
SELECT pg_temp.assert_true((SELECT lock_version=1 AND location_code='centro_eventos_fenasoja' AND source_key='manual-unit' AND origin_source='unidade'
 FROM public.cronograma_unit_agenda('60000000-0000-0000-0000-000000000001')),'unit RPC returns origin, canonical location and original version in same snapshot');
SELECT pg_temp.expect_error($q$SELECT public.cronograma_save_event('{"org_id":"10000000-0000-0000-0000-000000000001","source_key":"manual-unit-wrong","request_id":"50000000-0000-0000-0000-000000000024","title":"Origem em outra organização","origin_commission_id":"60000000-0000-0000-0000-000000000002","commissions":[{"commission_id":"60000000-0000-0000-0000-000000000002","relation_role":"principal"}]}')$q$,
 'CRONOGRAMA_PERMISSION_DENIED','unit origin cannot target another organization');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*) FROM public.venue_events WHERE cronograma_source_event_id=(SELECT (result->>'id')::uuid FROM bridge_results WHERE label='unit'))=1,'unit origin, source and linked request committed in one save');
SELECT pg_temp.assert_true((SELECT end_at-start_at=interval '3 days 9 hours' FROM public.venue_events WHERE title='Evento longo da unidade'),'multi-day interval is retained');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.cronograma_unit_agenda(uuid)','EXECUTE'),'unit RPC keeps anonymous execution closed after signature extension');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',false);
SELECT public.venue_transition_event(e.org_id,e.id,e.version,'approve',NULL,'50000000-0000-0000-0000-000000000026') FROM public.venue_events e WHERE e.title='Evento longo da unidade';
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',false);
INSERT INTO bridge_results SELECT 'resource-save',public.venue_save_event(e.org_id,e.id,e.version,'50000000-0000-0000-0000-000000000027',
 jsonb_build_object('title',e.title,'event_type',e.event_type,'requested_area',e.requested_area,'pending_date',e.pending_date,
   'start_at',e.start_at,'end_at',e.end_at,'setup_start_at',e.setup_start_at,'teardown_end_at',e.teardown_end_at,
   'requester_name',e.requester_name,'responsible_user_id',e.responsible_user_id,'priority',e.priority,'visibility',e.visibility,
   'venue_ids',jsonb_build_array('30000000-0000-0000-0000-000000000001'),
   'resources',jsonb_build_array(jsonb_build_object('resource_type','limpeza','quantity',1)),
   'supporting_responsible_user_ids','[]'::jsonb)) FROM public.venue_events e WHERE e.title='Evento longo da unidade';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT (r.result->>'version')::integer=e.version AND r.result->>'status'=e.status
 FROM bridge_results r JOIN public.venue_events e ON e.id=(r.result->>'event_id')::uuid WHERE r.label='resource-save'),'linked Venue resource save returns current persisted status and version');
SELECT pg_temp.assert_true((SELECT approval_status='pendente' AND status IN ('solicitado','reprogramado') FROM public.venue_events WHERE title='Evento longo da unidade'),'material destination resource changes require validation through existing workflow');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.venue_occupancies o JOIN public.venue_events e ON e.id=o.event_id WHERE e.title='Evento longo da unidade'),'resource change releases target occupancy while pending validation');
