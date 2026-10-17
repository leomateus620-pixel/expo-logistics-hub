-- Public, shared, reviewed KB. Additive schema; only finish_turn is extended.
-- Normalizer v1: NFKC, fixed unaccent dictionary, ordinals, harvest periods.

CREATE SCHEMA IF NOT EXISTS extensions;
DO $extension$
DECLARE extension_name text; extension_schema text;
BEGIN
  FOREACH extension_name IN ARRAY ARRAY['unaccent','pg_trgm'] LOOP
    SELECT n.nspname INTO extension_schema FROM pg_catalog.pg_extension e
      JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname=extension_name;
    IF extension_schema IS NULL THEN
      EXECUTE format('CREATE EXTENSION %I WITH SCHEMA extensions',extension_name);
      extension_schema:='extensions';
    END IF;
    -- Respect existing extension locations. Never ALTER EXTENSION SET SCHEMA.
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated',extension_schema);
    IF extension_name='unaccent' THEN
      EXECUTE format($function$CREATE FUNCTION public.kb_unaccent_v1(_text text) RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS
        $body$SELECT %I.unaccent(%L::pg_catalog.regdictionary,normalize(coalesce(_text,''),NFKC))$body$$function$,
        extension_schema,extension_schema||'.unaccent');
    ELSE
      EXECUTE format($function$CREATE FUNCTION public.kb_similarity_v1(_left text,_right text) RETURNS real
        LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS
        $body$SELECT %I.similarity(_left,_right)$body$$function$,extension_schema);
    END IF;
  END LOOP;
END $extension$;

CREATE FUNCTION public.kb_normalize(_text text) RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
DECLARE result text:=btrim(regexp_replace(lower(public.kb_unaccent_v1(_text)),'[[:space:]]+',' ','g')); ordinal text; i integer;
  ordinals text[]:=ARRAY['primeira','segunda','terceira','quarta','quinta','sexta','setima','oitava','nona','decima',
    'decima primeira','decima segunda','decima terceira','decima quarta','decima quinta','decima sexta','decima setima','decima oitava','decima nona','vigesima',
    'vigesima primeira','vigesima segunda','vigesima terceira','vigesima quarta','vigesima quinta','vigesima sexta','vigesima setima','vigesima oitava','vigesima nona','trigesima'];
BEGIN
  IF result ~ '\m(primeir|segund|terceir|quart|quint|sext|setim|oitav|non|decim|vigesim|trigesim)[ao]\M' THEN
    FOR i IN REVERSE 30..1 LOOP
      ordinal:=ordinals[i];
      result:=regexp_replace(result,'\m'||ordinal||'\M',i::text,'g');
      result:=regexp_replace(result,'\m'||regexp_replace(ordinal,'a( |$)','o\1','g')||'\M',i::text,'g');
    END LOOP;
  END IF;
  result:=regexp_replace(result,'\m([0-9]+)[ao]\M','\1','g');
  result:=regexp_replace(result,'\m1999[[:space:]]*/[[:space:]]*00\M','1999/2000','g');
  result:=regexp_replace(result,'\m2099[[:space:]]*/[[:space:]]*00\M','2099/2100','g');
  result:=regexp_replace(result,'\m((19|20)[0-9]{2})[[:space:]]*/[[:space:]]*([0-9]{2})\M','\1/\2\3','g');
  RETURN btrim(regexp_replace(result,'[^a-z0-9]+',' ','g'));
END $$;
COMMENT ON FUNCTION public.kb_normalize(text) IS 'kb-normalizer-v1. Changing this requires recomputing stored generated columns and rebuilding their indexes. Keeps numbers and negations.';

