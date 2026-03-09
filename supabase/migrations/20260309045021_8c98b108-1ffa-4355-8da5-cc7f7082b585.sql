
-- Migrate legacy guest_id data to transport_guests junction table
INSERT INTO public.transport_guests (transport_id, guest_id, org_id)
SELECT t.id, t.guest_id, t.org_id
FROM public.transports t
WHERE t.guest_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.transport_guests tg
    WHERE tg.transport_id = t.id AND tg.guest_id = t.guest_id
  );

-- Clear legacy guest_id column
UPDATE public.transports SET guest_id = NULL WHERE guest_id IS NOT NULL;
