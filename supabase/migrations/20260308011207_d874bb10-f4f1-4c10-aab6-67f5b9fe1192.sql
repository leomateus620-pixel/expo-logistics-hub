
-- Table to store latest driver location per transport
CREATE TABLE public.transport_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transport_id uuid NOT NULL REFERENCES public.transports(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  driver_user_id uuid NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  speed double precision,
  heading double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(transport_id)
);

ALTER TABLE public.transport_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "location_select" ON public.transport_locations FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "location_insert" ON public.transport_locations FOR INSERT TO authenticated
  WITH CHECK (is_org_member(auth.uid(), org_id));
CREATE POLICY "location_update" ON public.transport_locations FOR UPDATE TO authenticated
  USING (driver_user_id = auth.uid());
CREATE POLICY "location_delete" ON public.transport_locations FOR DELETE TO authenticated
  USING (driver_user_id = auth.uid());

-- Enable realtime for location updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.transport_locations;
