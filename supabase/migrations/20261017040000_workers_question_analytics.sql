-- BOT FENASOJA: filtered questions use complete aggregates, with a bounded
-- illustrative list. Requires 20261017020000_workers_verified_analytics.sql.
-- No new business policy, privileged reader, commercial write or edition guess.
BEGIN;

CREATE OR REPLACE FUNCTION public.workers_map_inventory_summary(
  _org_id uuid,_project_id uuid DEFAULT NULL,_status text DEFAULT NULL,_block text DEFAULT NULL,
  _min_area numeric DEFAULT NULL,_max_area numeric DEFAULT NULL,_covered boolean DEFAULT NULL,
  _electricity boolean DEFAULT NULL,_water boolean DEFAULT NULL,_internet boolean DEFAULT NULL,
  _group_by text DEFAULT 'status',_edition_year integer DEFAULT NULL,
  _missing_number boolean DEFAULT NULL,_missing_area boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE chosen record;project_count integer;projects jsonb;result jsonb;edition_count integer;edition integer;
BEGIN
  PERFORM public.workers_require_read_scope(_org_id);
  IF NOT coalesce(public.map_has_explicit_capability(_org_id,'map.view'),false) THEN
    RAISE EXCEPTION 'WORKERS_MAP_DENIED' USING ERRCODE='42501';
  END IF;
  IF _group_by IS NULL OR _group_by NOT IN('status','block')
    OR (_status IS NOT NULL AND _status NOT IN('AVAILABLE','RESERVED','IN_NEGOTIATION','SALE_OPEN','SOLD','BLOCKED','UNAVAILABLE'))
    OR (_block IS NOT NULL AND char_length(btrim(_block)) NOT BETWEEN 1 AND 80)
    OR (_min_area IS NOT NULL AND (_min_area<0 OR _min_area>1000000000))
    OR (_max_area IS NOT NULL AND (_max_area<0 OR _max_area>1000000000))
    OR (_min_area IS NOT NULL AND _max_area IS NOT NULL AND _max_area<_min_area) THEN
    RAISE EXCEPTION 'INVALID_FILTERS' USING ERRCODE='22023';
  END IF;
  IF _edition_year IS NOT NULL AND (_edition_year<2000 OR _edition_year>2200) THEN
    RAISE EXCEPTION 'INVALID_FILTERS' USING ERRCODE='22023';
  END IF;
  SELECT count(*)::int,coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) ORDER BY p.name,p.id),'[]')
    INTO project_count,projects FROM public.map_projects p
    WHERE p.org_id=_org_id AND NOT p.is_archived AND (_project_id IS NULL OR p.id=_project_id);
  IF project_count<>1 THEN
    RETURN jsonb_build_object('needs_clarification',true,'question','Qual projeto do Mapa Comercial você deseja consultar?',
      'options',coalesce((SELECT jsonb_agg(p->>'name') FROM jsonb_array_elements(projects) p),'[]'));
  END IF;
  SELECT (projects->0->>'id')::uuid id,projects->0->>'name' name INTO chosen;
  SELECT count(DISTINCT r.exercise)::int,min(r.exercise) INTO edition_count,edition
    FROM public.commercial_price_rules r WHERE r.is_active
      AND (r.project_id=chosen.id OR (r.project_id IS NULL AND NOT EXISTS(
        SELECT 1 FROM public.commercial_price_rules local_rule WHERE local_rule.project_id=chosen.id AND local_rule.is_active)))
      AND (_edition_year IS NULL OR r.exercise=_edition_year);
  IF edition_count>1 OR (_edition_year IS NOT NULL AND edition_count<>1) THEN
    RETURN jsonb_build_object('needs_clarification',true,'question','Qual edição comercial configurada deseja consultar neste projeto?',
      'options',coalesce((SELECT jsonb_agg('Fenasoja '||x.exercise ORDER BY x.exercise) FROM(
        SELECT DISTINCT r.exercise FROM public.commercial_price_rules r WHERE r.is_active
          AND (r.project_id=chosen.id OR (r.project_id IS NULL AND NOT EXISTS(
            SELECT 1 FROM public.commercial_price_rules local_rule WHERE local_rule.project_id=chosen.id AND local_rule.is_active)))) x),'[]'));
  END IF;
  WITH scoped AS MATERIALIZED (
    SELECT l.id,l.display_name,l.lot_number,l.block,l.is_covered,l.has_electricity,l.has_water,l.has_internet,
      CASE WHEN l.official_area_sqm>=0 AND l.official_area_sqm::text NOT IN('NaN','Infinity','-Infinity') THEN l.official_area_sqm END area_sqm,
      CASE l.status WHEN 'AVAILABLE' THEN 'Disponível' WHEN 'RESERVED' THEN 'Reservado' WHEN 'IN_NEGOTIATION' THEN 'Em negociação'
        WHEN 'SALE_OPEN' THEN 'Venda em andamento' WHEN 'SOLD' THEN 'Vendido' WHEN 'BLOCKED' THEN 'Bloqueado'
        WHEN 'UNAVAILABLE' THEN 'Indisponível' ELSE 'Situação não detalhada' END status_label
    FROM public.commercial_lots l WHERE l.project_id=chosen.id AND l.archived_at IS NULL
      AND (_status IS NULL OR l.status=_status) AND (_block IS NULL OR lower(btrim(l.block))=lower(btrim(_block)))
      AND (_min_area IS NULL OR l.official_area_sqm>=_min_area)
      AND (_max_area IS NULL OR l.official_area_sqm<=_max_area)
      AND (_covered IS NULL OR l.is_covered=_covered) AND (_electricity IS NULL OR l.has_electricity=_electricity)
      AND (_water IS NULL OR l.has_water=_water) AND (_internet IS NULL OR l.has_internet=_internet)
  ), filtered AS MATERIALIZED (
    SELECT s.* FROM scoped s WHERE
      (_missing_number IS NULL OR (nullif(btrim(s.lot_number),'') IS NULL)=_missing_number)
      AND (_missing_area IS NULL OR (s.area_sqm IS NULL)=_missing_area)
  ), grouped AS (
    SELECT CASE WHEN _group_by='status' THEN f.status_label ELSE coalesce(nullif(btrim(f.block),''),'Sem quadra ou pavilhão informado') END label,
      count(*) count FROM filtered f GROUP BY 1
  ), ranked AS (
    SELECT g.*,row_number() OVER(ORDER BY g.count DESC,g.label) position FROM grouped g
  ), visible_groups AS (
    SELECT r.label,r.count,r.position FROM ranked r WHERE r.position<=19
    UNION ALL SELECT 'Outros',sum(r.count),20 FROM ranked r WHERE r.position>19 HAVING count(*)>0
  ), consolidated_groups AS (
    SELECT v.label,sum(v.count) count,min(v.position) position FROM visible_groups v GROUP BY v.label
  ), sample AS (
    SELECT coalesce(nullif(btrim(f.display_name),''),CASE WHEN nullif(btrim(f.lot_number),'') IS NOT NULL THEN 'Espaço '||f.lot_number ELSE 'Espaço sem número' END) name,
      nullif(btrim(f.lot_number),'') number,f.block,f.status_label status,f.area_sqm,f.is_covered covered,f.has_electricity electricity,
      f.has_water water,f.has_internet internet
    FROM filtered f ORDER BY f.block NULLS LAST,f.lot_number NULLS LAST,f.display_name,f.id LIMIT 20
  ) SELECT jsonb_build_object('scope',jsonb_strip_nulls(jsonb_build_object('complete',true,'as_of',statement_timestamp(),'timezone','America/Sao_Paulo',
      'project_id',chosen.id,'project_name',chosen.name,'edition_year',edition,'edition_label',CASE WHEN edition IS NOT NULL THEN 'Fenasoja '||edition END,
      'group_by',_group_by,'filters',jsonb_strip_nulls(jsonb_build_object(
        'status',_status,'block',nullif(btrim(_block),''),'min_area',_min_area,'max_area',_max_area,
        'covered',_covered,'electricity',_electricity,'water',_water,'internet',_internet,
        'missing_number',_missing_number,'missing_area',_missing_area)))),
    'metrics',jsonb_build_object('total',(SELECT count(*) FROM filtered),
      'area_sqm',(SELECT coalesce(sum(area_sqm),0) FROM filtered),'missing_area',(SELECT count(*) FROM filtered WHERE area_sqm IS NULL)),
    'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('label',v.label,'count',v.count) ORDER BY v.position) FROM consolidated_groups v),'[]'),
    'rows',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM sample s),'[]')) INTO result;
  IF (result#>>'{metrics,area_sqm}')::numeric>9007199254740991 THEN
    RAISE EXCEPTION 'AGGREGATE_NUMERIC_RANGE' USING ERRCODE='22003';
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.workers_agenda_query(
  _org_id uuid,_from_date date,_to_date date,_group_by text DEFAULT 'status',_relationship text DEFAULT 'all',
  _status text DEFAULT NULL,_search text DEFAULT NULL,_location text DEFAULT NULL,_category text DEFAULT NULL,
  _priority text DEFAULT NULL,_weekday integer DEFAULT NULL,_commission_id uuid DEFAULT NULL,
  _missing_time boolean DEFAULT NULL,_missing_location boolean DEFAULT NULL,_missing_category boolean DEFAULT NULL,
  _cross_midnight boolean DEFAULT NULL,_cross_period boolean DEFAULT NULL,_start_in_period boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.workers_require_read_scope(_org_id);
  IF _from_date IS NULL OR _to_date IS NULL OR _to_date<_from_date OR _to_date>_from_date+366
    OR _group_by IS NULL OR _group_by NOT IN('status','location','category','weekday','day')
    OR _relationship IS NULL OR _relationship NOT IN('all','linked','created','responsible')
    OR (_status IS NOT NULL AND _status NOT IN('planejado','em_andamento','aguardando_definicao','aguardando_responsavel','concluido','cancelado'))
    OR (_priority IS NOT NULL AND _priority NOT IN('baixa','media','alta','critica'))
    OR (_search IS NOT NULL AND char_length(btrim(_search)) NOT BETWEEN 1 AND 120)
    OR (_location IS NOT NULL AND char_length(btrim(_location)) NOT BETWEEN 1 AND 180)
    OR (_category IS NOT NULL AND char_length(btrim(_category)) NOT BETWEEN 1 AND 120)
    OR (_weekday IS NOT NULL AND _weekday NOT BETWEEN 0 AND 6) THEN
    RAISE EXCEPTION 'INVALID_FILTERS' USING ERRCODE='22023';
  END IF;
  WITH timed AS MATERIALIZED (
    SELECT e.id,e.title,e.status,e.priority,e.category,e.location,e.start_date,e.end_date,e.start_time,e.end_time,
      e.created_by_user_id,e.responsible_user_id,
      CASE WHEN e.start_time IS NOT NULL THEN (e.start_date+e.start_time) AT TIME ZONE 'America/Sao_Paulo' END a,
      CASE WHEN e.end_time IS NOT NULL THEN ((coalesce(e.end_date,e.start_date)+e.end_time)
        +CASE WHEN coalesce(e.end_date,e.start_date)=e.start_date AND e.end_time<e.start_time
          THEN interval '1 day' ELSE interval '0 day' END) AT TIME ZONE 'America/Sao_Paulo' END b,
      e.start_date distribution_day
    FROM public.cronograma_eventos e WHERE e.org_id=_org_id AND e.has_exact_date AND e.start_date IS NOT NULL
      AND (CASE WHEN _status IS NULL THEN e.status<>'cancelado' ELSE e.status=_status END)
      AND e.start_date<=_to_date AND (coalesce(e.end_date,e.start_date)+CASE WHEN coalesce(e.end_date,e.start_date)=e.start_date
        AND e.end_time<e.start_time THEN 1 ELSE 0 END)>=_from_date
      AND (_search IS NULL OR strpos(lower(e.title),lower(btrim(_search)))>0)
      AND (_location IS NULL OR lower(btrim(e.location))=lower(btrim(_location)))
      AND (_category IS NULL OR lower(btrim(e.category))=lower(btrim(_category)))
      AND (_priority IS NULL OR e.priority=_priority)
  ), links AS MATERIALIZED (
    SELECT x.event_id,bool_or(x.responsible) responsible FROM (
      SELECT t.id event_id,true responsible FROM timed t WHERE t.responsible_user_id=auth.uid()
      UNION ALL SELECT r.event_id,r.is_primary FROM public.cronograma_evento_responsaveis r
        JOIN timed t ON t.id=r.event_id WHERE r.org_id=_org_id AND r.org_member_user_id=auth.uid()
      UNION ALL SELECT s.parent_event_id,r.is_primary FROM public.cronograma_subevento_responsaveis r
        JOIN public.cronograma_subeventos s ON s.id=r.subevent_id JOIN timed t ON t.id=s.parent_event_id
        WHERE r.org_id=_org_id AND r.org_member_user_id=auth.uid() AND s.status<>'cancelado'
      UNION ALL SELECT t.id,false FROM timed t WHERE t.created_by_user_id=auth.uid()
    ) x GROUP BY x.event_id
  ), commission_events AS MATERIALIZED (
    SELECT DISTINCT c.event_id FROM public.cronograma_evento_comissoes c
      JOIN public.commissions commission ON commission.id=c.commission_id AND commission.org_id=_org_id
    WHERE c.org_id=_org_id AND _commission_id IS NOT NULL AND c.commission_id=_commission_id
  ), filtered AS MATERIALIZED (
    SELECT t.*,CASE WHEN t.b>t.a THEN extract(epoch FROM(t.b-t.a))/60 END duration_minutes,
      CASE t.status WHEN 'planejado' THEN 'Planejado' WHEN 'em_andamento' THEN 'Em andamento'
        WHEN 'aguardando_definicao' THEN 'Aguardando definição' WHEN 'aguardando_responsavel' THEN 'Aguardando responsável'
        WHEN 'concluido' THEN 'Concluído' WHEN 'cancelado' THEN 'Cancelado' ELSE 'Situação não detalhada' END status_label,
      CASE t.priority WHEN 'baixa' THEN 'Baixa' WHEN 'media' THEN 'Média' WHEN 'alta' THEN 'Alta'
        WHEN 'critica' THEN 'Crítica' ELSE 'Não informada' END priority_label
    FROM timed t LEFT JOIN links l ON l.event_id=t.id
    WHERE (_relationship='all' OR (_relationship='linked' AND l.event_id IS NOT NULL)
      OR (_relationship='created' AND t.created_by_user_id=auth.uid()) OR (_relationship='responsible' AND l.responsible))
      AND (_weekday IS NULL OR extract(dow FROM t.distribution_day)::int=_weekday)
      AND (_commission_id IS NULL OR t.id IN(SELECT event_id FROM commission_events))
      AND (_missing_time IS NULL OR (t.a IS NULL OR t.b IS NULL OR t.b<=t.a)=_missing_time)
      AND (_missing_location IS NULL OR (nullif(btrim(t.location),'') IS NULL)=_missing_location)
      AND (_missing_category IS NULL OR (nullif(btrim(t.category),'') IS NULL)=_missing_category)
      AND (_cross_midnight IS NULL OR (t.a IS NOT NULL AND t.b IS NOT NULL AND t.b>t.a
        AND (t.b AT TIME ZONE 'America/Sao_Paulo')::date<>t.start_date)=_cross_midnight)
      AND (_cross_period IS NULL OR (t.start_date<_from_date OR coalesce(
        CASE WHEN t.b>t.a THEN (t.b AT TIME ZONE 'America/Sao_Paulo')::date END,t.end_date,t.start_date)>_to_date)=_cross_period)
      AND (_start_in_period IS NULL OR (t.start_date BETWEEN _from_date AND _to_date)=_start_in_period)
  ), grouped AS (
    SELECT CASE _group_by WHEN 'status' THEN f.status_label WHEN 'location' THEN coalesce(nullif(btrim(f.location),''),'Local não informado')
      WHEN 'category' THEN coalesce(nullif(btrim(f.category),''),'Categoria não informada') WHEN 'day' THEN to_char(f.distribution_day,'DD/MM/YYYY')
      ELSE (ARRAY['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'])[extract(dow FROM f.distribution_day)::int+1] END label,
      count(*) count FROM filtered f GROUP BY 1
  ), ranked AS (
    SELECT g.*,row_number() OVER(ORDER BY g.count DESC,g.label) position FROM grouped g
  ), visible_groups AS (
    SELECT r.label,r.count,r.position FROM ranked r WHERE r.position<=19
    UNION ALL SELECT 'Outros',sum(r.count),20 FROM ranked r WHERE r.position>19 HAVING count(*)>0
  ), consolidated_groups AS (
    SELECT v.label,sum(v.count) count,min(v.position) position FROM visible_groups v GROUP BY v.label
  ), sample AS (
    SELECT f.title,f.status_label status,f.start_date,f.end_date,
      CASE WHEN f.start_time IS NOT NULL THEN to_char(date '2000-01-01'+f.start_time,'HH24"h"MI') END start_time,
      CASE WHEN f.end_time IS NOT NULL THEN to_char(date '2000-01-01'+f.end_time,'HH24"h"MI') END end_time,
      nullif(btrim(f.location),'') location,nullif(btrim(f.category),'') category,f.priority_label priority
    FROM filtered f ORDER BY f.start_date,f.start_time NULLS LAST,f.title,f.id LIMIT 20
  ) SELECT jsonb_build_object('scope',jsonb_build_object('complete',true,'as_of',statement_timestamp(),'timezone','America/Sao_Paulo',
      'period',jsonb_build_object('from',_from_date,'to',_to_date),'group_by',_group_by,
      'filters',jsonb_strip_nulls(jsonb_build_object('relationship',_relationship,'status',_status,'search',nullif(btrim(_search),''),
        'location',nullif(btrim(_location),''),'category',nullif(btrim(_category),''),'priority',_priority,'weekday',_weekday,'commission_id',_commission_id,
        'missing_time',_missing_time,'missing_location',_missing_location,'missing_category',_missing_category,
        'cross_midnight',_cross_midnight,'cross_period',_cross_period,'start_in_period',_start_in_period))),
    'metrics',jsonb_build_object('total',(SELECT count(*) FROM filtered),'valid_duration_events',(SELECT count(duration_minutes) FROM filtered),
      'average_duration_minutes',(SELECT round(avg(duration_minutes),2) FROM filtered)),
    'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('label',v.label,'count',v.count) ORDER BY v.position) FROM consolidated_groups v),'[]'),
    'rows',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM sample s),'[]')) INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.workers_map_inventory_summary(uuid,uuid,text,text,numeric,numeric,boolean,boolean,boolean,boolean,text,integer,boolean,boolean),
  public.workers_agenda_query(uuid,date,date,text,text,text,text,text,text,text,integer,uuid,boolean,boolean,boolean,boolean,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workers_map_inventory_summary(uuid,uuid,text,text,numeric,numeric,boolean,boolean,boolean,boolean,text,integer,boolean,boolean),
  public.workers_agenda_query(uuid,date,date,text,text,text,text,text,text,text,integer,uuid,boolean,boolean,boolean,boolean,boolean,boolean) TO authenticated;
COMMIT;