CREATE FUNCTION public.kb_valid_civil_date(_value text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
BEGIN
  RETURN _value IS NOT NULL AND _value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND to_char(_value::date,'YYYY-MM-DD')=_value;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE FUNCTION public.kb_public_source_url(_value text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
DECLARE host text; authority text; decoded text; port text;
BEGIN
  IF _value IS NULL OR char_length(_value) NOT BETWEEN 10 AND 1200 OR _value !~ '^https://'
    OR _value ~ '[[:space:]\\<>`"[:cntrl:]]' OR _value ~ '%(0[0-9a-fA-F]|1[0-9a-fA-F]|7[fF])'
    OR _value ~ '%(?![0-9A-Fa-f]{2})' THEN RETURN false; END IF;
  authority:=substring(_value FROM '^https://([^/?#]+)');
  IF authority IS NULL OR authority ~ '@|\[|\]' THEN RETURN false; END IF;
  host:=lower(split_part(authority,':',1)); port:=split_part(authority,':',2);
  IF authority LIKE '%:%' AND (port<>'443' OR length(authority)-length(replace(authority,':',''))<>1) THEN RETURN false; END IF;
  IF host !~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$'
    OR host ~ '(^|\.)(localhost|local|internal|intranet|test|invalid|lan|home|onion)$'
    OR host ~ '(^|\.)(localhost|localdomain)$' THEN RETURN false; END IF;
  decoded:=lower(_value);
  -- Reject encoded /areas and sensitive names as well as ordinary parameters.
  decoded:=replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(decoded,'%2f','/'),'%61','a'),'%72','r'),'%65','e'),'%73','s'),'%41','a'),'%52','r'),'%45','e'),'%53','s'),'%3f','?'),'%26','&');
  IF decoded ~ '(^|/)areas(/|[?#]|$)' OR decoded ~ '[?&][^=&]*(token|secret|password|credential|authorization|auth|key|e-?mail|phone|telefone|cpf|cnpj|pix|signature|sig)[^=&]*='
    OR substring(_value FROM '[?].*$') ~ '%[0-9a-fA-F]{2}[^=&]*=' THEN RETURN false; END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.kb_valid_sources(_sources jsonb,_status text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
DECLARE item jsonb; usable integer:=0;
BEGIN
  IF jsonb_typeof(_sources) IS DISTINCT FROM 'array' OR jsonb_array_length(_sources)>8 THEN RETURN false; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(_sources) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF public.kb_public_source_url(item->>'url') AND public.kb_valid_civil_date(item->>'accessed')
      AND char_length(coalesce(item->>'label','')) BETWEEN 1 AND 160 AND (item->>'label')!~'[<>`]' THEN usable:=usable+1; END IF;
  END LOOP;
  RETURN _status='sem_fonte' OR usable>0;
END $$;

CREATE TABLE public.kb_entries (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  kb text NOT NULL CHECK (kb IN('fenasoja','expandida')),
  area text NOT NULL CHECK(char_length(area) BETWEEN 1 AND 80),
  area_name text NOT NULL CHECK(char_length(area_name) BETWEEN 1 AND 140),
  subcategory text,
  canonical_question text NOT NULL CHECK(char_length(canonical_question) BETWEEN 2 AND 500),
  answer text NOT NULL CHECK(char_length(btrim(answer)) BETWEEN 1 AND 1200 AND answer!~'[<>`]'),
  kind text NOT NULL CHECK(kind IN('fato','conceito','dado','orientacao')),
  status text NOT NULL CHECK(status IN('confirmado','parcial','conflito','dinamico','sem_fonte')),
  as_of text,
  edition_number smallint CHECK(edition_number BETWEEN 1 AND 100),
  edition_year smallint CHECK(edition_year BETWEEN 1966 AND 2100),
  dynamic_instructions text,
  citation_template text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(tags)='array'),
  related_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(related_ids)='array'),
  fenasoja_links jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(fenasoja_links)='array'),
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  relevance text,
  priority smallint NOT NULL CHECK(priority BETWEEN 1 AND 100 AND (kb<>'fenasoja' OR priority=1)),
  kb_version text NOT NULL CHECK(public.kb_valid_civil_date(kb_version)),
  context jsonb NOT NULL CHECK(jsonb_typeof(context)='object' AND context ?& ARRAY['scope','subject','edition_required'] AND context->>'scope' IN('general','edition','period','dynamic')
    AND char_length(context->>'subject') BETWEEN 1 AND 80 AND jsonb_typeof(context->'edition_required')='boolean'
    AND (context->>'valid_from' IS NULL OR public.kb_valid_civil_date(context->>'valid_from'))
    AND (context->>'valid_until' IS NULL OR public.kb_valid_civil_date(context->>'valid_until'))),
  public_notes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(public_notes)='array' AND jsonb_array_length(public_notes)<=5),
  editorial_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(editorial_metadata)='object'),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(provenance)='object'),
  query_policy jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(query_policy)='object'),
  managed_by text NOT NULL DEFAULT 'fenasoja-kb-seed',
  fts tsvector GENERATED ALWAYS AS (to_tsvector('portuguese'::regconfig,public.kb_normalize(canonical_question||' '||answer))) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(public.kb_valid_sources(sources,status)),
  UNIQUE(id,kb)
);
CREATE TABLE public.kb_questions (
  id text PRIMARY KEY,
  entry_id text NOT NULL,
  kb text NOT NULL CHECK(kb IN('fenasoja','expandida')),
  question text NOT NULL CHECK(char_length(question) BETWEEN 2 AND 500),
  question_norm text GENERATED ALWAYS AS(public.kb_normalize(question)) STORED,
  is_canonical boolean NOT NULL,
  kb_version text NOT NULL CHECK(public.kb_valid_civil_date(kb_version)),
  FOREIGN KEY(entry_id,kb) REFERENCES public.kb_entries(id,kb) ON DELETE CASCADE,
  CHECK(id ~ ('^'||entry_id||'#[0-9]+$'))
);
CREATE UNIQUE INDEX kb_questions_one_canonical_idx ON public.kb_questions(entry_id) WHERE is_canonical;
CREATE FUNCTION workers_private.kb_require_canonical() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_id text;
BEGIN
  IF TG_TABLE_NAME='kb_entries' THEN target_id:=NEW.id;
  ELSIF TG_OP='DELETE' THEN target_id:=OLD.entry_id;
  ELSE target_id:=NEW.entry_id; END IF;
  IF EXISTS(SELECT 1 FROM public.kb_entries e WHERE e.id=target_id) AND NOT EXISTS(
    SELECT 1 FROM public.kb_questions q JOIN public.kb_entries e ON e.id=q.entry_id
    WHERE q.entry_id=target_id AND q.is_canonical AND q.question=e.canonical_question
  ) THEN RAISE EXCEPTION 'KB_CANONICAL_QUESTION_REQUIRED' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='kb_questions' AND TG_OP='UPDATE' THEN
    IF OLD.entry_id IS DISTINCT FROM NEW.entry_id AND EXISTS(SELECT 1 FROM public.kb_entries WHERE id=OLD.entry_id)
      AND NOT EXISTS(SELECT 1 FROM public.kb_questions q JOIN public.kb_entries e ON e.id=q.entry_id WHERE q.entry_id=OLD.entry_id AND q.is_canonical AND q.question=e.canonical_question)
      THEN RAISE EXCEPTION 'KB_CANONICAL_QUESTION_REQUIRED' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION workers_private.kb_require_canonical() FROM PUBLIC,anon,authenticated;
