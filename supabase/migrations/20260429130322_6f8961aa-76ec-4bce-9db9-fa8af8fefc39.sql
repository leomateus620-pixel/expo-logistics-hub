CREATE TABLE public.notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  nome text NOT NULL,
  telefone text NOT NULL,
  tipo text NOT NULL DEFAULT 'agente_viagem',
  ativo boolean NOT NULL DEFAULT true,
  notify_on_start boolean NOT NULL DEFAULT true,
  message_template text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_recipients_org ON public.notification_recipients(org_id) WHERE ativo = true;

ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY nr_select ON public.notification_recipients
  FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY nr_insert ON public.notification_recipients
  FOR INSERT WITH CHECK (public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor'));
CREATE POLICY nr_update ON public.notification_recipients
  FOR UPDATE USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor'));
CREATE POLICY nr_delete ON public.notification_recipients
  FOR DELETE USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor'));

CREATE TRIGGER nr_set_updated_at BEFORE UPDATE ON public.notification_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.notification_recipients (org_id, nome, telefone, tipo, message_template)
SELECT id, 'Fabiana', '+5555999628546', 'agente_viagem',
  'Olá {nome_destinatario}, {motorista} aqui, estou iniciando meu deslocamento para o {destino} para buscar {hospede}, tudo certo com o voo {voo}? Se alguma alteração, me comunique! Obrigado!'
FROM public.organizations
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_recipients nr
  WHERE nr.org_id = organizations.id AND nr.telefone = '+5555999628546'
);