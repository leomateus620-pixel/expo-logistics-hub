-- Owner-supplied portraits, 23/10/2026. Immutable asset commit; no permission changes.
-- The shared registry also resolves these exact user IDs throughout the application.
DO $$
BEGIN
  IF (SELECT count(*) FROM auth.users WHERE id IN (
    '0c1b6c1e-a6ad-49b7-bb00-88478b28fd01','5085afb8-f0a8-4641-a795-9f1113d456e7',
    '3e7f410c-c14d-4841-8597-8a84f1b8c639','d53cbc3e-01b2-46a3-923e-a36d50e6de3f'
  )) <> 4 THEN RAISE EXCEPTION 'Expected the four audited portrait accounts'; END IF;

  UPDATE auth.users u
  SET raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('avatar_url', p.url)
  FROM (VALUES
    ('0c1b6c1e-a6ad-49b7-bb00-88478b28fd01'::uuid, 'https://raw.githubusercontent.com/leomateus620-pixel/expo-logistics-hub/1a2af4a64ea865364c21f360815f15ace4800eab/public/alvorada/portraits/person-elvio-becker.webp'),
    ('5085afb8-f0a8-4641-a795-9f1113d456e7'::uuid, 'https://raw.githubusercontent.com/leomateus620-pixel/expo-logistics-hub/1a2af4a64ea865364c21f360815f15ace4800eab/public/alvorada/portraits/person-jorge-luiz-viana.webp'),
    ('3e7f410c-c14d-4841-8597-8a84f1b8c639'::uuid, 'https://raw.githubusercontent.com/leomateus620-pixel/expo-logistics-hub/1a2af4a64ea865364c21f360815f15ace4800eab/public/alvorada/portraits/person-jona-santos.webp'),
    ('d53cbc3e-01b2-46a3-923e-a36d50e6de3f'::uuid, 'https://raw.githubusercontent.com/leomateus620-pixel/expo-logistics-hub/1a2af4a64ea865364c21f360815f15ace4800eab/public/alvorada/portraits/person-francine-maria-boijink.webp')
  ) AS p(user_id, url)
  WHERE u.id = p.user_id;

  UPDATE public.profiles SET full_name = 'Jonas Santos'
    WHERE user_id = '3e7f410c-c14d-4841-8597-8a84f1b8c639';
  UPDATE public.org_members SET nome_exibicao = 'Jonas Santos'
    WHERE user_id = '3e7f410c-c14d-4841-8597-8a84f1b8c639';
  UPDATE public.commission_responsibles SET display_name = 'Jonas Santos'
    WHERE user_id = '3e7f410c-c14d-4841-8597-8a84f1b8c639';
  UPDATE auth.users SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('full_name', 'Jonas Santos')
    || CASE WHEN raw_user_meta_data ? 'name' THEN jsonb_build_object('name', 'Jonas Santos') ELSE '{}'::jsonb END
    WHERE id = '3e7f410c-c14d-4841-8597-8a84f1b8c639';
END $$;
