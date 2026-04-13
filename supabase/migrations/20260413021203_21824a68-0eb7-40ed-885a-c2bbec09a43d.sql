
-- Enums for expense status
CREATE TYPE public.expense_status AS ENUM (
  'rascunho',
  'pendente_comprovante',
  'pendente_validacao',
  'aprovado',
  'ressarcimento_solicitado',
  'ressarcido',
  'recusado',
  'cancelado'
);

CREATE TYPE public.reimbursement_status AS ENUM (
  'pendente',
  'aprovado',
  'pago',
  'recusado'
);

CREATE TYPE public.pix_key_type AS ENUM (
  'cpf',
  'telefone',
  'email',
  'aleatoria'
);

CREATE TYPE public.extraction_status AS ENUM (
  'pendente',
  'sucesso',
  'falha',
  'manual'
);

-- 1. expense_categories
CREATE TABLE public.expense_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'receipt',
  requires_vehicle BOOLEAN NOT NULL DEFAULT false,
  requires_transport BOOLEAN NOT NULL DEFAULT false,
  requires_document BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cat_select" ON public.expense_categories FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "cat_insert" ON public.expense_categories FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "cat_update" ON public.expense_categories FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "cat_delete" ON public.expense_categories FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- 2. expenses
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  transport_id UUID REFERENCES public.transports(id) ON DELETE SET NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  member_user_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  expense_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  payment_method TEXT DEFAULT 'dinheiro',
  paid_by_user_id UUID,
  paid_by_name TEXT,
  pix_key TEXT,
  pix_key_type public.pix_key_type,
  status public.expense_status NOT NULL DEFAULT 'rascunho',
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exp_select" ON public.expenses FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "exp_insert" ON public.expenses FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "exp_update" ON public.expenses FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "exp_delete" ON public.expenses FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

CREATE TRIGGER set_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. expense_documents
CREATE TABLE public.expense_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_url TEXT,
  file_type TEXT DEFAULT 'image',
  document_type TEXT DEFAULT 'comprovante',
  qr_raw TEXT,
  qr_url TEXT,
  issuer_name TEXT,
  issuer_document TEXT,
  invoice_number TEXT,
  invoice_series TEXT,
  access_key TEXT,
  issue_datetime TIMESTAMPTZ,
  extracted_total NUMERIC,
  extracted_payload_json JSONB,
  extraction_status public.extraction_status NOT NULL DEFAULT 'pendente',
  validation_status TEXT DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_select" ON public.expense_documents FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "doc_insert" ON public.expense_documents FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "doc_update" ON public.expense_documents FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "doc_delete" ON public.expense_documents FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- 4. reimbursements
CREATE TABLE public.reimbursements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  beneficiary_user_id UUID,
  beneficiary_name TEXT NOT NULL,
  pix_key TEXT NOT NULL,
  pix_key_type public.pix_key_type NOT NULL DEFAULT 'cpf',
  requested_amount NUMERIC NOT NULL DEFAULT 0,
  approved_amount NUMERIC,
  paid_amount NUMERIC,
  status public.reimbursement_status NOT NULL DEFAULT 'pendente',
  approved_by UUID,
  paid_by UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payment_receipt_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reimbursements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reimb_select" ON public.reimbursements FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "reimb_insert" ON public.reimbursements FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]));
CREATE POLICY "reimb_update" ON public.reimbursements FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));
CREATE POLICY "reimb_delete" ON public.reimbursements FOR DELETE USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- 5. expense_approvals
CREATE TABLE public.expense_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_status public.expense_status,
  new_status public.expense_status NOT NULL,
  reason TEXT,
  acted_by UUID NOT NULL,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appr_select" ON public.expense_approvals FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "appr_insert" ON public.expense_approvals FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]));

-- Storage bucket for expense documents
INSERT INTO storage.buckets (id, name, public) VALUES ('expense-documents', 'expense-documents', false);

CREATE POLICY "exp_doc_select" ON storage.objects FOR SELECT USING (bucket_id = 'expense-documents' AND is_org_member(auth.uid(), (string_to_array(name, '/'))[1]::uuid));
CREATE POLICY "exp_doc_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'expense-documents' AND is_org_member(auth.uid(), (string_to_array(name, '/'))[1]::uuid));
CREATE POLICY "exp_doc_delete" ON storage.objects FOR DELETE USING (bucket_id = 'expense-documents' AND is_org_member(auth.uid(), (string_to_array(name, '/'))[1]::uuid));
