REVOKE EXECUTE ON FUNCTION public.tg_venue_event_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_venue_event_notifications_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_venue_event_space_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_venue_subscription_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_google_connection_venue_backfill() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_google_sync_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_google_sync_batch(integer) TO service_role;