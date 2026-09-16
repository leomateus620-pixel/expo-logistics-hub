import { supabase } from '@/integrations/supabase/client';
import type { LotPricing2028, LotPricingResolution } from '../utils/lotPricing2028';

interface PricingRow {
  lot_id: string;
  public_identifier: string | null;
  pavilion: string | null;
  block: string | null;
  lot_num: number | null;
  corner_status: string | null;
  corner_confirmed: boolean | null;
  official_area_sqm: number | string | null;
  area_validation_status: string | null;
  renovacao_price_per_sqm: number | string | null;
  renovacao_total: number | string | null;
  renovacao_rule_label: string | null;
  segunda_price_per_sqm: number | string | null;
  segunda_total: number | string | null;
  segunda_rule_label: string | null;
  resolution_status: string | null;
}

const numeric = (value: number | string | null): number | null =>
  value === null || value === undefined ? null : Number(value);

function mapRow(row: PricingRow): LotPricing2028 {
  return {
    lotId: row.lot_id,
    publicIdentifier: row.public_identifier,
    pavilion: row.pavilion,
    block: row.block,
    lotNumber: row.lot_num,
    cornerConfirmed: Boolean(row.corner_confirmed),
    cornerStatus: row.corner_status,
    officialAreaSqm: numeric(row.official_area_sqm),
    areaValidationStatus: row.area_validation_status,
    renovacaoPricePerSqm: numeric(row.renovacao_price_per_sqm),
    renovacaoTotal: numeric(row.renovacao_total),
    renovacaoRuleLabel: row.renovacao_rule_label,
    segundaPricePerSqm: numeric(row.segunda_price_per_sqm),
    segundaTotal: numeric(row.segunda_total),
    segundaRuleLabel: row.segunda_rule_label,
    resolutionStatus: (row.resolution_status ?? 'SEM_REGRA') as LotPricingResolution,
  };
}

/** Lê a precificação oficial 2028 (as duas etapas) de um lote persistido. */
export async function fetchLotPricing2028(lotId: string): Promise<LotPricing2028 | null> {
  const { data, error } = await supabase
    .from('commercial_lot_pricing_2028')
    .select(
      'lot_id,public_identifier,pavilion,block,lot_num,corner_status,corner_confirmed,official_area_sqm,area_validation_status,renovacao_price_per_sqm,renovacao_total,renovacao_rule_label,segunda_price_per_sqm,segunda_total,segunda_rule_label,resolution_status',
    )
    .eq('lot_id', lotId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as unknown as PricingRow) : null;
}
