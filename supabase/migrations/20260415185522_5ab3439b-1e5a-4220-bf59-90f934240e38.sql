ALTER TABLE public.public_form_links
ADD COLUMN current_token text;

CREATE UNIQUE INDEX IF NOT EXISTS public_form_links_current_token_unique_idx
ON public.public_form_links (current_token)
WHERE current_token IS NOT NULL;