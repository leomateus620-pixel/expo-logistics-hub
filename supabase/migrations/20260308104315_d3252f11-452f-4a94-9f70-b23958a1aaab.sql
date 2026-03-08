
-- Junction table for multiple guests per transport
CREATE TABLE public.transport_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transport_id uuid NOT NULL REFERENCES public.transports(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(transport_id, guest_id)
);

ALTER TABLE public.transport_guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tg_select" ON public.transport_guests FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "tg_insert" ON public.transport_guests FOR INSERT TO authenticated
  WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));

CREATE POLICY "tg_delete" ON public.transport_guests FOR DELETE TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['admin'::org_role, 'gestor'::org_role]));

-- Migrate existing guest_id data to junction table
INSERT INTO public.transport_guests (transport_id, guest_id, org_id)
SELECT id, guest_id, org_id FROM public.transports WHERE guest_id IS NOT NULL
ON CONFLICT DO NOTHING;
