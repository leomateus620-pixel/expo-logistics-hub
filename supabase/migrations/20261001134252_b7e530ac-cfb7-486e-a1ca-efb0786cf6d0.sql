UPDATE public.map_entities p SET metadata = jsonb_set(
  jsonb_set(p.metadata, '{layoutRevision}', '"2028.2-p13.6"'),
  '{internalPlanRuns}',
  (SELECT jsonb_agg(CASE WHEN r->>'id' IN ('central-east-27-52','central-west-53-78')
     THEN jsonb_set(r, '{normalizedFootprint,centerZ}', to_jsonb(21.9/37.8)) ELSE r END ORDER BY o)
   FROM jsonb_array_elements(p.metadata->'internalPlanRuns') WITH ORDINALITY AS t(r,o))
), updated_at = transaction_timestamp()
WHERE p.public_identifier='B5' AND p.classification='PAVILION' AND NOT p.is_archived
  AND p.metadata->>'layoutRevision' IS DISTINCT FROM '2028.2-p13.6';