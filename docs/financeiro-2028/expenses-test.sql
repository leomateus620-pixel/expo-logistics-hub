-- Despesas 2028 — teste integrado SEM efeito: roda as RPCs reais como papel `authenticated`
-- (admin e operador sem capacidade financeira) e termina SEMPRE com exceção, revertendo tudo.
-- Resultado esperado: ERROR "EXPENSES_TEST_OK | ..." com o registro de cada verificação.
-- Parâmetros: org, edição 2028, edição 2026, admin, operador logístico.
DO $test$
DECLARE
  org uuid := '985888b8-155f-4bbe-b6b9-6bef2893d99b';
  e28 uuid := '4e4b9eaa-6cc5-47c2-9b3a-3b577019afd6';
  e26 uuid := '48597a4b-f153-47a9-9616-798b581a360e';
  adm uuid := 'b664fc22-69d3-40f1-8370-16b8a07ec402';
  op  uuid := '87d4fa05-375e-4e8f-9b56-d1b0c5d442b2';
  log text := ''; r jsonb; r2 jsonb; exp1 uuid; exp2 uuid; cat uuid; cat2 uuid; obl uuid; mv uuid; v int; k uuid := gen_random_uuid(); n bigint;
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',adm,'role','authenticated')::text, true);

  -- Categorias
  r := public.financial_seed_expense_categories(org, gen_random_uuid());
  r2 := public.financial_seed_expense_categories(org, gen_random_uuid());
  log := log || format('seed:%s/%s ', r->>'created', r2->>'created');
  SELECT id INTO cat FROM public.financial_categories WHERE org_id=org AND domain='despesa' AND name='Segurança';
  r := public.financial_save_category(org, jsonb_build_object('name','Subcat teste','parent_id',cat,'color','#1d4ed8','icon','shield'), NULL, gen_random_uuid());
  cat2 := (r->>'id')::uuid;
  BEGIN PERFORM public.financial_save_category(org, jsonb_build_object('id',cat,'parent_id',cat2), 1, gen_random_uuid());
    log := log || 'FAIL:cycle '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:cycle '; END;
  BEGIN PERFORM public.financial_save_category(org, jsonb_build_object('name','segurança'), NULL, gen_random_uuid());
    log := log || 'FAIL:dup '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:dup '; END;

  -- Cadastro projetada + idempotência
  r := public.financial_save_expense(org, jsonb_build_object('edition_id',e28,'title','Teste palco','category_id',cat,'planned_cents',100000,'planned_on','2027-10-01'), NULL, k);
  r2 := public.financial_save_expense(org, jsonb_build_object('edition_id',e28,'title','Teste palco','category_id',cat,'planned_cents',100000,'planned_on','2027-10-01'), NULL, k);
  exp1 := (r->>'id')::uuid;
  log := log || CASE WHEN r2->>'id' = r->>'id' THEN 'ok:replay ' ELSE 'FAIL:replay ' END;
  BEGIN PERFORM public.financial_save_expense(org, jsonb_build_object('edition_id',e28,'title','Outro','planned_cents',1), NULL, k);
    log := log || 'FAIL:keyconflict '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:keyconflict '; END;
  BEGIN PERFORM public.financial_save_expense(org, jsonb_build_object('edition_id',e28,'title','X pago','planned_cents',1,'paid_cents',1), NULL, gen_random_uuid());
    log := log || 'FAIL:paidfield '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:paidfield '; END;
  BEGIN PERFORM public.financial_save_expense(org, jsonb_build_object('edition_id',e28,'title','Fração','planned_cents',1.5), NULL, gen_random_uuid());
    log := log || 'FAIL:fraction '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:fraction '; END;
  BEGIN PERFORM public.financial_save_expense(org, jsonb_build_object('edition_id',e26,'title','Hist','planned_cents',1), NULL, gen_random_uuid());
    log := log || 'FAIL:2026 '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:2026 '; END;

  -- Edição com versão + conflito
  r := public.financial_save_expense(org, jsonb_build_object('id',exp1,'title','Teste palco principal'), 1, gen_random_uuid());
  log := log || format('edit:v%s ', r->>'version');
  BEGIN PERFORM public.financial_save_expense(org, jsonb_build_object('id',exp1,'title','Stale'), 1, gen_random_uuid());
    log := log || 'FAIL:conflict '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:conflict '; END;

  -- Realizar → obrigação única, previsão preservada
  r := public.financial_transition_expense(org, exp1, 'realizada', 2, jsonb_build_object('committed_cents',120000,'committed_on','2027-11-01','due_date','2027-12-01'), NULL, gen_random_uuid());
  SELECT count(*) INTO n FROM public.financial_obligations WHERE source_type='despesa' AND source_id=exp1;
  obl := (r->>'obligation_id')::uuid;
  log := log || format('realize:planned=%s,committed=%s,obl=%s ', r->>'planned_cents', r->>'committed_cents', n);

  -- Realizada direta sem previsão
  r := public.financial_save_expense(org, jsonb_build_object('edition_id',e28,'status','realizada','title','Teste segurança','committed_cents',50000,'committed_on','2027-11-02'), NULL, gen_random_uuid());
  exp2 := (r->>'id')::uuid;
  log := log || format('direct:planned=%s ', coalesce(r->>'planned_cents','null'));

  -- Pagamento parcial, acima do saldo, estorno
  r := public.financial_record_movement(org, jsonb_build_object('edition_id',e28,'kind','pagamento','direction','saida','amount_cents',40000,'occurred_on','2027-11-10'),
        jsonb_build_array(jsonb_build_object('obligation_id',obl,'amount_cents',40000)), gen_random_uuid());
  mv := (r->>'id')::uuid;
  BEGIN PERFORM public.financial_record_movement(org, jsonb_build_object('edition_id',e28,'kind','pagamento','direction','saida','amount_cents',90000,'occurred_on','2027-11-11'),
        jsonb_build_array(jsonb_build_object('obligation_id',obl,'amount_cents',90000)), gen_random_uuid());
    log := log || 'FAIL:overpay '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:overpay '; END;
  BEGIN PERFORM public.financial_transition_expense(org, exp1, 'cancelada', 3, '{}'::jsonb, 'Cancelar com pagamento', gen_random_uuid());
    log := log || 'FAIL:cancelpaid '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:cancelpaid '; END;
  BEGIN PERFORM public.financial_save_expense(org, jsonb_build_object('id',exp1,'committed_cents',30000), 3, gen_random_uuid());
    log := log || 'FAIL:belowsettled '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:belowsettled '; END;
  r := public.financial_expense_comparison(org, e28, '{}'::jsonb);
  log := log || format('cmp:planned=%s,committed=%s,paid=%s,open=%s,dev=%s,pct=%s,noplan=%s ',
    r#>>'{totals,planned_cents}', r#>>'{totals,committed_cents}', r#>>'{totals,paid_cents}', r#>>'{totals,open_cents}',
    r#>>'{totals,deviation_cents}', r#>>'{totals,deviation_pct}', r#>>'{totals,realized_without_plan_count}');
  PERFORM public.financial_reverse_movement(org, mv, 'Estorno de teste', '2027-11-12', gen_random_uuid());
  log := log || format('reversed:paid=%s ', public.financial_list_expenses(org,e28,jsonb_build_object('q','palco'),1,0)#>>'{items,0,paid_cents}');
  r := public.financial_transition_expense(org, exp1, 'prevista', 3, '{}'::jsonb, 'Revisão após estorno', gen_random_uuid());
  log := log || format('revert:status=%s,planned=%s ', r->>'status', r->>'planned_cents');
  BEGIN PERFORM public.financial_transition_expense(org, exp2, 'prevista', 1, '{}'::jsonb, 'Sem previsão', gen_random_uuid());
    log := log || 'FAIL:revertnoplan '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:revertnoplan '; END;
  r := public.financial_transition_expense(org, exp1, 'cancelada', 4, '{}'::jsonb, 'Cancelada no teste', gen_random_uuid());
  log := log || format('cancel:%s ', r->>'status');

  -- Paginação não altera totais
  r := public.financial_list_expenses(org, e28, '{}'::jsonb, 1, 0);
  log := log || format('page:total=%s,items=%s ', r->>'total', jsonb_array_length(r->'items'));

  -- Categoria arquivada: preserva vínculo e bloqueia novos
  SELECT version INTO v FROM public.financial_categories WHERE id=cat;
  PERFORM public.financial_save_category(org, jsonb_build_object('id',cat,'active',false), v, gen_random_uuid());
  log := log || format('archived:linked=%s ', (SELECT count(*) FROM public.expenses WHERE financial_category_id=cat));
  BEGIN PERFORM public.financial_save_expense(org, jsonb_build_object('edition_id',e28,'title','Nova','planned_cents',1,'category_id',cat), NULL, gen_random_uuid());
    log := log || 'FAIL:archivedlink '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:archivedlink '; END;

  -- Outra organização
  BEGIN PERFORM public.financial_list_expenses(gen_random_uuid(), e28, '{}'::jsonb, 10, 0);
    log := log || 'FAIL:otherorg '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:otherorg '; END;

  -- Gravação direta por admin fora da RPC
  BEGIN UPDATE public.expenses SET planned_cents = 1 WHERE id = exp2;
    log := log || 'FAIL:directadmin '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:directadmin '; END;

  -- Operador logístico sem capacidade financeira
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',op,'role','authenticated')::text, true);
  BEGIN PERFORM public.financial_list_expenses(org, e28, '{}'::jsonb, 10, 0);
    log := log || 'FAIL:oplist '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:oplist '; END;
  BEGIN PERFORM public.financial_save_expense(org, jsonb_build_object('edition_id',e28,'title','Op','planned_cents',1), NULL, gen_random_uuid());
    log := log || 'FAIL:opsave '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:opsave '; END;
  SELECT count(*) INTO n FROM public.expenses WHERE financial_edition_id IS NOT NULL;
  log := log || format('opvisible=%s ', n);
  UPDATE public.expenses SET title='hack' WHERE id=exp2; GET DIAGNOSTICS n = ROW_COUNT;
  log := log || format('opupdate=%s ', n);
  BEGIN INSERT INTO public.expenses(org_id,title,amount,status,created_by_user_id,origem_lancamento,cycle_year,expense_date,financial_edition_id,financial_status,planned_cents)
    VALUES(org,'op fin',1,'rascunho',op,'financeiro',2028,now(),e28,'prevista',1);
    log := log || 'FAIL:opinsert '; EXCEPTION WHEN OTHERS THEN log := log || 'ok:opinsert '; END;

  RAISE EXCEPTION 'EXPENSES_TEST_OK | %', log;
END $test$;
