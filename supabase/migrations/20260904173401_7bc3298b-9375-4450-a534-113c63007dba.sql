UPDATE public.map_entities e
SET is_archived = true,
    verification_status = 'ARCHIVED',
    updated_at = now()
WHERE e.public_identifier IN ('B15', 'B18', 'B30', 'B42-02')
  AND e.is_archived = false
  AND NOT EXISTS (SELECT 1 FROM public.commercial_lots l WHERE l.entity_id = e.id);