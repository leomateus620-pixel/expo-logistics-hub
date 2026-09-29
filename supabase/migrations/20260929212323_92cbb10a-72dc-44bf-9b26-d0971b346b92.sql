CREATE OR REPLACE FUNCTION public.map_can_access_segment(_segment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.map_segments segment
    JOIN public.map_projects project ON project.id = segment.project_id
    WHERE segment.id = _segment_id
      AND segment.is_active = true
      AND project.is_archived = false
      AND public.is_org_member(auth.uid(), project.org_id)
      AND (
        public.get_user_org_role(auth.uid(), project.org_id) IN ('admin', 'gestor')
        OR EXISTS (
          SELECT 1 FROM public.user_capabilities capability
          WHERE capability.user_id = auth.uid()
            AND capability.org_id = project.org_id
            AND capability.capability IN (segment.required_capability, 'full_access', 'admin_access')
        )
      )
  );
$$;