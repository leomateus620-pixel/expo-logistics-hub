REVOKE EXECUTE ON FUNCTION public.enqueue_event_assignment_notifications(UUID, UUID, UUID[], TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_event_responsible_assignment_push() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_event_commission_assignment_push() FROM PUBLIC, anon, authenticated;