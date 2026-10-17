-- Read-only smoke. Run with an authenticated application user/JWT, not admin.
-- Role/JWT/mutation tests live in db-qa.mjs; SQL Editor alone does not prove RLS.
SELECT 'entry counts' check_name, CASE WHEN
  (SELECT count(*) FROM public.kb_entries WHERE kb='fenasoja' AND managed_by='fenasoja-kb-seed')=372 AND
  (SELECT count(*) FROM public.kb_entries WHERE kb='expandida' AND managed_by='fenasoja-kb-seed')=2414 THEN 'OK' ELSE 'FAIL' END result;
SELECT 'question occurrences' check_name, CASE WHEN
  (SELECT count(*) FROM public.kb_questions WHERE kb='fenasoja')=1245 AND
  (SELECT count(*) FROM public.kb_questions WHERE kb='expandida')=10889 THEN 'OK' ELSE 'FAIL' END result;
SELECT 'exactly one matching canonical per entry' check_name,CASE WHEN NOT EXISTS(
  SELECT 1 FROM public.kb_entries e LEFT JOIN public.kb_questions q ON q.entry_id=e.id AND q.is_canonical AND q.question=e.canonical_question
  GROUP BY e.id HAVING count(q.id)<>1) THEN 'OK' ELSE 'FAIL' END result;
SELECT 'question versions match' check_name,CASE WHEN NOT EXISTS(
  SELECT 1 FROM public.kb_questions q JOIN public.kb_entries e ON e.id=q.entry_id WHERE q.kb_version<>e.kb_version OR q.kb<>e.kb
) THEN 'OK' ELSE 'FAIL' END result;
SELECT 'safe public sources' check_name,CASE WHEN NOT EXISTS(SELECT 1 FROM public.kb_entries WHERE NOT public.kb_valid_sources(sources,status)) THEN 'OK' ELSE 'FAIL' END result;
SELECT 'normalizer ordinal/safra' check_name,CASE WHEN
  public.kb_normalize('vigésima primeira edição')=public.kb_normalize('21ª edição') AND
  public.kb_normalize('Plano Safra 2025/26')=public.kb_normalize('Plano Safra 2025/2026') THEN 'OK' ELSE 'FAIL' END result;
WITH cases(label,query,edition,context,expected) AS (VALUES
  ('presidência 2024','Quem foi o presidente da Fenasoja 2024?',2024,'{"subject":"fenasoja","role":"president"}'::jsonb,'ED24-PRES'),
  ('décima edição','Quando foi a 10ª Fenasoja?',1994,'{"subject":"fenasoja"}'::jsonb,'ED10-DATAS'),
  ('presidência décima','Quem presidiu a 10ª edição?',1994,'{"subject":"fenasoja","role":"president"}'::jsonb,'ED10-PRES'),
  ('negócios conflitantes','Qual foi o volume de negócios da Fenasoja 2018?',2018,'{"subject":"fenasoja"}'::jsonb,'ED22-NEG'),
  ('público não confirmado','Qual foi o público da Fenasoja 1966?',1966,'{"subject":"fenasoja"}'::jsonb,'ED01-PUB'),
  ('Plano Safra empresarial','Quanto dinheiro tem o Plano Safra 2025/26?',NULL,'{"subject":"plano_safra","audience":"empresarial","reference_period":"2025/2026"}'::jsonb,'MERC-PS-002'),
  ('Plano Safra familiar','Quanto tem o Plano Safra da Agricultura Familiar 2025/2026?',NULL,'{"subject":"plano_safra","audience":"familiar","reference_period":"2025/2026"}'::jsonb,'MERC-PS-005')
) SELECT label check_name,CASE WHEN EXISTS(SELECT 1 FROM public.workers_search_kb(query,edition,NULL,3,context) result WHERE result.entry_id=expected) THEN 'OK' ELSE 'FAIL' END result FROM cases;
WITH unavailable(label,query,context) AS (VALUES
  ('população 1990 não recicla 2025','Qual a população de Santa Rosa em 1990?','{"subject":"regional","attribute":"population","reference_year":1990}'::jsonb),
  ('PIB 2022 não responde geografia','Qual era o PIB do Rio Grande do Sul em 2022?','{"subject":"regional","attribute":"gdp","reference_year":2022}'::jsonb),
  ('Plano Safra sem período coberto','Quanto tem o Plano Safra da Agricultura Familiar 2024/2025?','{"subject":"plano_safra","audience":"familiar","reference_period":"2024/2025"}'::jsonb),
  ('município não substituído por Santa Rosa','Quantos habitantes tem Alegria em 2025?','{"attribute":"population","reference_year":2025,"entity_name":"alegria"}'::jsonb)
) SELECT label check_name,CASE WHEN NOT EXISTS(SELECT 1 FROM public.workers_search_kb(query,NULL,NULL,3,context)) THEN 'OK' ELSE 'FAIL' END result FROM unavailable;
-- Collisions remain observable. Selection policy, temporal interpretation and
-- clarification are tested together with the TypeScript engine.
SELECT question_norm,count(DISTINCT entry_id) entries,array_agg(DISTINCT entry_id ORDER BY entry_id) ids
FROM public.kb_questions GROUP BY question_norm HAVING count(DISTINCT entry_id)>1 ORDER BY question_norm;
