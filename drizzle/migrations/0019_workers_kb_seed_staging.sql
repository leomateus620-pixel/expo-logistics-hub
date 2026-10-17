-- Staged KB seed publication for executors that cannot receive the whole seed in
-- one call. Parts are the exact statements of the reviewed seed migration; the
-- promotion re-joins them, requires the reviewed SHA-256 and then executes the
-- reviewed seed once, inside the caller's single transaction. No data here.
CREATE TABLE IF NOT EXISTS workers_private.kb_seed_stage_parts (
  version date NOT NULL,
  seed_sha256 text NOT NULL CHECK (seed_sha256 ~ '^[a-f0-9]{64}$'),
  part_count integer NOT NULL CHECK (part_count BETWEEN 1 AND 10000),
  part_no integer NOT NULL,
  part_sha256 text NOT NULL CHECK (part_sha256 ~ '^[a-f0-9]{64}$'),
  body text NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version, seed_sha256, part_no),
  CHECK (part_no BETWEEN 1 AND part_count)
);
COMMENT ON TABLE workers_private.kb_seed_stage_parts IS 'Private staging for KB seed parts; never published until kb_promote_staged_seed validates the full reviewed seed hash.';

CREATE OR REPLACE FUNCTION workers_private.kb_seed_stage_part_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF encode(pg_catalog.sha256(pg_catalog.convert_to(NEW.body, 'UTF8')), 'hex') <> NEW.part_sha256 THEN
    RAISE EXCEPTION 'KB_SEED_PART_HASH_MISMATCH part %', NEW.part_no;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS kb_seed_stage_part_guard ON workers_private.kb_seed_stage_parts;
CREATE TRIGGER kb_seed_stage_part_guard BEFORE INSERT OR UPDATE ON workers_private.kb_seed_stage_parts
FOR EACH ROW EXECUTE FUNCTION workers_private.kb_seed_stage_part_guard();

CREATE OR REPLACE FUNCTION workers_private.kb_promote_staged_seed(_version date, _seed_sha256 text, _part_count integer, _source_hash text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE
  _n integer; _full text; _body text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261017, 9);
  SELECT count(*) INTO _n FROM workers_private.kb_seed_stage_parts
   WHERE version=_version AND seed_sha256=_seed_sha256 AND part_count=_part_count AND part_no BETWEEN 1 AND _part_count;
  IF _n <> _part_count OR EXISTS (SELECT 1 FROM workers_private.kb_seed_stage_parts
     WHERE version=_version AND seed_sha256=_seed_sha256 AND part_count<>_part_count) THEN
    RAISE EXCEPTION 'KB_SEED_STAGE_INCOMPLETE % of %', _n, _part_count;
  END IF;
  SELECT string_agg(body, E'\n\n' ORDER BY part_no) INTO _full FROM workers_private.kb_seed_stage_parts
   WHERE version=_version AND seed_sha256=_seed_sha256;
  IF encode(pg_catalog.sha256(pg_catalog.convert_to(_full, 'UTF8')), 'hex') <> _seed_sha256 THEN
    RAISE EXCEPTION 'KB_SEED_STAGE_HASH_MISMATCH';
  END IF;
  IF pg_catalog.strpos(_full, '-- Source SHA-256: ' || _source_hash || '.') = 0
     OR pg_catalog.strpos(_full, 'immutable revision ' || _version::text || '.') = 0 THEN
    RAISE EXCEPTION 'KB_SEED_STAGE_SOURCE_MISMATCH';
  END IF;
  -- The reviewed file carries its own BEGIN/COMMIT; the caller's transaction replaces them.
  IF (SELECT count(*) FROM regexp_matches(_full, '^BEGIN;$', 'gn')) <> 1
     OR (SELECT count(*) FROM regexp_matches(_full, '^COMMIT;$', 'gn')) <> 1 THEN
    RAISE EXCEPTION 'KB_SEED_STAGE_TRANSACTION_SHAPE';
  END IF;
  _body := regexp_replace(regexp_replace(_full, '^BEGIN;$', '', 'n'), '^COMMIT;$', '', 'n');
  EXECUTE _body;
  DELETE FROM workers_private.kb_seed_stage_parts WHERE version=_version AND seed_sha256=_seed_sha256;
  RETURN jsonb_build_object('version', _version, 'seed_sha256', _seed_sha256,
    'entries', (SELECT count(*) FROM public.kb_entries WHERE managed_by='fenasoja-kb-seed'),
    'questions', (SELECT count(*) FROM public.kb_questions));
END $fn$;
COMMENT ON FUNCTION workers_private.kb_promote_staged_seed(date,text,integer,text) IS 'Executes the exact reviewed KB seed from validated staged parts in the caller transaction; any failure publishes nothing.';

REVOKE ALL ON TABLE workers_private.kb_seed_stage_parts FROM PUBLIC;
REVOKE ALL ON FUNCTION workers_private.kb_promote_staged_seed(date,text,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION workers_private.kb_seed_stage_part_guard() FROM PUBLIC;
DO $grants$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON TABLE workers_private.kb_seed_stage_parts FROM anon;
    REVOKE ALL ON FUNCTION workers_private.kb_promote_staged_seed(date,text,integer,text) FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON TABLE workers_private.kb_seed_stage_parts FROM authenticated;
    REVOKE ALL ON FUNCTION workers_private.kb_promote_staged_seed(date,text,integer,text) FROM authenticated; END IF;
  -- Temporary loader role used by the official agent environment; revoked after promotion.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
    GRANT USAGE ON SCHEMA workers_private TO sandbox_exec;
    GRANT SELECT (version, seed_sha256, part_count, part_no, part_sha256), INSERT ON TABLE workers_private.kb_seed_stage_parts TO sandbox_exec;
  END IF;
END $grants$;