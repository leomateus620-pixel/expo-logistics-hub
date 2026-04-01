-- Fix INSERT policy to check org membership
DROP POLICY IF EXISTS "vehicle_docs_insert" ON storage.objects;
CREATE POLICY "vehicle_docs_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vehicle-documents'
  AND is_org_member(auth.uid(), (storage.foldername(name))[1]::uuid)
);

-- Fix DELETE policy to check org role
DROP POLICY IF EXISTS "vehicle_docs_delete" ON storage.objects;
CREATE POLICY "vehicle_docs_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'vehicle-documents'
  AND get_user_org_role(auth.uid(), (storage.foldername(name))[1]::uuid) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role])
);

-- Make bucket private
UPDATE storage.buckets SET public = false WHERE id = 'vehicle-documents';