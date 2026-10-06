-- APENAS BANCO LOCAL SINTÉTICO. Nunca executar contra o backend real.
\set ON_ERROR_STOP 1
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.organizations (id uuid PRIMARY KEY);
CREATE TABLE public.org_members (org_id uuid, user_id uuid, role text, is_active boolean DEFAULT true, PRIMARY KEY(org_id,user_id));
CREATE TABLE public.user_capabilities (org_id uuid, user_id uuid, capability text);
CREATE TABLE public.commissions (id uuid PRIMARY KEY, org_id uuid, nome text);
CREATE TABLE public.expenses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, title text NOT NULL, description text,
  amount numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'rascunho', created_by_user_id uuid NOT NULL,
  origem_lancamento text NOT NULL DEFAULT 'manual', cycle_year integer NOT NULL DEFAULT 2028,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
-- org A: admin, tesouraria (settle), editor, leitor, gestor sem capacidade; org B: admin
INSERT INTO public.organizations VALUES ('a0000000-0000-0000-0000-000000000001'),('b0000000-0000-0000-0000-000000000001');
INSERT INTO public.org_members VALUES
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','admin',true),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','leitura',true),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','leitura',true),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','leitura',true),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','gestor',true),
 ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','admin',true);
INSERT INTO public.user_capabilities VALUES
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','financial_settle'),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','financial_edit'),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','financial_access');
INSERT INTO public.commissions VALUES ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Marketing'),
 ('c0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','Outra org');

\ir financial_operational_2028.sql
\ir financial_operational_2028.sql

CREATE FUNCTION pg_temp.expect_error(_sql text, _pattern text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE _sql; EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~ _pattern THEN RAISE EXCEPTION 'esperado %, recebido %', _pattern, SQLERRM; END IF; RETURN; END;
  RAISE EXCEPTION 'esperado erro %', _pattern;
END $$;
CREATE FUNCTION pg_temp.ok(_c boolean, _m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(_c,false) THEN RAISE EXCEPTION 'FALHOU: %', _m; END IF; RAISE NOTICE 'ok: %', _m; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

SELECT pg_temp.ok((SELECT count(*) FROM financial_editions) = 4, 'edições criadas uma vez por org, migração reaplicável');
SELECT pg_temp.ok((SELECT count(*) FROM financial_budgets) = 0 AND (SELECT count(*) FROM financial_revenues) = 0, '2028 começa sem valores herdados');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
CREATE TEMP TABLE ids AS SELECT
  (SELECT id FROM financial_editions WHERE org_id='a0000000-0000-0000-0000-000000000001' AND code=2028) e28,
  (SELECT id FROM financial_editions WHERE org_id='a0000000-0000-0000-0000-000000000001' AND code=2026) e26;

-- orçamento + linhas
SELECT financial_save('a0000000-0000-0000-0000-000000000001','budget',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'commission_id','c0000000-0000-0000-0000-000000000001','budget_cap_cents',1000000,'responsible_name','Resp'),
  NULL,'30000000-0000-0000-0000-000000000001');
-- repetir não duplica
SELECT financial_save('a0000000-0000-0000-0000-000000000001','budget',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'commission_id','c0000000-0000-0000-0000-000000000001','budget_cap_cents',1000000,'responsible_name','Resp'),
  NULL,'30000000-0000-0000-0000-000000000001');
SELECT pg_temp.ok((SELECT count(*) FROM financial_budgets) = 1, 'requisição repetida não duplica orçamento');
SELECT pg_temp.expect_error($q$SELECT financial_save('a0000000-0000-0000-0000-000000000001','budget',
  jsonb_build_object('edition_id',(SELECT e26 FROM ids),'commission_id','c0000000-0000-0000-0000-000000000001'),NULL,gen_random_uuid())$q$,'READ_ONLY');
SELECT pg_temp.ok(true,'2026 é somente leitura');
SELECT pg_temp.expect_error($q$SELECT financial_save('a0000000-0000-0000-0000-000000000001','budget',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'commission_id','c0000000-0000-0000-0000-000000000002'),NULL,gen_random_uuid())$q$,'COMMISSION_INVALID');
SELECT pg_temp.ok(true,'comissão de outra org rejeitada');
CREATE TEMP TABLE bud AS SELECT id, version FROM financial_budgets;
SELECT pg_temp.expect_error($q$SELECT financial_save('a0000000-0000-0000-0000-000000000001','budget',
  jsonb_build_object('id',(SELECT id FROM bud),'budget_cap_cents',900000),1,gen_random_uuid())$q$,'REASON_REQUIRED');
