-- 1) Relaxar policies de UPDATE/DELETE em transport_locations:
-- além do dono da linha, o motorista atualmente designado no transport também pode sobrescrever.
DROP POLICY IF EXISTS location_delete ON public.transport_locations;
CREATE POLICY location_delete ON public.transport_locations
  FOR DELETE
  USING (
    is_org_member(auth.uid(), org_id)
    AND (
      driver_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.transports t
        WHERE t.id = transport_id AND t.motorista_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS location_update ON public.transport_locations;
CREATE POLICY location_update ON public.transport_locations
  FOR UPDATE
  USING (
    is_org_member(auth.uid(), org_id)
    AND (
      driver_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.transports t
        WHERE t.id = transport_id AND t.motorista_user_id = auth.uid()
      )
    )
  );

-- 2) Recuperação imediata: apagar a linha fantasma da viagem em curso
DELETE FROM public.transport_locations
WHERE transport_id = '9da9dd3c-1a40-4f1e-8a82-596505f34d3a';