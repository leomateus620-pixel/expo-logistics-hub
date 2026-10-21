-- Controlled, uncommitted probes of the existing public RPC and its anon grant.
-- No sale/test customer is created. Token stays inside the DB session.
BEGIN;
DO $setup$ BEGIN
 PERFORM set_config('qa.exporural_token',(SELECT token FROM public.public_map_links WHERE slug='exporural' AND is_active),true);
 PERFORM set_config('qa.exporural_rate',(SELECT price_per_sqm::text FROM public.commercial_price_rules WHERE id='552e1038-6b92-429a-a95c-503b737c97b8'),true);
END $setup$;
SET LOCAL ROLE anon;
DO $initial$ DECLARE d jsonb; denied boolean:=false; BEGIN
 d:=public.public_map_scope_revision('exporural',current_setting('qa.exporural_token'));
 PERFORM set_config('qa.exporural_revision',d->>'revision',true);
 PERFORM set_config('qa.exporural_count',d->>'lotCount',true);
 IF (d->>'lotCount')::int<>108 THEN RAISE EXCEPTION 'PUBLIC_COUNT_MISMATCH'; END IF;
 BEGIN PERFORM public.public_map_inventory('exporural','invalid-token-for-negative-test');
 EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'INVALID_TOKEN_WAS_ACCEPTED'; END IF;
END $initial$;
RESET ROLE;
UPDATE public.commercial_price_rules SET price_per_sqm=price_per_sqm+.01 WHERE id='552e1038-6b92-429a-a95c-503b737c97b8';
SET LOCAL ROLE anon;
DO $price$ DECLARE d jsonb; BEGIN
 d:=public.public_map_scope_revision('exporural',current_setting('qa.exporural_token'));
 IF d->>'revision'=current_setting('qa.exporural_revision') OR d->>'lotCount'<>current_setting('qa.exporural_count') THEN RAISE EXCEPTION 'PRICE_ONLY_SIGNAL_FAILED'; END IF;
END $price$;
RESET ROLE;
UPDATE public.commercial_price_rules SET price_per_sqm=current_setting('qa.exporural_rate')::numeric WHERE id='552e1038-6b92-429a-a95c-503b737c97b8';
SET LOCAL ROLE anon;
DO $base$ BEGIN
 PERFORM set_config('qa.exporural_revision',(public.public_map_scope_revision('exporural',current_setting('qa.exporural_token')))->>'revision',true);
END $base$;
RESET ROLE;
-- Geometry-only movement, invisible to all other sessions and fully rolled back.
UPDATE public.map_entity_geometries SET geometry=ST_AsGeoJSON(ST_Translate(ST_GeomFromGeoJSON(geometry),.001,0))::jsonb,version=version+1,change_reason='UNCOMMITTED_REVISION_SIGNAL_QA',updated_at=now()
WHERE entity_id='d3b8017c-b027-5849-99d1-d9b35c6b5a00' AND is_current;
SET LOCAL ROLE anon;
DO $geometry$ DECLARE d jsonb; BEGIN
 d:=public.public_map_scope_revision('exporural',current_setting('qa.exporural_token'));
 IF d->>'revision'=current_setting('qa.exporural_revision') OR d->>'lotCount'<>current_setting('qa.exporural_count') THEN RAISE EXCEPTION 'GEOMETRY_ONLY_SIGNAL_FAILED'; END IF;
END $geometry$;
SELECT jsonb_build_object('caller_role',current_user,'public_lots',current_setting('qa.exporural_count')::int,'invalid_token_denied',true,'price_only_detected',true,'geometry_only_detected',true,'committed',false) result;
ROLLBACK;
