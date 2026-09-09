REVOKE ALL ON FUNCTION public.commission_leadership_user_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commission_leadership_user_ids(uuid) TO service_role;