-- READ ONLY. Run with an explicitly verified organization UUID:
-- psql ... -v org_id=<UUID> -f scripts/agenda-restaurant/responsible-preflight.sql
-- Names identify candidates for human verification; they never select or configure an account.
BEGIN READ ONLY;
SELECT o.id AS organization_id, o.nome AS organization_name,
  m.user_id, m.nome_exibicao, m.role, m.is_active,
  count(*) OVER () AS candidate_memberships,
  (m.role = 'admin' OR EXISTS (
    SELECT 1 FROM public.user_capabilities c WHERE c.org_id=m.org_id AND c.user_id=m.user_id
      AND c.capability IN ('venue_events_approve','venue_events_full_access')
  )) AS has_existing_approval_permission,
  (m.role IN ('admin','gestor','operador') OR EXISTS (
    SELECT 1 FROM public.user_capabilities c WHERE c.org_id=m.org_id AND c.user_id=m.user_id
      AND c.capability IN ('venue_events_access','venue_events_full_access')
  )) AS has_existing_venue_access
FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id
WHERE m.org_id=:'org_id'::uuid AND m.is_active
  AND public.venue_normalize_name(m.nome_exibicao) IN (
    'roque loguch','roque vanderlei lugoch'
  )
ORDER BY m.user_id;
SELECT s.id, s.org_id, s.slug, s.type, s.active,
  count(*) OVER () AS destination_candidates,
  EXISTS(SELECT 1 FROM public.venue_space_booking_units map
    JOIN public.venue_booking_units unit ON unit.org_id=map.org_id AND unit.id=map.booking_unit_id AND unit.active
    WHERE map.org_id=s.org_id AND map.space_id=s.id) AS has_active_booking_unit
FROM public.venue_spaces s
WHERE s.org_id=:'org_id'::uuid AND s.slug='restaurante-fenasoja' AND s.type='restaurante' AND s.active
ORDER BY s.id;
SELECT org_id,responsible_user_id,enabled,revision,configured_by,configured_at
FROM agenda_private.cronograma_restaurant_config WHERE org_id=:'org_id'::uuid;
COMMIT;
