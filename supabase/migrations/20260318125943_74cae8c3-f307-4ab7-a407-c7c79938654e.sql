
-- Add documento_url column to vehicles
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS documento_url text;

-- Create storage bucket for vehicle documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-documents', 'vehicle-documents', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for vehicle-documents bucket
CREATE POLICY "vehicle_docs_select" ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-documents');

CREATE POLICY "vehicle_docs_insert" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vehicle-documents' AND auth.role() = 'authenticated');

CREATE POLICY "vehicle_docs_delete" ON storage.objects FOR DELETE
USING (bucket_id = 'vehicle-documents' AND auth.role() = 'authenticated');
