ALTER TABLE public.public_map_links
  ADD COLUMN IF NOT EXISTS token text;

CREATE UNIQUE INDEX IF NOT EXISTS public_map_links_token_key
  ON public.public_map_links (token) WHERE token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.public_map_links_provision_permanent()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.public_map_links;
  v_token text;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM public.public_map_links
     WHERE token IS NULL
     ORDER BY sort_order
     FOR UPDATE
  LOOP
    v_token := replace(replace(replace(
      encode(extensions.gen_random_bytes(24), 'base64'), '/', '_'), '+', '-'), '=', '');
    UPDATE public.public_map_links
       SET token = v_token,
           token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
           token_version = greatest(token_version, 1),
           is_active = true,
           revoked_at = NULL
     WHERE id = v_row.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.public_map_links_provision_permanent() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_map_links_provision_permanent() TO service_role;

SELECT public.public_map_links_provision_permanent();

CREATE OR REPLACE FUNCTION public.public_map_links_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM public.public_map_links ORDER BY sort_order LIMIT 1;
  IF v_org IS NULL THEN RETURN '[]'::jsonb; END IF;
  PERFORM public.public_map_require_manager(v_org);

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', k.id, 'slug', k.slug, 'displayName', k.display_name,
      'scopeKind', k.scope_kind, 'scopeKey', k.scope_key,
      'isActive', k.is_active, 'hasToken', k.token IS NOT NULL,
      'token', k.token,
      'tokenVersion', k.token_version, 'revokedAt', k.revoked_at,
      'updatedAt', k.updated_at, 'sortOrder', k.sort_order
    ) ORDER BY k.sort_order)
    FROM public.public_map_links k
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.public_map_links_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_map_links_overview() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_map_link_rotate(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'PUBLIC_MAP_LINK_PERMANENT' USING
    ERRCODE = '42501',
    HINT = 'Cada área possui um único endereço permanente; rotação está desativada.';
END;
$$;

REVOKE ALL ON FUNCTION public.public_map_link_rotate(text) FROM PUBLIC;

DROP FUNCTION IF EXISTS public.public_map_link_set_active(text, boolean);

CREATE FUNCTION public.public_map_link_set_active(_slug text, _active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.public_map_links;
BEGIN
  SELECT * INTO v_link FROM public.public_map_links WHERE slug = _slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'PUBLIC_MAP_LINK_NOT_FOUND'; END IF;
  PERFORM public.public_map_require_manager(v_link.org_id);

  UPDATE public.public_map_links
     SET is_active = _active,
         revoked_at = CASE WHEN _active THEN NULL ELSE now() END
   WHERE id = v_link.id;
END;
$$;

REVOKE ALL ON FUNCTION public.public_map_link_set_active(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_map_link_set_active(text, boolean) TO authenticated, service_role;