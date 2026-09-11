CREATE OR REPLACE VIEW public.cronograma_eventos_full AS
 SELECT id, org_id, source_key, title, description, category, event_type, source_year,
    start_date, end_date, month_label, week_label, status, priority, location, event_time,
    days_remaining, commission_slug, commission_name, responsible_name, source_sheet,
    source_row, source_cell, source_note, is_official_seed, has_exact_date,
    linked_commissions, subevents, created_by_user_id, created_at, updated_at, category_key,
    start_time, end_time, pending_reason, decision_needed, lock_version,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', ec.id, 'commission_id', ec.commission_id, 'commission_slug', ec.commission_slug, 'commission_name', COALESCE(c.nome, ec.commission_name_snapshot), 'relation_role', ec.relation_role) ORDER BY (ec.relation_role = 'principal'::text) DESC, ec.created_at)
           FROM cronograma_evento_comissoes ec
             LEFT JOIN commissions c ON c.id = ec.commission_id
          WHERE ec.event_id = e.id), '[]'::jsonb) AS commissions_rel,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', er.id, 'user_id', er.org_member_user_id, 'name', COALESCE(m.nome_exibicao, er.name_snapshot), 'role', er.role, 'is_primary', er.is_primary, 'responsible_type', er.responsible_type) ORDER BY er.is_primary DESC, er.created_at)
           FROM cronograma_evento_responsaveis er
             LEFT JOIN org_members m ON m.user_id = er.org_member_user_id AND m.org_id = er.org_id
          WHERE er.event_id = e.id), '[]'::jsonb) AS responsibles_rel,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'description', s.description, 'start_date', s.start_date, 'end_date', s.end_date, 'start_time', s.start_time, 'end_time', s.end_time, 'status', s.status, 'priority', s.priority, 'commission_slug', s.commission_slug, 'responsible_name', s.responsible_name, 'sort_order', s.sort_order, 'lock_version', s.lock_version, 'created_at', s.created_at, 'updated_at', s.updated_at, 'commissions', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', sc.id, 'commission_id', sc.commission_id, 'commission_slug', sc.commission_slug, 'commission_name', COALESCE(c2.nome, sc.commission_name_snapshot), 'relation_role', sc.relation_role))
                   FROM cronograma_subevento_comissoes sc
                     LEFT JOIN commissions c2 ON c2.id = sc.commission_id
                  WHERE sc.subevent_id = s.id), '[]'::jsonb), 'responsibles', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', sr.id, 'user_id', sr.org_member_user_id, 'name', COALESCE(m2.nome_exibicao, sr.name_snapshot), 'role', sr.role, 'is_primary', sr.is_primary, 'responsible_type', sr.responsible_type))
                   FROM cronograma_subevento_responsaveis sr
                     LEFT JOIN org_members m2 ON m2.user_id = sr.org_member_user_id AND m2.org_id = sr.org_id
                  WHERE sr.subevent_id = s.id), '[]'::jsonb), 'actions', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', sa.id, 'start_time', sa.start_time, 'title', sa.title, 'notes', sa.notes, 'responsible_user_id', sa.responsible_user_id, 'responsible_name', sa.responsible_name, 'commission_slug', sa.commission_slug, 'commission_name', sa.commission_name, 'is_done', sa.is_done, 'sort_order', sa.sort_order) ORDER BY sa.sort_order, sa.created_at)
                   FROM cronograma_subevento_acoes sa
                  WHERE sa.subevent_id = s.id), '[]'::jsonb), 'provisions', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', sp.id, 'description', sp.description, 'responsible_user_id', sp.responsible_user_id, 'responsible_name', sp.responsible_name, 'commission_slug', sp.commission_slug, 'commission_name', sp.commission_name, 'note', sp.note, 'is_done', sp.is_done, 'sort_order', sp.sort_order) ORDER BY sp.sort_order, sp.created_at)
                   FROM cronograma_subevento_providencias sp
                  WHERE sp.subevent_id = s.id), '[]'::jsonb), 'guests', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', sg.id, 'name', sg.name, 'category', sg.category, 'sort_order', sg.sort_order) ORDER BY sg.sort_order, sg.created_at)
                   FROM cronograma_subevento_convidados sg
                  WHERE sg.subevent_id = s.id), '[]'::jsonb)) ORDER BY s.sort_order, s.created_at, s.id)
           FROM cronograma_subeventos s
          WHERE s.parent_event_id = e.id), '[]'::jsonb) AS subevents_rel,
    e.origin_source,
    e.origin_commission_id
   FROM cronograma_eventos e;