CREATE CONSTRAINT TRIGGER kb_entry_canonical AFTER INSERT ON public.kb_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION workers_private.kb_require_canonical();
CREATE CONSTRAINT TRIGGER kb_entry_canonical_update AFTER UPDATE ON public.kb_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(OLD.canonical_question IS DISTINCT FROM NEW.canonical_question) EXECUTE FUNCTION workers_private.kb_require_canonical();
CREATE CONSTRAINT TRIGGER kb_question_canonical_insert AFTER INSERT ON public.kb_questions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(NEW.is_canonical) EXECUTE FUNCTION workers_private.kb_require_canonical();
CREATE CONSTRAINT TRIGGER kb_question_canonical_delete AFTER DELETE ON public.kb_questions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(OLD.is_canonical) EXECUTE FUNCTION workers_private.kb_require_canonical();
CREATE CONSTRAINT TRIGGER kb_question_canonical_update AFTER UPDATE ON public.kb_questions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN((OLD.is_canonical OR NEW.is_canonical) AND
    (OLD.question IS DISTINCT FROM NEW.question OR OLD.entry_id IS DISTINCT FROM NEW.entry_id OR OLD.is_canonical IS DISTINCT FROM NEW.is_canonical))
  EXECUTE FUNCTION workers_private.kb_require_canonical();
CREATE INDEX kb_questions_entry_idx ON public.kb_questions(entry_id);
CREATE INDEX kb_questions_kb_version_idx ON public.kb_questions(kb,kb_version);
DO $index$
DECLARE extension_schema text;
BEGIN
  SELECT n.nspname INTO extension_schema FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_trgm';
  EXECUTE format('CREATE INDEX kb_questions_trgm_idx ON public.kb_questions USING gin(question_norm %I.gin_trgm_ops)',extension_schema);
  -- The recall floor is below both acceptance thresholds and tie margins.
  -- No LIMIT here: temporal/entity filters still precede candidate ranking.
  EXECUTE format($function$CREATE FUNCTION public.kb_candidate_questions_v1(_normalized text)
    RETURNS SETOF public.kb_questions LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path='' SET pg_trgm.similarity_threshold='0.30' AS $body$
    SELECT q.* FROM public.kb_questions q WHERE auth.uid() IS NOT NULL
      AND q.question_norm OPERATOR(%I.%%) _normalized
    $body$$function$,extension_schema);
END $index$;
CREATE INDEX kb_entries_fts_idx ON public.kb_entries USING gin(fts);
CREATE INDEX kb_entries_sources_idx ON public.kb_entries USING gin(sources jsonb_path_ops);
CREATE INDEX kb_entries_edition_idx ON public.kb_entries(edition_year,edition_number);
CREATE INDEX kb_entries_kb_status_idx ON public.kb_entries(kb,status);
CREATE INDEX kb_entries_subject_idx ON public.kb_entries((context->>'subject'),(context->>'reference_period'));

