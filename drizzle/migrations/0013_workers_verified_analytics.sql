-- BOT FENASOJA: complete, read-only aggregates. Apply after the existing workers
-- migrations AND drizzle 0009 (ai_workers_can_access). No RLS policy is widened.
-- All functions use the caller's JWT/RLS; no SECURITY DEFINER data reader.

CREATE OR REPLACE FUNCTION public.workers_require_read_scope(_org_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_org_member(auth.uid(),_org_id),false)
    OR NOT coalesce(public.ai_workers_can_access(_org_id),false) THEN
    RAISE EXCEPTION 'WORKERS_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.workers_map_sales_overview(
  _org_id uuid, _project_id uuid DEFAULT NULL, _edition_year integer DEFAULT NULL,
  _from_date date DEFAULT NULL, _to_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE chosen record; candidates jsonb; candidate_count integer; result jsonb;
BEGIN
  PERFORM public.workers_require_read_scope(_org_id);
  IF NOT coalesce(public.map_has_explicit_capability(_org_id,'map.manage_sales'),false) THEN
    RAISE EXCEPTION 'WORKERS_SALES_DENIED' USING ERRCODE='42501';
  END IF;
  IF _edition_year IS NOT NULL AND (_edition_year < 2000 OR _edition_year > 2200) THEN
    RAISE EXCEPTION 'INVALID_EDITION' USING ERRCODE='22023';
  END IF;
  IF (_from_date IS NULL)<>(_to_date IS NULL) OR _to_date<_from_date OR _to_date>_from_date+366 THEN
    RAISE EXCEPTION 'INVALID_INTERVAL' USING ERRCODE='22023';
  END IF;
  -- A map's reference_revision describes geometry, not its commercial edition.
  -- Resolve editions from persisted price-rule exercises, with project rules
  -- taking precedence over global configuration. Never parse a project name.
  WITH configured AS (
    SELECT DISTINCT p.id,p.name,r.exercise
    FROM public.map_projects p JOIN public.commercial_price_rules r
      ON (r.is_active AND (r.project_id=p.id OR (r.project_id IS NULL AND NOT EXISTS (
        SELECT 1 FROM public.commercial_price_rules local_rule WHERE local_rule.project_id=p.id AND local_rule.is_active))))
      OR (_edition_year IS NOT NULL AND r.exercise=_edition_year AND EXISTS (
        SELECT 1 FROM public.lot_sale_orders historical_order JOIN public.lot_sale_order_items historical_item
          ON historical_item.order_id=historical_order.id
        WHERE historical_order.project_id=p.id AND historical_item.pricing_rule_id=r.id))
    WHERE p.org_id=_org_id AND NOT p.is_archived
      AND (_project_id IS NULL OR p.id=_project_id)
      AND (_edition_year IS NULL OR r.exercise=_edition_year)
  ) SELECT count(*)::int,coalesce(jsonb_agg(jsonb_build_object('project_id',id,'project_name',name,
      'edition_year',exercise,'label','Fenasoja '||exercise||' · '||name) ORDER BY exercise,name,id),'[]')
    INTO candidate_count,candidates FROM configured;
  IF candidate_count<>1 THEN
    RETURN jsonb_build_object('needs_clarification',true,'question',CASE WHEN candidate_count=0
      THEN 'Qual edição e projeto comercial você deseja consultar? A edição precisa estar configurada e acessível.'
      ELSE 'Qual edição e projeto comercial você deseja consultar?' END,
      'options',coalesce((SELECT jsonb_agg(x->>'label') FROM jsonb_array_elements(candidates) x),'[]'));
  END IF;
  SELECT (candidates->0->>'project_id')::uuid id,candidates->0->>'project_name' name,
    (candidates->0->>'edition_year')::int exercise INTO chosen;
  WITH base AS MATERIALIZED (
    SELECT i.id,i.order_id,i.lot_id,i.contract_state,i.item_total,r.exercise,s.status sale_status,
      s.reverted_at sale_reverted_at,CASE WHEN i.contract_state='SIGNED' THEN i.signed_at
        WHEN i.contract_state='CANCELLED' THEN i.cancelled_at ELSE i.created_at END metric_at
    FROM public.lot_sale_orders o JOIN public.lot_sale_order_items i ON i.order_id=o.id
    JOIN public.commercial_lots l ON l.id=i.lot_id AND l.project_id=o.project_id
    LEFT JOIN public.lot_sales s ON s.id=i.sale_id AND s.lot_id=i.lot_id
    LEFT JOIN public.commercial_price_rules r ON r.id=i.pricing_rule_id AND (r.project_id=o.project_id OR r.project_id IS NULL)
    WHERE o.project_id=chosen.id AND o.reverted_at IS NULL AND o.status<>'REVERTED'
  ), qualified AS MATERIALIZED (
    SELECT *,CASE WHEN contract_state='SIGNED' AND sale_status='CONFIRMED' AND sale_reverted_at IS NULL THEN 'confirmed'
      WHEN contract_state='PENDING_SIGNATURE' AND sale_status='OPEN' AND sale_reverted_at IS NULL THEN 'open'
      WHEN contract_state='CANCELLED' THEN 'cancelled' ELSE 'unverified' END classification
    FROM base WHERE exercise=chosen.exercise AND (_from_date IS NULL OR (
      metric_at>=(_from_date::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND metric_at<((_to_date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')))
  ), metrics AS (
    SELECT coalesce(sum(round(item_total*100)) FILTER(WHERE classification='confirmed' AND item_total>=0),0) confirmed_value_cents,
      coalesce(sum(round(item_total*100)) FILTER(WHERE classification='open' AND item_total>=0),0) open_value_cents,
      count(DISTINCT order_id) FILTER(WHERE classification='confirmed') confirmed_orders,
      count(DISTINCT order_id) FILTER(WHERE classification='open') open_orders,
      count(DISTINCT lot_id) FILTER(WHERE classification='confirmed') confirmed_lots,
      count(DISTINCT lot_id) FILTER(WHERE classification='open') open_lots,
      count(*) FILTER(WHERE classification='cancelled') cancelled_lots,
      count(*) FILTER(WHERE classification IN ('confirmed','open') AND (item_total IS NULL OR item_total<0)) missing_value_lots,
      count(*) FILTER(WHERE classification='unverified') unverified_lots,
      count(*) FILTER(WHERE contract_state='LEGACY_UNVERIFIED') legacy_lots FROM qualified
  ), legacy AS (
    SELECT count(*) n FROM public.lot_sales s JOIN public.commercial_lots l ON l.id=s.lot_id
    WHERE l.project_id=chosen.id AND s.reverted_at IS NULL AND s.status<>'REVERTED'
      AND NOT EXISTS(SELECT 1 FROM public.lot_sale_order_items i WHERE i.sale_id=s.id)
  ) SELECT jsonb_build_object('scope',jsonb_strip_nulls(jsonb_build_object('project_id',chosen.id,'project_name',chosen.name,
      'edition_year',chosen.exercise,'edition_label','Fenasoja '||chosen.exercise,'complete',true,
      'timezone','America/Sao_Paulo','as_of',statement_timestamp(),'unit','BRL_cents',
      'period',CASE WHEN _from_date IS NOT NULL THEN jsonb_build_object('from',_from_date,'to',_to_date) END)),
    'metrics',to_jsonb(m)||jsonb_build_object('unallocated_lots',
      (SELECT count(*) FROM base WHERE exercise IS NULL)+(SELECT n FROM legacy),
      'unknown_period_lots',CASE WHEN _from_date IS NULL THEN 0 ELSE
        (SELECT count(*) FROM base WHERE exercise=chosen.exercise AND metric_at IS NULL) END),
    'notes',jsonb_build_array(
      'Valores dos espaços com confirmação registrada; taxas adicionais e pagamentos não integram estes indicadores.',
      'Quando há período, confirmados usam a data da assinatura registrada; em andamento usam a criação do item que permanece aberto. Não é uma posição histórica de como o mapa estava naquele mês.',
      'Um pedido pode conter vários espaços. Pedidos parciais aparecem nas contagens de confirmados e em andamento; essas contagens não devem ser somadas.',
      'Anexar contrato não confirma assinatura. Registros históricos, inconsistentes ou sem edição comprovada ficam fora dos valores confirmados.'))
    INTO result FROM metrics m;
  IF abs((result#>>'{metrics,confirmed_value_cents}')::numeric)>9007199254740991
    OR abs((result#>>'{metrics,open_value_cents}')::numeric)>9007199254740991 THEN
    RAISE EXCEPTION 'AGGREGATE_NUMERIC_RANGE' USING ERRCODE='22003';
  END IF;
  RETURN result;
END $$;

-- Internal reusable selection: parent events only, visible under the caller's
-- RLS. Overlap includes events crossing midnight/months. Undated and cancelled
-- events are excluded; full scheduled duration is used, never inferred presence.
CREATE OR REPLACE FUNCTION public.workers_agenda_event_scope(_org_id uuid,_from_date date,_to_date date)
RETURNS TABLE(id uuid,status text,start_date date,end_date date,start_at timestamptz,end_at timestamptz,
  duration_minutes numeric,created_by_user_id uuid,responsible_user_id uuid)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.workers_require_read_scope(_org_id);
  IF _from_date IS NULL OR _to_date IS NULL OR _to_date<_from_date OR _to_date>_from_date+366 THEN
    RAISE EXCEPTION 'INVALID_INTERVAL' USING ERRCODE='22023';
  END IF;
  RETURN QUERY WITH timed AS (
    SELECT e.id,e.status,e.start_date,e.end_date,e.created_by_user_id,e.responsible_user_id,
      CASE WHEN e.start_time IS NOT NULL THEN (e.start_date+e.start_time) AT TIME ZONE 'America/Sao_Paulo' END a,
      CASE WHEN e.end_time IS NOT NULL THEN ((coalesce(e.end_date,e.start_date)+e.end_time)
        + CASE WHEN coalesce(e.end_date,e.start_date)=e.start_date AND e.end_time<e.start_time
          THEN interval '1 day' ELSE interval '0 day' END) AT TIME ZONE 'America/Sao_Paulo' END b
    FROM public.cronograma_eventos e WHERE e.org_id=_org_id AND e.has_exact_date AND e.start_date IS NOT NULL
      AND e.status<>'cancelado' AND e.start_date<=_to_date
      AND (coalesce(e.end_date,e.start_date)+CASE WHEN coalesce(e.end_date,e.start_date)=e.start_date
          AND e.end_time<e.start_time THEN 1 ELSE 0 END)>=_from_date
  ) SELECT t.id,t.status,t.start_date,t.end_date,t.a,t.b,
      CASE WHEN t.b>t.a THEN extract(epoch FROM (t.b-t.a))/60 END,
      t.created_by_user_id,t.responsible_user_id FROM timed t;
END $$;

CREATE OR REPLACE FUNCTION public.workers_agenda_personal_summary(
  _org_id uuid,_from_date date,_to_date date,_relationship text DEFAULT 'linked')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF _relationship NOT IN ('linked','created','responsible') OR _relationship IS NULL THEN
    RAISE EXCEPTION 'INVALID_RELATIONSHIP' USING ERRCODE='22023';
  END IF;
  WITH scoped AS MATERIALIZED (SELECT * FROM public.workers_agenda_event_scope(_org_id,_from_date,_to_date)),
  links AS MATERIALIZED (
    SELECT e.id,bool_or(x.responsible) responsible FROM scoped e JOIN (
      SELECT s.id event_id,true responsible FROM scoped s WHERE s.responsible_user_id=auth.uid()
      UNION ALL SELECT r.event_id,r.is_primary FROM public.cronograma_evento_responsaveis r
        WHERE r.org_id=_org_id AND r.org_member_user_id=auth.uid()
      UNION ALL SELECT sub.parent_event_id,r.is_primary FROM public.cronograma_subevento_responsaveis r
        JOIN public.cronograma_subeventos sub ON sub.id=r.subevent_id
        WHERE r.org_id=_org_id AND r.org_member_user_id=auth.uid() AND sub.status<>'cancelado'
      UNION ALL SELECT s.id,false FROM scoped s WHERE s.created_by_user_id=auth.uid()
    ) x ON x.event_id=e.id GROUP BY e.id
  ), personal AS MATERIALIZED (
    SELECT e.*,l.responsible,e.created_by_user_id=auth.uid() created
    FROM scoped e JOIN links l ON l.id=e.id
  ), selected AS MATERIALIZED (
    SELECT * FROM personal WHERE _relationship='linked' OR (_relationship='created' AND created)
      OR (_relationship='responsible' AND responsible)
  ), weekdays AS (
    SELECT extract(dow FROM s.start_date)::int weekday,count(*) events
    FROM selected s GROUP BY 1 ORDER BY 1
  ) SELECT jsonb_build_object('scope',jsonb_build_object('period',jsonb_build_object('from',_from_date,'to',_to_date),
      'timezone','America/Sao_Paulo','complete',true,'as_of',statement_timestamp(),'relationship',_relationship,
      'duration_basis','full_scheduled_event','subevents','deduplicated_parent','cancelled','excluded'),
    'metrics',jsonb_build_object('events',(SELECT count(*) FROM selected),
      'created_events',(SELECT count(*) FROM personal WHERE created),
      'responsible_events',(SELECT count(*) FROM personal WHERE responsible),
      'linked_events',(SELECT count(*) FROM personal),
      'completed_events',(SELECT count(*) FROM selected WHERE status='concluido'),
      'past_events',(SELECT count(*) FROM selected WHERE coalesce(end_at,
        ((coalesce(end_date,start_date)+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))<=statement_timestamp()),
      'scheduled_events',(SELECT count(*) FROM selected WHERE status<>'concluido'),
      'valid_duration_events',(SELECT count(duration_minutes) FROM selected),
      'average_duration_minutes',(SELECT round(avg(duration_minutes),2) FROM selected),
      'weekday_counts',coalesce((SELECT jsonb_agg(to_jsonb(w)) FROM weekdays w),'[]')),
    'notes',jsonb_build_array('Vínculos diretos e de subeventos são reunidos por evento principal; criação e responsabilidade são identificadas pela conta autenticada.',
      'Vínculo e horário passado não comprovam presença. Concluído descreve a situação registrada do evento.',
      'A duração considera o intervalo agendado completo dos eventos com horários válidos, inclusive quando atravessam o período.')) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.workers_agenda_people_ranking(
  _org_id uuid,_from_date date,_to_date date,_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF _limit IS NULL OR _limit<1 OR _limit>30 THEN RAISE EXCEPTION 'INVALID_LIMIT' USING ERRCODE='22023'; END IF;
  WITH scoped AS MATERIALIZED (SELECT * FROM public.workers_agenda_event_scope(_org_id,_from_date,_to_date)),
  links AS MATERIALIZED (
    SELECT e.id event_id,e.created_by_user_id person_id,NULL::text name FROM scoped e
    UNION ALL SELECT e.id,e.responsible_user_id,NULL FROM scoped e
    UNION ALL SELECT r.event_id,r.org_member_user_id,r.name_snapshot FROM public.cronograma_evento_responsaveis r
      JOIN scoped e ON e.id=r.event_id WHERE r.org_id=_org_id
    UNION ALL SELECT s.parent_event_id,r.org_member_user_id,r.name_snapshot FROM public.cronograma_subevento_responsaveis r
      JOIN public.cronograma_subeventos s ON s.id=r.subevent_id JOIN scoped e ON e.id=s.parent_event_id
      WHERE r.org_id=_org_id AND s.status<>'cancelado'
  ), counted AS (
    SELECT l.person_id,coalesce(nullif(btrim(max(m.nome_exibicao)),''),nullif(btrim(max(l.name)),''),'Pessoa vinculada') name,
      count(DISTINCT l.event_id) events FROM links l
    LEFT JOIN public.org_members m ON m.org_id=_org_id AND m.user_id=l.person_id
    WHERE l.person_id IS NOT NULL GROUP BY l.person_id
  ), labelled AS (
    SELECT *,CASE WHEN count(*) OVER(PARTITION BY name)>1 THEN name||' · vínculo '||
      row_number() OVER(PARTITION BY name ORDER BY person_id) ELSE name END display_name FROM counted
  ), ranked AS (
    SELECT person_id,display_name name,events,row_number() OVER(ORDER BY events DESC,lower(name),person_id) position
    FROM labelled
  ) SELECT jsonb_build_object('scope',jsonb_build_object('period',jsonb_build_object('from',_from_date,'to',_to_date),
      'timezone','America/Sao_Paulo','complete',true,'as_of',statement_timestamp(),'unit','events'),
    'metrics',jsonb_build_object('people_count',(SELECT count(*) FROM ranked),'event_count',(SELECT count(*) FROM scoped),
      'unidentified_links',(SELECT count(*) FROM links WHERE person_id IS NULL AND name IS NOT NULL),
      'shown_people',_limit,'tie_break','name_then_id'),
    'people',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.position) FROM ranked r WHERE r.position<=_limit),'[]'),
    'notes',jsonb_build_array('Contagem distinta de eventos principais por pessoa identificada, calculada sobre todo o período autorizado; o limite afeta somente a apresentação.',
      'Vínculos externos sem identificação persistida de pessoa não entram no ranking. Vínculo não comprova presença.',
      'Empates são ordenados pelo nome. Pessoas homônimas permanecem separadas e recebem identificação de vínculo.')) INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.workers_require_read_scope(uuid),public.workers_map_sales_overview(uuid,uuid,integer,date,date),
  public.workers_agenda_event_scope(uuid,date,date),public.workers_agenda_personal_summary(uuid,date,date,text),
  public.workers_agenda_people_ranking(uuid,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workers_require_read_scope(uuid),public.workers_map_sales_overview(uuid,uuid,integer,date,date),
  public.workers_agenda_event_scope(uuid,date,date),public.workers_agenda_personal_summary(uuid,date,date,text),
  public.workers_agenda_people_ranking(uuid,date,date,integer) TO authenticated;