SELECT financial_save('a0000000-0000-0000-0000-000000000001','budget',
  jsonb_build_object('id',(SELECT id FROM bud),'budget_cap_cents',900000),1,gen_random_uuid(),'Ajuste do teto');
SELECT pg_temp.expect_error($q$SELECT financial_save('a0000000-0000-0000-0000-000000000001','budget',
  jsonb_build_object('id',(SELECT id FROM bud),'notes','x'),1,gen_random_uuid())$q$,'CONFLICT');
SELECT pg_temp.ok(true,'versão desatualizada rejeitada');
SELECT pg_temp.ok((SELECT count(*) FROM financial_audit_events WHERE entity='budget' AND reason='Ajuste do teto'
  AND (before_data->>'budget_cap_cents')::bigint=1000000 AND (after_data->>'budget_cap_cents')::bigint=900000)=1,'histórico do teto com anterior, novo e motivo');
SELECT financial_save('a0000000-0000-0000-0000-000000000001','budget_line',
  jsonb_build_object('budget_id',(SELECT id FROM bud),'description','Mídia','planned_cents',33333),NULL,gen_random_uuid());
SELECT financial_save('a0000000-0000-0000-0000-000000000001','budget_line',
  jsonb_build_object('budget_id',(SELECT id FROM bud),'description','Gráfica','planned_cents',66667),NULL,gen_random_uuid());

-- receitas: editor não confirma
SELECT pg_temp.expect_error($q$SELECT financial_save('a0000000-0000-0000-0000-000000000001','revenue',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'description','Bilheteria','projected_cents',500000,'status','confirmada','confirmed_cents',1),NULL,gen_random_uuid())$q$,'financial_confirm');
SELECT pg_temp.ok(true,'confirmação exige financial_confirm');
SELECT financial_save('a0000000-0000-0000-0000-000000000001','revenue',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'description','Bilheteria','projected_cents',500000,'funding_type','recurso_livre'),NULL,gen_random_uuid());
SELECT financial_save('a0000000-0000-0000-0000-000000000001','sponsorship',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'name','Patrocinador X','tier','ouro','declared_cents',300000,
    'projected_free_cents',200000,'projected_rouanet_cents',100000,'in_kind_description','Credenciais','in_kind_value_cents',5000),NULL,gen_random_uuid());

-- obrigações
SELECT financial_save('a0000000-0000-0000-0000-000000000001','obligation',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'direction','receber','description','Cota patrocinador','amount_cents',100001,'due_date','2027-01-10'),NULL,gen_random_uuid());
CREATE TEMP TABLE obl AS SELECT id FROM financial_obligations;
GRANT SELECT ON ids, bud, obl TO authenticated;

-- editor não registra movimento
SELECT pg_temp.expect_error($q$SELECT financial_record_movement('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'kind','recebimento','direction','entrada','amount_cents',1,'occurred_on','2027-01-01'),
  jsonb_build_array(jsonb_build_object('obligation_id',(SELECT id FROM obl),'amount_cents',1)),gen_random_uuid())$q$,'financial_settle');
SELECT pg_temp.ok(true,'movimento exige financial_settle');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
SELECT financial_record_movement('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'kind','recebimento','direction','entrada','amount_cents',40000,'occurred_on','2027-01-05','method','PIX'),
  jsonb_build_array(jsonb_build_object('obligation_id',(SELECT id FROM obl),'amount_cents',40000)),'40000000-0000-0000-0000-000000000001');
SELECT financial_record_movement('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'kind','recebimento','direction','entrada','amount_cents',40000,'occurred_on','2027-01-05','method','PIX'),
  jsonb_build_array(jsonb_build_object('obligation_id',(SELECT id FROM obl),'amount_cents',40000)),'40000000-0000-0000-0000-000000000001');
SELECT pg_temp.ok((SELECT count(*) FROM financial_movements)=1,'recebimento repetido não duplica');
SELECT pg_temp.expect_error($q$SELECT financial_record_movement('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'kind','recebimento','direction','entrada','amount_cents',60002,'occurred_on','2027-01-06'),
  jsonb_build_array(jsonb_build_object('obligation_id',(SELECT id FROM obl),'amount_cents',60002)),gen_random_uuid())$q$,'OVER_SETTLEMENT');
SELECT pg_temp.ok((SELECT count(*) FROM financial_movements)=1,'quitação acima do valor é revertida inteira');
SELECT pg_temp.expect_error($q$SELECT financial_record_movement('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'kind','recebimento','direction','entrada','amount_cents',10,'occurred_on','2027-01-06'),
  jsonb_build_array(jsonb_build_object('obligation_id',(SELECT id FROM obl),'amount_cents',9)),gen_random_uuid())$q$,'ALLOCATION_MISMATCH');