-- Deliberately no FK to kb_entries: historical telemetry survives retirement.
CREATE TABLE public.kb_answer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  entry_id text,
  kb text CHECK(kb IN('fenasoja','expandida')),
  status text CHECK(status IN('confirmado','parcial','conflito','dinamico','sem_fonte')),
  score real CHECK(score IS NULL OR score BETWEEN 0 AND 1),
  outcome text NOT NULL CHECK(outcome IN('answered','answered_with_caveat','redirected_live','not_confirmed','clarification','miss')),
  kb_version text,
  UNIQUE(user_id,request_id),
  CHECK((outcome IN('clarification','miss') AND entry_id IS NULL AND kb IS NULL AND status IS NULL AND score IS NULL AND kb_version IS NULL)
    OR (outcome NOT IN('clarification','miss') AND entry_id IS NOT NULL AND kb IS NOT NULL AND status IS NOT NULL AND score IS NOT NULL AND kb_version IS NOT NULL))
);
CREATE INDEX kb_answer_events_user_created_idx ON public.kb_answer_events(user_id,created_at DESC);
CREATE INDEX kb_answer_events_org_outcome_idx ON public.kb_answer_events(org_id,outcome,created_at DESC);
CREATE INDEX kb_answer_events_entry_idx ON public.kb_answer_events(entry_id,kb_version);

