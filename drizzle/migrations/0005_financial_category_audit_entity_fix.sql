CREATE OR REPLACE FUNCTION public.financial_reorder_categories(_org_id uuid, _ordered_ids uuid[], _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; replay jsonb; i int;
BEGIN
  actor := public.financial_require(_org_id, 'financial_admin');
  replay := public.financial_begin(_org_id, 'reorder:category', _request_id, to_jsonb(_ordered_ids));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF EXISTS (SELECT 1 FROM unnest(_ordered_ids) x WHERE NOT EXISTS (SELECT 1 FROM public.financial_categories WHERE id=x AND org_id=_org_id)) THEN
    RAISE EXCEPTION 'FINANCIAL_CATEGORY_INVALID' USING ERRCODE='22023'; END IF;
  FOR i IN 1..coalesce(array_length(_ordered_ids,1),0) LOOP
    UPDATE public.financial_categories SET sort_order=i*10, version=version+1, updated_by=actor, updated_at=now()
      WHERE id=_ordered_ids[i] AND sort_order <> i*10;
  END LOOP;
  PERFORM public.financial_audit(_org_id, NULL, 'category', _org_id, 'reorder', NULL, to_jsonb(_ordered_ids), NULL);
  RETURN public.financial_finish(_org_id, 'reorder:category', _request_id, jsonb_build_object('ok',true));
END $$;

CREATE OR REPLACE FUNCTION public.financial_seed_expense_categories(_org_id uuid, _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; replay jsonb; n int := 0; nm text; i int := 0;
BEGIN
  actor := public.financial_require(_org_id, 'financial_admin');
  replay := public.financial_begin(_org_id, 'seed:expense_categories', _request_id, '{}'::jsonb);
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  FOREACH nm IN ARRAY ARRAY['Infraestrutura e Obras','Eventos e Produção','Marketing e Comunicação','Alimentação e Hospitalidade',
    'Logística e Transporte','Pessoal e Equipes','Segurança','Serviços Operacionais','Equipamentos e Materiais',
    'Taxas, Seguros e Licenças','Obrigações de Edições Anteriores','Reservas'] LOOP
    i := i + 1;
    IF NOT EXISTS (SELECT 1 FROM public.financial_categories WHERE org_id=_org_id AND domain='despesa' AND lower(btrim(name))=lower(nm)) THEN
      INSERT INTO public.financial_categories(org_id,domain,name,sort_order,created_by,updated_by) VALUES(_org_id,'despesa',nm,i*10,actor,actor);
      n := n + 1;
    END IF;
  END LOOP;
  PERFORM public.financial_audit(_org_id, NULL, 'category', _org_id, 'seed', NULL, jsonb_build_object('created',n), NULL);
  RETURN public.financial_finish(_org_id, 'seed:expense_categories', _request_id, jsonb_build_object('created',n));
END $$;
REVOKE ALL ON FUNCTION public.financial_reorder_categories(uuid,uuid[],uuid), public.financial_seed_expense_categories(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_reorder_categories(uuid,uuid[],uuid), public.financial_seed_expense_categories(uuid,uuid) TO authenticated;