SELECT pg_temp.ok(true,'recebimento sem alocação correspondente é rejeitado');
SELECT financial_record_movement('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'kind','recebimento','direction','entrada','amount_cents',60001,'occurred_on','2027-01-07'),
  jsonb_build_array(jsonb_build_object('obligation_id',(SELECT id FROM obl),'amount_cents',60001)),gen_random_uuid());
SELECT financial_reverse_movement('a0000000-0000-0000-0000-000000000001',
  (SELECT id FROM financial_movements WHERE amount_cents=40000),'Recebido em duplicidade','2027-01-08',gen_random_uuid());
SELECT pg_temp.expect_error($q$SELECT financial_reverse_movement('a0000000-0000-0000-0000-000000000001',
  (SELECT id FROM financial_movements WHERE amount_cents=40000 AND kind='recebimento'),'Outra vez','2027-01-08',gen_random_uuid())$q$,'duplicate|unique');
SELECT pg_temp.ok((SELECT count(*) FROM financial_movements WHERE amount_cents=40000)=2,'estorno único e movimento original preservado');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',false);
CREATE TEMP TABLE s AS SELECT financial_edition_summary('a0000000-0000-0000-0000-000000000001',(SELECT e28 FROM ids)) j;
SELECT pg_temp.ok((SELECT (j#>>'{budget,cap_cents}')::bigint=900000 AND (j#>>'{budget,planned_cents}')::bigint=100000 FROM s),'teto e planejado derivados das linhas em centavos');
SELECT pg_temp.ok((SELECT (j#>>'{revenue,projected_cents}')::bigint=500000 AND (j#>>'{revenue,confirmed_cents}')::bigint=0 FROM s),'projetado não vira confirmado');
SELECT pg_temp.ok((SELECT (j#>>'{sponsorship,projected_cents}')::bigint=300000 AND (j#>>'{sponsorship,in_kind_cents}')::bigint=5000 FROM s),'patrocínio: dinheiro e contrapartida separados');
SELECT pg_temp.ok((SELECT (j#>>'{obligations,received_cents}')::bigint=60001 AND (j#>>'{obligations,receivable_open_cents}')::bigint=40000 FROM s),'saldo derivado após estorno');
SELECT pg_temp.expect_error($q$SELECT financial_save('a0000000-0000-0000-0000-000000000001','revenue',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'description','x','projected_cents',1),NULL,gen_random_uuid())$q$,'FORBIDDEN');
SELECT pg_temp.ok(true,'leitor não grava');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',false);
SELECT pg_temp.ok((SELECT count(*) FROM financial_budgets)=0,'gestor sem capacidade financeira não lê');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT pg_temp.ok((SELECT count(*) FROM financial_budgets)=0 AND (SELECT count(*) FROM financial_editions)=2,'outra organização isolada');
SELECT pg_temp.expect_error($q$SELECT financial_edition_summary('a0000000-0000-0000-0000-000000000001',(SELECT e28 FROM ids))$q$,'FORBIDDEN');
SELECT pg_temp.ok(true,'resumo de outra org negado');
SELECT pg_temp.expect_error($q$INSERT INTO financial_revenues(org_id,edition_id,description,projected_cents,created_by,updated_by)
  VALUES('a0000000-0000-0000-0000-000000000001',(SELECT e28 FROM ids),'x',1,auth.uid(),auth.uid())$q$,'permission denied');
SELECT pg_temp.ok(true,'sem escrita direta pelo cliente');
RESET ROLE;

-- totais independentes de paginação
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
SELECT financial_save('a0000000-0000-0000-0000-000000000001','revenue',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'description','Item '||g,'projected_cents',1),NULL,gen_random_uuid())
FROM generate_series(1,1500) g;
SELECT pg_temp.ok((financial_edition_summary('a0000000-0000-0000-0000-000000000001',(SELECT e28 FROM ids))#>>'{revenue,projected_cents}')::bigint = 501500,'1.500 registros somados sem limite de listagem');
RESET ROLE;

-- execução × liquidação
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
CREATE TEMP TABLE ln AS SELECT id FROM financial_budget_lines WHERE description='Mídia';
GRANT SELECT ON ln TO authenticated;
SELECT financial_save_expense('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'title','Palco','planned_cents',50000,'budget_line_id',(SELECT id FROM ln)),NULL,gen_random_uuid());
RESET ROLE;
CREATE TEMP TABLE ex AS SELECT id FROM expenses WHERE title='Palco';
GRANT SELECT ON ex TO authenticated;
SET ROLE authenticated;
SELECT pg_temp.ok((SELECT count(*) FROM financial_obligations WHERE source_type='despesa')=0,'despesa prevista não gera saldo a pagar');
SELECT financial_save_expense('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('id',(SELECT id FROM ex),'financial_status','realizada','committed_cents',48000,'committed_on','2027-03-01','due_date','2027-04-01'),1,gen_random_uuid());
CREATE TEMP TABLE s2 AS SELECT financial_edition_summary('a0000000-0000-0000-0000-000000000001',(SELECT e28 FROM ids)) j;
SELECT pg_temp.ok((SELECT (j#>>'{expenses,committed_cents}')::bigint=48000 AND (j#>>'{expenses,paid_cents}')::bigint=0
  AND (j#>>'{expenses,payable_open_cents}')::bigint=48000 AND (j#>>'{expenses,planned_cents}')::bigint=50000 FROM s2),'realizada sem pagamento: saldo a pagar = realizado');
SELECT pg_temp.ok((SELECT (j#>>'{budget,committed_cents}')::bigint=48000 FROM s2),'orçamento executado sem nenhum pagamento');
SELECT financial_record_movement('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'kind','pagamento','direction','saida','amount_cents',20000,'occurred_on','2027-03-10'),
  jsonb_build_array(jsonb_build_object('obligation_id',(SELECT id FROM financial_obligations WHERE source_type='despesa'),'amount_cents',20000)),gen_random_uuid());
CREATE TEMP TABLE s3 AS SELECT financial_edition_summary('a0000000-0000-0000-0000-000000000001',(SELECT e28 FROM ids)) j;
SELECT pg_temp.ok((SELECT (j#>>'{expenses,committed_cents}')::bigint=48000 AND (j#>>'{expenses,paid_cents}')::bigint=20000
  AND (j#>>'{expenses,payable_open_cents}')::bigint=28000 FROM s3),'pagamento parcial reduz saldo e preserva realizado');
SELECT pg_temp.ok((financial_budget_execution('a0000000-0000-0000-0000-000000000001',(SELECT e28 FROM ids))#>>'{lines,0,payable_open_cents}')::bigint=28000,'execução por linha com saldo a pagar');
SELECT pg_temp.expect_error($q$SELECT financial_save_expense('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('id',(SELECT id FROM ex),'committed_cents',10000),2,gen_random_uuid())$q$,'BELOW_SETTLED');
SELECT pg_temp.ok(true,'realizado abaixo do pago é recusado');
SELECT pg_temp.expect_error($q$SELECT financial_record_movement('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'kind','pagamento','direction','saida','amount_cents',28001,'occurred_on','2027-03-11'),
  jsonb_build_array(jsonb_build_object('obligation_id',(SELECT id FROM financial_obligations WHERE source_type='despesa'),'amount_cents',28001)),gen_random_uuid())$q$,'OVER_SETTLEMENT');
SELECT pg_temp.ok(true,'pagamento acima do realizado é recusado');
SELECT financial_save_expense('a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('id',(SELECT id FROM ex),'financial_status','cancelada'),2,gen_random_uuid(),'Serviço desfeito');
SELECT pg_temp.ok((SELECT settlement_inconsistent AND status='aberta' FROM financial_obligations WHERE source_type='despesa'),'cancelada após pagamento fica inconsistente, sem apagar o pago');
SELECT pg_temp.ok((financial_edition_summary('a0000000-0000-0000-0000-000000000001',(SELECT e28 FROM ids))#>>'{expenses,paid_cents}')::bigint=20000,'pago preservado');
SELECT financial_save('a0000000-0000-0000-0000-000000000001','revenue',
  jsonb_build_object('edition_id',(SELECT e28 FROM ids),'description','Cota municipal','projected_cents',70000,'status','confirmada','confirmed_cents',70000),NULL,gen_random_uuid());
CREATE TEMP TABLE s4 AS SELECT financial_edition_summary('a0000000-0000-0000-0000-000000000001',(SELECT e28 FROM ids)) j;
SELECT pg_temp.ok((SELECT count(*) FROM financial_obligations WHERE source_type='receita' AND amount_cents=70000)=1,'confirmação cria saldo a receber');
SELECT pg_temp.ok((SELECT (j#>>'{revenues,received_cents}')::bigint=60001 FROM s4),'receita confirmada não entra como recebida');
RESET ROLE;
SELECT 'TODOS OS TESTES PASSARAM' AS resultado;
