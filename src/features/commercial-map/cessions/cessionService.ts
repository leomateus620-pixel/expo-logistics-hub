import { supabase } from '@/integrations/supabase/client';

export interface CessionDetail {
  id: string;
  beneficiary: string;
  purpose: string;
  orgId: string;
  createdAt: string;
  total: number;
  lots: {
    id: string;
    entityId: string;
    code: string;
    block: string | null;
    number: string | null;
    area: number | null;
    value: number;
    original: { renewal: number | null; second: number | null };
  }[];
  versions: {
    version: number;
    name: string | null;
    path: string | null;
    uploadedAt: string;
    signedAt: string | null;
  }[];
}

export async function cessionDetail(id: string) {
  const { data, error } = await supabase.rpc('space_cession_detail', { p_id: id });
  if (error) throw new Error(error.message);
  return data as unknown as CessionDetail;
}

export function documentStatus(detail?: CessionDetail) {
  if (!detail) return 'Consultando documento…';
  if (!detail.versions.length) return 'Aguardando anexo';
  return detail.versions[0].signedAt ? 'Assinatura confirmada' : 'Aguardando assinatura';
}

export async function registerCession(
  id: string,
  project: string,
  beneficiary: string,
  exhibitor: string | null,
  purpose: string,
  lots: string[],
) {
  const { data, error } = await supabase.rpc('register_space_cession', {
    p_id: id,
    p_project: project,
    p_beneficiary: beneficiary.trim(),
    p_exhibitor: exhibitor,
    p_purpose: purpose.trim(),
    p_lots: lots,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signCession(id: string, version: number) {
  const { error } = await supabase.rpc('sign_cession_contract', { p_id: id, p_version: version });
  if (error) throw new Error(error.message);
}
