
CREATE POLICY "cronograma_attach_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'cronograma-event-attachments'
    AND public.is_org_member(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "cronograma_attach_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'cronograma-event-attachments'
    AND public.is_org_member(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "cronograma_attach_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'cronograma-event-attachments'
    AND public.is_org_member(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "cronograma_attach_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'cronograma-event-attachments'
    AND public.is_org_member(auth.uid(), (storage.foldername(name))[1]::uuid)
  );
