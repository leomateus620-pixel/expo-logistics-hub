ALTER TABLE public.org_members ADD COLUMN IF NOT EXISTS is_core_team boolean NOT NULL DEFAULT false;

UPDATE public.org_members om
SET is_core_team = true
FROM auth.users u
WHERE u.id = om.user_id
  AND lower(u.email) IN (
    'soltis.fs@gmail.com',
    'djeisondrey@gmail.com',
    'zelia.savoldi@hotmail.com',
    'fenasojafeira@gmail.com',
    'fer.secklereich@gmail.com',
    'leomateus620@gmail.com'
  );

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
  SELECT DISTINCT ON (lower(om.nome_exibicao))
    om.user_id,
    om.nome_exibicao,
    om.cargo,
    om.role::text,
    u.last_sign_in_at
  FROM public.org_members om
  JOIN auth.users u ON u.id = om.user_id
  WHERE om.org_id = _org_id
    AND om.is_active
    AND om.is_core_team
    AND u.last_sign_in_at IS NOT NULL
    AND u.email NOT LIKE '%@noaccess.local'
    AND public.is_org_member(auth.uid(), _org_id)
  ORDER BY lower(om.nome_exibicao), u.last_sign_in_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_org_login_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_org_login_members(uuid) TO authenticated;