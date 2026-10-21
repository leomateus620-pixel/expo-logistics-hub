import { randomUUID } from "node:crypto";
export const ORG = "10000000-0000-4000-8000-000000000001",
  PROJECT = "20000000-0000-4000-8000-000000000001",
  ACTOR = "30000000-0000-4000-8000-000000000001",
  VIEWER = "30000000-0000-4000-8000-000000000002";
export async function seed(db) {
  await db`INSERT INTO map_projects(id,org_id,name) VALUES(${PROJECT},${ORG},'Validação isolada FENASOJA')`;
  await db`INSERT INTO test_members VALUES(${ORG},${ACTOR},'admin'),(${ORG},${VIEWER},'member')`;
  await db`INSERT INTO user_capabilities VALUES(${ORG},${VIEWER},'map.view')`;
  const order = async ({
    projectId = PROJECT,
    values = [300],
    fees = 0,
    count = 3,
    signed = true,
    hours = 24,
    method = "BOLETO",
    months,
    paid = [],
    status = "CONFIRMED",
    legacy = false,
    noSchedule = false,
  } = {}) => {
    const id = randomUUID(),
      total = values.reduce((a, b) => a + b, 0) + fees;
    await db`INSERT INTO lot_sale_orders(id,project_id,buyer_name,stage,spaces_subtotal,fees_total,fee_admin,negotiated_total,payment_type,installment_count,payment_method,salesperson_user_id,idempotency_key,created_at,status)
   VALUES(${id},${projectId},'Empresa fictícia de teste','RENOVACAO',${total - fees},${fees},${fees},${total},${count === 1 ? "CASH" : "INSTALLMENTS"},${count},${method},${ACTOR},${id},'2026-10-01T12:00:00Z',${status})`;
    const items = [];
    for (let j = 0; j < values.length; j++) {
      const lot = randomUUID(),
        sale = randomUUID(),
        item = randomUUID(),
        isSigned = Array.isArray(signed) ? signed[j] : signed;
      const state = legacy
        ? "LEGACY_UNVERIFIED"
        : isSigned
          ? "SIGNED"
          : "PENDING_SIGNATURE";
      await db`INSERT INTO commercial_lots(id,project_id,entity_id,public_identifier,display_name,status,official_area_sqm) VALUES(${lot},${projectId},${randomUUID()},${"TEST-" + lot.slice(0, 8)},${"Lote de teste " + j},${isSigned ? "SOLD" : "SALE_OPEN"},100)`;
      await db`INSERT INTO lot_sales(id,lot_id,buyer_name,negotiated_value,sale_date,salesperson_user_id,salesperson_name,status) VALUES(${sale},${lot},'Empresa fictícia de teste',${values[j]},'2026-10-01',${ACTOR},'Responsável fictício',${isSigned ? "CONFIRMED" : "OPEN"})`;
      await db`INSERT INTO lot_sale_order_items(id,order_id,lot_id,public_identifier,official_area_snapshot,price_per_sqm_snapshot,pricing_stage,item_total,original_status,sale_id,contract_state,signed_at)
    VALUES(${item},${id},${lot},${"TEST-" + lot.slice(0, 8)},100,3,'RENOVACAO',${values[j]},'AVAILABLE',${sale},${state},${isSigned ? new Date(Date.parse("2026-10-01T12:00:00Z") + hours * 3600000) : null})`;
      items.push({ id: item, lot, sale });
    }
    const installments = [];
    if (!noSchedule)
      for (let j = 0; j < count; j++) {
        const inst = randomUUID();
        installments.push(inst);
        const month =
          months?.[j] ??
          new Date(Date.UTC(2026, 11 + j, 5)).toISOString().slice(0, 10);
        const cents =
          Math.floor((total * 100) / count) +
          (j === count - 1 ? Math.round(total * 100) % count : 0);
        await db`INSERT INTO lot_sale_installments(id,order_id,installment_number,due_date,amount,payment_status,paid_at) VALUES(${inst},${id},${j + 1},${month},${cents / 100},${paid.includes(j) ? "PAID" : "PENDING"},${paid.includes(j) ? "2027-03-10T12:00:00Z" : null})`;
      }
    return { id, items, installments, total };
  };
  const standard = await order({ values: [1000], count: 17 });
  const fees = await order({
    values: [100, 200],
    fees: 30,
    count: 3,
    hours: 48,
  });
  const twenty = await order({
    values: Array(20).fill(50),
    count: 3,
    hours: 72,
  });
  const partial = await order({
    values: [100, 200],
    fees: 30,
    signed: [true, false],
  });
  const pix = await order({
    values: [123.45],
    count: 1,
    method: "PIX",
    months: ["2028-06-12"],
    paid: [0],
  });
  const legacy = await order({ legacy: true, noSchedule: true });
  return { standard, fees, twenty, partial, pix, legacy, order };
}
