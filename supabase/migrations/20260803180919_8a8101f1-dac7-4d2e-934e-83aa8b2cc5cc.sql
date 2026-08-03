CREATE OR REPLACE FUNCTION public.list_org_login_members(_org_id uuid)
RETURNS TABLE (
  user_id uuid,
  nome_exibicao text,
  cargo text,
  role text,
  last_sign_in_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (lower(m.nome_exibicao))
    m.user_id,
    m.nome_exibicao,
    m.cargo,
    m.role::text,
    u.last_sign_in_at
  FROM public.org_members m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.org_id = _org_id
    AND m.is_active
    AND u.last_sign_in_at IS NOT NULL
    AND u.email NOT LIKE '%@noaccess.local'
    AND public.is_org_member(auth.uid(), _org_id)
  ORDER BY lower(m.nome_exibicao), u.last_sign_in_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_org_login_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_org_login_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_org_login_members(uuid) TO service_role;