CREATE TABLE workers_private.kb_seed_publications (
  version date PRIMARY KEY,
  source_hash text NOT NULL CHECK(source_hash ~ '^[0-9a-f]{64}$'),
  entry_count integer NOT NULL CHECK(entry_count>0),
  question_count integer NOT NULL CHECK(question_count>=entry_count),
  published_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON workers_private.kb_seed_publications FROM PUBLIC,anon,authenticated;
ALTER TABLE workers_private.kb_seed_publications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.kb_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_answer_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kb_entries,public.kb_questions,public.kb_answer_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.kb_entries,public.kb_questions,public.kb_answer_events TO authenticated;
CREATE POLICY kb_entries_authenticated_read ON public.kb_entries FOR SELECT TO authenticated USING((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY kb_questions_authenticated_read ON public.kb_questions FOR SELECT TO authenticated USING((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY kb_events_owner_read ON public.kb_answer_events FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));

CREATE FUNCTION public.workers_search_kb(_query text,_edition_year integer DEFAULT NULL,_kb text DEFAULT NULL,_limit integer DEFAULT 3,_context jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(entry_id text,kb text,score real,matched_question text,canonical_question text,answer text,kind text,status text,area text,area_name text,as_of text,edition_number smallint,edition_year smallint,dynamic_instructions text,sources jsonb,kb_version text,context jsonb,public_notes jsonb,query_policy jsonb)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE normalized text; civil_day text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF char_length(btrim(coalesce(_query,''))) NOT BETWEEN 2 AND 500 OR _edition_year IS NOT NULL AND _edition_year NOT BETWEEN 1966 AND 2100
    OR _kb IS NOT NULL AND _kb NOT IN('fenasoja','expandida') OR _limit IS NULL OR _limit NOT BETWEEN 1 AND 5
    OR jsonb_typeof(_context) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_context) key WHERE key NOT IN('subject','reference_period','reference_year','attribute','entity_name','as_of','temporal_mode','edition_required','gestation_phase','role','audience','comparative'))
    OR (_context ? 'temporal_mode' AND _context->>'temporal_mode' NOT IN('explicit','current','historical','none'))
    OR (_context ? 'role' AND _context->>'role' NOT IN('president','vice_president','honorary_president'))
    OR (_context ? 'audience' AND _context->>'audience' NOT IN('familiar','empresarial'))
    OR (_context ? 'attribute' AND coalesce(_context->>'attribute' NOT IN('population','gdp','area','mayor','female_president'),true))
    OR (_context ? 'reference_year' AND CASE WHEN jsonb_typeof(_context->'reference_year')='number' AND _context->>'reference_year' ~ '^[0-9]{4}$'
      THEN (_context->>'reference_year')::integer NOT BETWEEN 1800 AND 2100 ELSE true END)
    OR (_context ? 'entity_name' AND (jsonb_typeof(_context->'entity_name') IS DISTINCT FROM 'string' OR char_length(coalesce(_context->>'entity_name','')) NOT BETWEEN 2 AND 180
      OR public.kb_normalize(_context->>'entity_name') IS DISTINCT FROM _context->>'entity_name'))
    OR (_context ? 'gestation_phase' AND _context->>'gestation_phase' NOT IN('initial','final'))
    OR (_context ? 'edition_required' AND jsonb_typeof(_context->'edition_required')<>'boolean')
    OR (_context ? 'comparative' AND jsonb_typeof(_context->'comparative')<>'boolean')
    THEN RAISE EXCEPTION 'KB_INVALID_QUERY' USING ERRCODE='22023'; END IF;
  normalized:=public.kb_normalize(_query); civil_day:=_context->>'as_of';
  IF civil_day IS NOT NULL AND NOT public.kb_valid_civil_date(civil_day) THEN RAISE EXCEPTION 'KB_INVALID_QUERY' USING ERRCODE='22023'; END IF;
  IF normalized='' THEN RETURN; END IF;
  RETURN QUERY
  WITH eligible AS MATERIALIZED (
    SELECT e.* FROM public.kb_entries e WHERE (_kb IS NULL OR e.kb=_kb)
      AND (_context->>'subject' IS NULL OR e.context->>'subject'=_context->>'subject')
      AND (_context->>'audience' IS NULL OR e.context->>'audience'=_context->>'audience')
      -- Municipality identity is exact. Similar wording for another city must
      -- not become a substitute after the reference-period filter.
      AND (_context->>'entity_name' IS NULL OR regexp_replace((regexp_match(public.kb_normalize(e.canonical_question),
        '\m(habitantes tem|populacao d[aoe]|prefeit[oa] d[aoe]) (.+)$'))[2],' rs$','')=_context->>'entity_name')
      AND (_context->>'attribute' IS NULL OR CASE _context->>'attribute'
        WHEN 'population' THEN public.kb_normalize(e.canonical_question)~'\m(populacao|habitantes)\M'
        WHEN 'gdp' THEN public.kb_normalize(e.canonical_question)~'\m(pib|produto interno bruto)\M'
        WHEN 'area' THEN public.kb_normalize(e.canonical_question)~'\m(area|superficie|extensao territorial)\M'
        WHEN 'mayor' THEN public.kb_normalize(e.canonical_question)~'\mprefeit'
        WHEN 'female_president' THEN public.kb_normalize(e.canonical_question)~'\m(mulher|feminina)\M' AND public.kb_normalize(e.canonical_question)~'\mpresid'
        ELSE false END)
      AND (NOT coalesce((_context->>'comparative')::boolean,false) OR e.context->>'scope'<>'edition' OR coalesce((e.query_policy->>'allow_comparative')::boolean,false))
      AND (_context->>'role' IS NULL OR coalesce((_context->>'comparative')::boolean,false) OR NOT coalesce((e.query_policy->>'historical_only')::boolean,false))
      AND (_context->>'role' IS NULL OR CASE _context->>'role' WHEN 'vice_president' THEN public.kb_normalize(e.canonical_question)~'\mvice presidente\M'
        WHEN 'honorary_president' THEN public.kb_normalize(e.canonical_question)~'\m(presidente|presidiu|presidencia)\M' AND public.kb_normalize(e.canonical_question)~'\mhonra\M'
        ELSE public.kb_normalize(e.canonical_question)~'\m(presidente|presidiu|presidencia)\M' AND public.kb_normalize(e.canonical_question)!~'\m(vice|honra)\M' END)
      AND (_edition_year IS NULL OR e.edition_year=_edition_year OR (e.edition_year IS NULL AND NOT (e.context->>'edition_required')::boolean))
      AND NOT ((e.context->>'edition_required')::boolean AND coalesce(_context->>'temporal_mode','none')='current' AND _edition_year IS NULL)
      AND (NOT coalesce((_context->>'edition_required')::boolean,false) OR e.edition_year=_edition_year OR e.context->>'scope'='general')
      AND (_context->>'reference_period' IS NULL OR e.context->>'reference_period'=_context->>'reference_period')
      -- Reference years are explicit tokens of the reviewed period, never access
      -- dates, text similarity, validity intervals or inferred edition years.
      AND (_context->>'reference_year' IS NULL OR _context->>'reference_year'=ANY(regexp_split_to_array(coalesce(e.context->>'reference_period',''),'[^0-9]+')))
      AND (_context->>'gestation_phase' IS NULL OR e.query_policy->>'phase' IS NULL OR e.query_policy->>'phase'=_context->>'gestation_phase')
      AND (coalesce(_context->>'temporal_mode','none')<>'current' OR e.context->>'scope'<>'period' OR
        (civil_day IS NOT NULL AND e.context->>'valid_from' IS NOT NULL AND e.context->>'valid_until' IS NOT NULL
         AND civil_day BETWEEN e.context->>'valid_from' AND e.context->>'valid_until'))
  ), scored_questions AS (
    SELECT e.id,q.question,public.kb_similarity_v1(q.question_norm,normalized) similarity,
      row_number() OVER(PARTITION BY e.id ORDER BY public.kb_similarity_v1(q.question_norm,normalized) DESC,q.is_canonical DESC,q.id) question_rank
    FROM eligible e JOIN public.kb_candidate_questions_v1(normalized) q ON q.entry_id=e.id
  ), ranked_entries AS (
    SELECT e.*,q.question,q.similarity,row_number() OVER(PARTITION BY e.kb ORDER BY q.similarity DESC,coalesce((e.query_policy->>'preference_rank')::integer,100),e.priority,e.id) kb_rank
    FROM eligible e JOIN scored_questions q ON q.id=e.id AND q.question_rank=1
  ) SELECT e.id,e.kb,e.similarity,e.question,e.canonical_question,e.answer,e.kind,e.status,e.area,e.area_name,e.as_of,e.edition_number,e.edition_year,e.dynamic_instructions,e.sources,e.kb_version,e.context,e.public_notes,e.query_policy
    FROM ranked_entries e WHERE e.kb_rank<=_limit ORDER BY e.kb,e.similarity DESC,coalesce((e.query_policy->>'preference_rank')::integer,100),e.priority,e.id;
END $$;

CREATE FUNCTION public.workers_log_kb_answer(_org_id uuid,_request_id uuid,_entry_id text,_score real,_outcome text,_kb_version text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); entry public.kb_entries; turn public.ai_messages;
BEGIN
  IF actor IS NULL OR _org_id IS NULL OR _org_id NOT IN(SELECT public.ai_workers_member_org_ids()) THEN
    RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO turn FROM public.ai_messages WHERE user_id=actor AND org_id=_org_id AND request_id=_request_id AND role='assistant';
  IF NOT FOUND OR turn.state<>'complete' THEN RAISE EXCEPTION 'KB_TURN_NOT_COMPLETE' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.kb_answer_events WHERE user_id=actor AND request_id=_request_id) THEN RETURN; END IF;
  IF _outcome IS NULL OR _outcome NOT IN('answered','answered_with_caveat','redirected_live','not_confirmed','clarification','miss')
    OR _score IS NOT NULL AND NOT(_score>=0 AND _score<=1) THEN RAISE EXCEPTION 'KB_INVALID_OUTCOME' USING ERRCODE='22023'; END IF;
  IF _outcome IN('clarification','miss') THEN
    IF _entry_id IS NOT NULL OR _score IS NOT NULL OR _kb_version IS NOT NULL THEN RAISE EXCEPTION 'KB_INVALID_OUTCOME' USING ERRCODE='22023'; END IF;
    IF (_outcome='clarification' AND NOT EXISTS(SELECT 1 FROM public.ai_usage u WHERE u.user_id=actor AND u.request_id=_request_id AND u.model='deterministic/kb.clarification'))
      OR (_outcome='miss' AND EXISTS(SELECT 1 FROM public.ai_usage u WHERE u.user_id=actor AND u.request_id=_request_id AND u.model LIKE 'deterministic/kb.%')) THEN RAISE EXCEPTION 'KB_INVALID_OUTCOME' USING ERRCODE='22023'; END IF;
  ELSE
    SELECT * INTO entry FROM public.kb_entries WHERE id=_entry_id FOR SHARE;
    IF NOT FOUND OR _score IS NULL THEN RAISE EXCEPTION 'KB_INVALID_OUTCOME' USING ERRCODE='22023'; END IF;
    IF _kb_version IS DISTINCT FROM entry.kb_version THEN RAISE EXCEPTION 'KB_VERSION_CHANGED' USING ERRCODE='40001'; END IF;
    IF _outcome IS DISTINCT FROM (CASE entry.status WHEN 'confirmado' THEN 'answered' WHEN 'parcial' THEN 'answered_with_caveat' WHEN 'conflito' THEN 'answered_with_caveat' WHEN 'dinamico' THEN 'redirected_live' WHEN 'sem_fonte' THEN 'not_confirmed' END)
      OR NOT EXISTS(SELECT 1 FROM public.ai_usage u WHERE u.user_id=actor AND u.request_id=_request_id AND u.model='deterministic/kb.'||entry.kb_version||'.'||entry.id)
      THEN RAISE EXCEPTION 'KB_INVALID_OUTCOME' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO public.kb_answer_events(org_id,user_id,request_id,entry_id,kb,status,score,outcome,kb_version)
    VALUES(_org_id,actor,_request_id,_entry_id,entry.kb,entry.status,_score,_outcome,_kb_version)
    ON CONFLICT(user_id,request_id) DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.kb_unaccent_v1(text),public.kb_similarity_v1(text,text),public.kb_candidate_questions_v1(text),public.kb_normalize(text),public.kb_valid_civil_date(text),public.kb_public_source_url(text),public.kb_valid_sources(jsonb,text),public.workers_search_kb(text,integer,text,integer,jsonb),public.workers_log_kb_answer(uuid,uuid,text,real,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kb_unaccent_v1(text),public.kb_similarity_v1(text,text),public.kb_candidate_questions_v1(text),public.kb_normalize(text),public.kb_valid_civil_date(text),public.kb_public_source_url(text),public.kb_valid_sources(jsonb,text),public.workers_search_kb(text,integer,text,integer,jsonb),public.workers_log_kb_answer(uuid,uuid,text,real,text,text) TO authenticated;

-- Finish implementation appended below preserves the 20261017030000 function;
-- the newer 20261017060000 sanitizers remain unchanged.
CREATE OR REPLACE FUNCTION public.ai_workers_finish_turn(
  _org_id uuid, _request_id uuid, _content text, _citations jsonb, _model text,
  _input_tokens integer, _output_tokens integer, _tool_names text[] DEFAULT ARRAY[]::text[], _usage_complete boolean DEFAULT true
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); msg public.ai_messages; item jsonb; tool text; safe_citations jsonb := '[]'::jsonb;
  kb_entry public.kb_entries; kb_model text[]; document jsonb; source_items jsonb; safe_content text;
BEGIN
  IF actor IS NULL OR _org_id NOT IN (SELECT public.ai_workers_member_org_ids()) THEN
    RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO msg FROM public.ai_messages WHERE user_id=actor AND org_id=_org_id AND request_id=_request_id AND role='assistant' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF msg.state = 'complete' THEN RETURN; END IF;
  IF msg.state <> 'pending' OR char_length(coalesce(_content,'')) NOT BETWEEN 1 AND 24000
    OR jsonb_typeof(_citations) IS DISTINCT FROM 'array' OR jsonb_array_length(_citations) > 30
    OR coalesce(array_length(_tool_names,1),0) > 8 THEN
    RAISE EXCEPTION 'WORKERS_INVALID_COMPLETION' USING ERRCODE = '22023';
  END IF;
  IF _model LIKE 'deterministic/kb.%' THEN
    IF NOT coalesce('workers_search_kb'=ANY(_tool_names),false) THEN RAISE EXCEPTION 'KB_INVALID_RESPONSE' USING ERRCODE='22023'; END IF;
    IF left(_content,21)<>E'```fenasoja-response\n' OR right(_content,4)<>E'\n```' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023'; END IF;
    document:=substring(_content FROM 22 FOR char_length(_content)-25)::jsonb;
    IF document->>'intent' IS DISTINCT FROM 'knowledge_base' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023'; END IF;
    IF _model='deterministic/kb.clarification' THEN
      IF jsonb_array_length(_citations)<>0 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(document->'blocks') b WHERE b->>'type'='clarification') THEN RAISE EXCEPTION 'KB_INVALID_RESPONSE' USING ERRCODE='22023'; END IF;
    ELSE
      kb_model:=regexp_match(_model,'^deterministic/kb\.([0-9]{4}-[0-9]{2}-[0-9]{2})\.([A-Za-z0-9_-]+)$');
      IF kb_model IS NULL THEN RAISE EXCEPTION 'KB_INVALID_RESPONSE' USING ERRCODE='22023'; END IF;
      SELECT * INTO kb_entry FROM public.kb_entries WHERE id=kb_model[2] FOR SHARE;
      IF NOT FOUND OR kb_entry.kb_version IS DISTINCT FROM kb_model[1] THEN RAISE EXCEPTION 'KB_VERSION_CHANGED' USING ERRCODE='40001'; END IF;
      IF document->>'summary' IS DISTINCT FROM kb_entry.answer OR (kb_entry.status='sem_fonte' AND jsonb_array_length(_citations)<>0)
        OR (kb_entry.status<>'sem_fonte' AND jsonb_array_length(_citations) NOT BETWEEN 1 AND 3)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(_citations) c WHERE c->>'source' IS DISTINCT FROM 'kb') THEN RAISE EXCEPTION 'KB_INVALID_RESPONSE' USING ERRCODE='22023'; END IF;
    END IF;
    SELECT coalesce(jsonb_agg(s),'[]'::jsonb) INTO source_items FROM jsonb_array_elements(document->'blocks') b CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN b->>'type'='sources' THEN b->'items' ELSE '[]'::jsonb END) s;
    IF jsonb_array_length(source_items)<>jsonb_array_length(_citations)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(_citations) c WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(source_items) s WHERE s->>'url'=c->>'url' AND s->>'source'=c->>'source' AND s->>'label'=c->>'label' AND coalesce(s->>'date','')=coalesce(c->>'date','')))
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(source_items) s WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_citations) c WHERE s->>'url'=c->>'url' AND s->>'source'=c->>'source' AND s->>'label'=c->>'label' AND coalesce(s->>'date','')=coalesce(c->>'date',''))) THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE_SOURCE' USING ERRCODE='22023'; END IF;
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(_citations) LOOP
    IF jsonb_typeof(item) <> 'object' OR item->>'source' IS NULL OR item->>'source' NOT IN ('app','web','kb')
      OR char_length(coalesce(item->>'label','')) NOT BETWEEN 1 AND 160
      OR char_length(coalesce(item->>'url','')) NOT BETWEEN 1 AND 1500
      OR (item->>'source'='app' AND (item->>'url' NOT LIKE '/%' OR item->>'url' LIKE '//%' OR item->>'url' ~ '[[:space:]\\<>]'
        OR item->>'url' ~* '^/areas(/|$)' OR item->>'url' ~* '[?&](token|email|phone|cpf|pix)='))
      OR (item->>'source'='web' AND (item->>'url' !~ '^https://([a-z0-9-]+\.)*(fenasoja\.com\.br|gov\.br|embrapa\.br)(/|$)'
        OR item->>'url' ~* '(/|%2f)(a|%[46]1)(r|%[57]2)(e|%[46]5)(a|%[46]1)(s|%[57]3)(/|%2f|$)'
        OR coalesce(item->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')) THEN
      RAISE EXCEPTION 'WORKERS_INVALID_CITATION' USING ERRCODE = '22023';
    END IF;
    IF item->>'source'='kb' AND (kb_entry.id IS NULL OR NOT public.kb_public_source_url(item->>'url') OR NOT public.kb_valid_civil_date(item->>'date')
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(kb_entry.sources) source WHERE source->>'url'=item->>'url' AND source->>'accessed'=item->>'date' AND source->>'label'=item->>'label')) THEN
      RAISE EXCEPTION 'WORKERS_INVALID_CITATION' USING ERRCODE='22023';
    END IF;
    safe_citations := safe_citations || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'label',public.ai_workers_redact_text(item->>'label'),'url',item->>'url','source',item->>'source',
      'date',CASE WHEN item->>'source' IN('web','kb') THEN item->>'date' ELSE NULL END)));
  END LOOP;
  safe_content:=workers_private.sanitize_response_content(_content,_org_id,safe_citations);
  IF left(safe_content,21)=E'```fenasoja-response\n' AND coalesce(_model,'') NOT LIKE 'deterministic/kb.%'
    AND (substring(safe_content FROM 22 FOR char_length(safe_content)-25)::jsonb)->>'intent'='knowledge_base'
    THEN RAISE EXCEPTION 'KB_INVALID_RESPONSE' USING ERRCODE='22023'; END IF;
  IF kb_entry.id IS NOT NULL AND (substring(safe_content FROM 22 FOR char_length(safe_content)-25)::jsonb)->>'summary' IS DISTINCT FROM kb_entry.answer THEN RAISE EXCEPTION 'KB_UNSAFE_REVIEWED_TEXT' USING ERRCODE='22023'; END IF;
  UPDATE public.ai_messages SET content=safe_content,citations=safe_citations,state='complete' WHERE id=msg.id;
  UPDATE public.ai_conversations SET updated_at=now() WHERE id=msg.conversation_id;
  INSERT INTO public.ai_usage(org_id,user_id,conversation_id,request_id,worker_id,provider,model,input_tokens,output_tokens,usage_complete)
    VALUES (_org_id,actor,msg.conversation_id,_request_id,msg.worker_id,'lovable',_model,_input_tokens,_output_tokens,coalesce(_usage_complete,false));
  FOREACH tool IN ARRAY _tool_names LOOP
    INSERT INTO public.ai_audit_events(org_id,user_id,conversation_id,request_id,event,tool_name)
      VALUES (_org_id,actor,msg.conversation_id,_request_id,'tool_completed',tool);
  END LOOP;
  INSERT INTO public.ai_audit_events(org_id,user_id,conversation_id,request_id,event)
    VALUES (_org_id,actor,msg.conversation_id,_request_id,'turn_completed');
END $$;