// Install a second-stage price override only on the disposable QA database.
// The real inventory migration keeps both official stage prices identical.
export async function setSecondStagePrice(tx, lotId, total) {
  if (!(await tx`SELECT to_regclass('public.qa_food_stage_prices') AS relation`)[0].relation) {
    const columns = await tx`SELECT attname FROM pg_attribute
      WHERE attrelid = 'public.commercial_lot_pricing_2028'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum`;
    const select = columns.map(({ attname }) => attname === 'segunda_total'
      ? 'coalesce(qa.total, official.segunda_total) AS segunda_total'
      : `official."${attname}"`).join(', ');
    await tx.unsafe(`
      CREATE TABLE public.qa_food_stage_prices(lot_id uuid PRIMARY KEY, total numeric NOT NULL);
      ALTER VIEW public.commercial_lot_pricing_2028 RENAME TO qa_official_lot_pricing_2028;
      CREATE VIEW public.commercial_lot_pricing_2028 WITH (security_invoker = on) AS
      SELECT ${select} FROM public.qa_official_lot_pricing_2028 official
      LEFT JOIN public.qa_food_stage_prices qa ON qa.lot_id = official.lot_id;
      GRANT SELECT ON public.qa_food_stage_prices, public.commercial_lot_pricing_2028 TO authenticated;
    `);
  }
  await tx`INSERT INTO public.qa_food_stage_prices VALUES (${lotId}, ${total})
    ON CONFLICT (lot_id) DO UPDATE SET total = EXCLUDED.total`;
}
