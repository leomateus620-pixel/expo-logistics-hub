-- Fix RLS: transport_locations INSERT should verify driver_user_id = auth.uid()
DROP POLICY IF EXISTS "location_insert" ON public.transport_locations;
CREATE POLICY "location_insert" ON public.transport_locations
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(auth.uid(), org_id) AND driver_user_id = auth.uid());

-- Create atomic RPC for setting transport guests
CREATE OR REPLACE FUNCTION public.set_transport_guests(
  _transport_id uuid,
  _org_id uuid,
  _guest_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Delete existing guest links for this transport
  DELETE FROM public.transport_guests
  WHERE transport_id = _transport_id AND org_id = _org_id;

  -- Insert new guest links
  IF array_length(_guest_ids, 1) > 0 THEN
    INSERT INTO public.transport_guests (transport_id, guest_id, org_id)
    SELECT _transport_id, unnest(_guest_ids), _org_id;
  END IF;
END;
$$;