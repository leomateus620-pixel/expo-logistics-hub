-- BOT FENASOJA corrective readers. Observed published cronograma_eventos
-- has NO responsible_user_id column. Preserve function signatures and all data;
-- derive participation only from official event/subevent responsible relations.
-- Commission filtering mirrors persisted Agenda associations: relation tables,
-- the main slug and linked_commissions slug array (filterCronogramaEvents and
-- modelAdapter.relatedCommissionIds). origin_commission_id is provenance only.
-- No policies, business records, historical migration replay, or new columns.

CREATE OR REPLACE FUNCTION public.workers_agenda_person_links(_org_id uuid)
RETURNS TABLE(event_id uuid,person_id uuid,name_snapshot text,responsible boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.workers_require_read_scope(_org_id);
  RETURN QUERY WITH visible AS MATERIALIZED (
    SELECT e.id FROM public.cronograma_eventos e WHERE e.org_id=_org_id
  ), links AS (
    SELECT r.event_id,r.org_member_user_id person_id,r.name_snapshot,r.is_primary responsible
    FROM public.cronograma_evento_responsaveis r JOIN visible v ON v.id=r.event_id WHERE r.org_id=_org_id
    UNION ALL
    SELECT s.parent_event_id,r.org_member_user_id,r.name_snapshot,r.is_primary
    FROM public.cronograma_subevento_responsaveis r
    JOIN public.cronograma_subeventos s ON s.id=r.subevent_id AND s.org_id=_org_id AND s.status<>'cancelado'
    JOIN visible v ON v.id=s.parent_event_id WHERE r.org_id=_org_id
  ) SELECT l.event_id,l.person_id,max(nullif(btrim(l.name_snapshot),'')),bool_or(l.responsible)
    FROM links l GROUP BY l.event_id,l.person_id;
END $$;

CREATE OR REPLACE FUNCTION public.workers_agenda_commission_links(_org_id uuid)
RETURNS TABLE(event_id uuid,commission_id uuid,name text,slug text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.workers_require_read_scope(_org_id);
  RETURN QUERY WITH visible AS MATERIALIZED (
    SELECT e.id,e.commission_slug,e.linked_commissions FROM public.cronograma_eventos e WHERE e.org_id=_org_id
  ), links AS (
    SELECT r.event_id,c.id commission_id,c.nome name,c.slug
      FROM public.cronograma_evento_comissoes r JOIN visible v ON v.id=r.event_id
      JOIN public.commissions c ON c.org_id=_org_id AND
        (c.id=r.commission_id OR (r.commission_id IS NULL AND c.slug=r.commission_slug))
      WHERE r.org_id=_org_id
    UNION ALL
    SELECT v.id,c.id,c.nome,c.slug FROM visible v JOIN public.commissions c ON c.org_id=_org_id AND c.slug=v.commission_slug
    UNION ALL
    SELECT v.id,c.id,c.nome,c.slug FROM visible v
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(v.linked_commissions)='array' THEN v.linked_commissions ELSE '[]'::jsonb END) item
      JOIN public.commissions c ON c.org_id=_org_id AND c.slug=item->>'slug'
    UNION ALL
    SELECT s.parent_event_id,c.id,c.nome,c.slug FROM public.cronograma_subevento_comissoes r
      JOIN public.cronograma_subeventos s ON s.id=r.subevent_id AND s.org_id=_org_id AND s.status<>'cancelado'
      JOIN visible v ON v.id=s.parent_event_id
      JOIN public.commissions c ON c.org_id=_org_id AND
        (c.id=r.commission_id OR (r.commission_id IS NULL AND c.slug=r.commission_slug)) WHERE r.org_id=_org_id
    UNION ALL
    SELECT s.parent_event_id,c.id,c.nome,c.slug FROM public.cronograma_subeventos s JOIN visible v ON v.id=s.parent_event_id
      JOIN public.commissions c ON c.org_id=_org_id AND c.slug=s.commission_slug
      WHERE s.org_id=_org_id AND s.status<>'cancelado'
  ) SELECT DISTINCT l.event_id,l.commission_id,l.name,l.slug FROM links l;
END $$;

CREATE OR REPLACE FUNCTION public.workers_agenda_event_scope(_org_id uuid,_from_date date,_to_date date)
RETURNS TABLE(id uuid,status text,start_date date,end_date date,start_at timestamptz,end_at timestamptz,
  duration_minutes numeric,created_by_user_id uuid,responsible_user_id uuid)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.workers_require_read_scope(_org_id);
  IF _from_date IS NULL OR _to_date IS NULL OR _to_date<_from_date OR _to_date>_from_date+366 THEN
    RAISE EXCEPTION 'INVALID_INTERVAL' USING ERRCODE='22023';
  END IF;
  RETURN QUERY WITH primary_people AS MATERIALIZED (
    SELECT DISTINCT ON(r.event_id) r.event_id,r.org_member_user_id
    FROM public.cronograma_evento_responsaveis r WHERE r.org_id=_org_id AND r.is_primary AND r.org_member_user_id IS NOT NULL
    ORDER BY r.event_id,r.org_member_user_id
  ), timed AS (
    SELECT e.id,e.status,e.start_date,e.end_date,e.created_by_user_id,p.org_member_user_id responsible_user_id,
      CASE WHEN e.start_time IS NOT NULL THEN (e.start_date+e.start_time) AT TIME ZONE 'America/Sao_Paulo' END a,
      CASE WHEN e.end_time IS NOT NULL THEN ((coalesce(e.end_date,e.start_date)+e.end_time)
        + CASE WHEN coalesce(e.end_date,e.start_date)=e.start_date AND e.end_time<e.start_time
          THEN interval '1 day' ELSE interval '0 day' END) AT TIME ZONE 'America/Sao_Paulo' END b
    FROM public.cronograma_eventos e LEFT JOIN primary_people p ON p.event_id=e.id
    WHERE e.org_id=_org_id AND e.has_exact_date AND e.start_date IS NOT NULL
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
    SELECT p.event_id id,bool_or(p.responsible) responsible
    FROM public.workers_agenda_person_links(_org_id) p JOIN scoped s ON s.id=p.event_id
    WHERE p.person_id=auth.uid() GROUP BY p.event_id
  ), personal AS MATERIALIZED (
    SELECT e.*,l.responsible,e.created_by_user_id=auth.uid() created
    FROM scoped e LEFT JOIN links l ON l.id=e.id WHERE l.id IS NOT NULL OR e.created_by_user_id=auth.uid()
  ), selected AS MATERIALIZED (
    SELECT * FROM personal WHERE (_relationship='linked' AND id IN(SELECT id FROM links)) OR (_relationship='created' AND created)
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
      'linked_events',(SELECT count(*) FROM links),
      'completed_events',(SELECT count(*) FROM selected WHERE status='concluido'),
      'past_events',(SELECT count(*) FROM selected WHERE coalesce(end_at,
        ((coalesce(end_date,start_date)+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))<=statement_timestamp()),
      'scheduled_events',(SELECT count(*) FROM selected WHERE status<>'concluido'),
      'valid_duration_events',(SELECT count(duration_minutes) FROM selected),
      'average_duration_minutes',(SELECT round(avg(duration_minutes),2) FROM selected),
      'weekday_counts',coalesce((SELECT jsonb_agg(to_jsonb(w)) FROM weekdays w),'[]')),
    'notes',jsonb_build_array('Vínculos diretos e de subeventos são reunidos por evento principal; criação é uma métrica separada e não presume participação.',
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
    SELECT p.event_id,p.person_id,p.name_snapshot name FROM public.workers_agenda_person_links(_org_id) p
    JOIN scoped e ON e.id=p.event_id
  ), counted AS (
    SELECT l.person_id,coalesce(nullif(btrim(max(m.nome_exibicao)),''),nullif(btrim(max(l.name)),''),'Pessoa vinculada') name,
      count(DISTINCT l.event_id) events FROM links l
    LEFT JOIN public.org_members m ON m.org_id=_org_id AND m.user_id=l.person_id
    WHERE l.person_id IS NOT NULL GROUP BY l.person_id
  ), ranked AS (
    SELECT person_id,name,events,row_number() OVER(ORDER BY events DESC,lower(name),person_id) position
    FROM counted
  ) SELECT jsonb_build_object('scope',jsonb_build_object('period',jsonb_build_object('from',_from_date,'to',_to_date),
      'timezone','America/Sao_Paulo','complete',true,'as_of',statement_timestamp(),'unit','events'),
    'metrics',jsonb_build_object('people_count',(SELECT count(*) FROM ranked),'event_count',(SELECT count(*) FROM scoped),
      'unidentified_links',(SELECT count(*) FROM links WHERE person_id IS NULL AND name IS NOT NULL),
      'shown_people',_limit,'tie_break','name_then_id'),
    'people',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.position) FROM ranked r WHERE r.position<=_limit),'[]'),
    'notes',jsonb_build_array('Contagem distinta de eventos principais por pessoa identificada, calculada sobre todo o período autorizado; o limite afeta somente a apresentação.',
      'Vínculos externos sem identificação persistida de pessoa não entram no ranking. Vínculo não comprova presença.',
      'Empates são ordenados pelo nome. Pessoas homônimas permanecem separadas pela identidade persistida.')) INTO result;
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
      e.created_by_user_id,
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
    SELECT p.event_id,bool_or(p.responsible) responsible
    FROM public.workers_agenda_person_links(_org_id) p JOIN timed t ON t.id=p.event_id
    WHERE p.person_id=auth.uid() GROUP BY p.event_id
  ), commission_events AS MATERIALIZED (
    SELECT c.event_id FROM public.workers_agenda_commission_links(_org_id) c
    WHERE _commission_id IS NOT NULL AND c.commission_id=_commission_id
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

CREATE OR REPLACE FUNCTION public.workers_agenda_resolve_identity(_org_id uuid,_kind text,_search text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; needle text;
BEGIN
  PERFORM public.workers_require_read_scope(_org_id);
  IF _kind IS NULL OR _kind NOT IN('person','commission') OR _search IS NULL OR char_length(btrim(_search)) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'INVALID_IDENTITY_SEARCH' USING ERRCODE='22023';
  END IF;
  needle:=translate(lower(btrim(_search)),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  WITH people AS (
    SELECT m.user_id id,nullif(btrim(m.nome_exibicao),'') name,true official
      FROM public.org_members m WHERE _kind='person' AND m.org_id=_org_id AND m.user_id IS NOT NULL
    UNION ALL
    SELECT p.person_id,nullif(btrim(p.name_snapshot),''),false FROM public.workers_agenda_person_links(_org_id) p
      WHERE _kind='person' AND p.person_id IS NOT NULL
  ), candidates AS (
    SELECT p.id,coalesce(max(p.name) FILTER(WHERE p.official),max(p.name)) name,'person'::text kind,NULL::text visual_key
      FROM people p GROUP BY p.id
    UNION ALL
    SELECT c.id,c.nome,'commission',c.slug FROM public.commissions c WHERE _kind='commission' AND c.org_id=_org_id
  ), normalized AS (
    SELECT c.*,translate(lower(btrim(c.name)),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') search_name FROM candidates c
  ), matched AS (
    SELECT n.*,CASE WHEN n.search_name=needle OR n.visual_key=needle THEN 0 ELSE 1 END quality FROM normalized n
      WHERE strpos(n.search_name,needle)>0 OR n.visual_key=needle
  ), best AS (
    SELECT * FROM matched WHERE quality=(SELECT min(quality) FROM matched) ORDER BY name,id
  ) SELECT jsonb_build_object('complete',true,'identities',coalesce((SELECT jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object('id',b.id,'name',b.name,'kind',b.kind,'visual_key',b.visual_key)) ORDER BY b.name,b.id)
      FROM best b),'[]')) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.workers_agenda_person_events(_org_id uuid,_person_id uuid,_from_date date,_to_date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE person_name text; result jsonb;
BEGIN
  PERFORM public.workers_require_read_scope(_org_id);
  SELECT coalesce((SELECT max(nullif(btrim(m.nome_exibicao),'')) FROM public.org_members m
    WHERE m.org_id=_org_id AND m.user_id=_person_id),
    (SELECT max(nullif(btrim(p.name_snapshot),'')) FROM public.workers_agenda_person_links(_org_id) p WHERE p.person_id=_person_id)) INTO person_name;
  IF _person_id IS NULL OR person_name IS NULL THEN RAISE EXCEPTION 'IDENTITY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  WITH scoped AS MATERIALIZED(SELECT * FROM public.workers_agenda_event_scope(_org_id,_from_date,_to_date))
  SELECT jsonb_build_object('scope',jsonb_build_object('complete',true,'timezone','America/Sao_Paulo','as_of',statement_timestamp(),
      'period',jsonb_build_object('from',_from_date,'to',_to_date),'relationship','linked','unit','events'),
    'person',jsonb_build_object('id',_person_id,'name',person_name,'kind','person'),
    'metrics',jsonb_build_object('events',(SELECT count(DISTINCT s.id) FROM scoped s
      JOIN public.workers_agenda_person_links(_org_id) p ON p.event_id=s.id WHERE p.person_id=_person_id)),
    'notes',jsonb_build_array('Eventos principais distintos com vínculo pessoal na Agenda, inclusive por subevento não cancelado.',
      'Criar um registro, pertencer à comissão e ter vínculo não comprovam presença.')) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.workers_agenda_commission_ranking(_org_id uuid,_from_date date,_to_date date,_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF _limit IS NULL OR _limit<1 OR _limit>30 THEN RAISE EXCEPTION 'INVALID_LIMIT' USING ERRCODE='22023'; END IF;
  WITH scoped AS MATERIALIZED(SELECT * FROM public.workers_agenda_event_scope(_org_id,_from_date,_to_date)),
  counted AS (
    SELECT l.commission_id,l.name,l.slug,count(DISTINCT l.event_id) events
    FROM public.workers_agenda_commission_links(_org_id) l JOIN scoped s ON s.id=l.event_id
    GROUP BY l.commission_id,l.name,l.slug
  ), ranked AS (
    SELECT c.*,row_number() OVER(ORDER BY c.events DESC,lower(c.name),c.commission_id) position FROM counted c
  ) SELECT jsonb_build_object('scope',jsonb_build_object('complete',true,'timezone','America/Sao_Paulo','as_of',statement_timestamp(),
      'period',jsonb_build_object('from',_from_date,'to',_to_date),'unit','events'),
    'metrics',jsonb_build_object('commission_count',(SELECT count(*) FROM ranked),'event_count',(SELECT count(*) FROM scoped),
      'shown_commissions',_limit,'tie_break','name_then_id'),
    'commissions',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.position) FROM ranked r WHERE r.position<=_limit),'[]'),
    'notes',jsonb_build_array('Comissões principais, adicionais e de subeventos não cancelados; cada evento principal entra uma vez por comissão.',
      'Um evento pode pertencer a várias comissões: a soma do ranking pode superar o total de eventos distintos.',
      'Agrupamento completo antes do limite de apresentação. Empates conservam nomes e identidades distintos.')) INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.workers_agenda_person_links(uuid),public.workers_agenda_commission_links(uuid),
  public.workers_agenda_resolve_identity(uuid,text,text),public.workers_agenda_person_events(uuid,uuid,date,date),
  public.workers_agenda_commission_ranking(uuid,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workers_agenda_person_links(uuid),public.workers_agenda_commission_links(uuid),
  public.workers_agenda_resolve_identity(uuid,text,text),public.workers_agenda_person_events(uuid,uuid,date,date),
  public.workers_agenda_commission_ranking(uuid,date,date,integer) TO authenticated;
