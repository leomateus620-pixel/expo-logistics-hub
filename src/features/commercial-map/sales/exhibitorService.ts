import { matchesBuyerNames } from '../utils/buyerDisplayName';
import { supabase } from '@/integrations/supabase/client';

export interface CommercialExhibitor {
  id: string;
  name: string;
  tradeName: string | null;
  documentNumber: string;
  phone: string | null;
  email: string | null;
}

// Tabela nova; o cliente tipado ainda pode não conhecê-la.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function listExhibitors(): Promise<CommercialExhibitor[]> {
  const { data, error } = await db
    .from('commercial_exhibitors')
    .select('id,name,trade_name,document_number,phone,email')
    .order('name')
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, string | null>) => ({
    id: String(row.id),
    name: String(row.name),
    tradeName: row.trade_name?.trim() || null,
    documentNumber: String(row.document_number),
    phone: row.phone,
    email: row.email,
  }));
}

export async function fetchProjectIdForLot(lotId: string): Promise<string | null> {
  const { data, error } = await db.from('commercial_lots').select('project_id').eq('id', lotId).maybeSingle();
  if (error) throw error;
  return data?.project_id ?? null;
}

/** Idempotente: documento normalizado é a chave dentro da organização (ON CONFLICT no servidor). */
export async function upsertExhibitor(input: {
  projectId: string; name: string; tradeName?: string; document: string; phone: string; email: string;
}): Promise<string> {
  const { data, error } = await db.rpc('upsert_commercial_exhibitor', {
    p_project_id: input.projectId,
    p_name: input.name,
    p_document: input.document,
    p_phone: input.phone,
    p_email: input.email,
    p_trade_name: input.tradeName?.trim() || null,
  });
  if (error) throw error;
  return String(data);
}

export function matchesExhibitor(item: CommercialExhibitor, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D+/g, '');
  if (matchesBuyerNames(query, item.tradeName, item.name)) return true;
  if ((item.email ?? '').toLowerCase().includes(q)) return true;
  if (digits.length >= 2) {
    return item.documentNumber.replace(/\D+/g, '').includes(digits) || (item.phone ?? '').replace(/\D+/g, '').includes(digits);
  }
  return false;
}
