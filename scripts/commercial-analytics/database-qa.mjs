// Disposable PostgreSQL only. No remote URL accepted, no production application records.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { seed, ORG, PROJECT, ACTOR, VIEWER } from "./seed.mjs";
import postgres from "postgres";
const cfg = {
  host: "127.0.0.1",
  port: 55438,
  user: "postgres",
  password: "local-financial-tests",
  max: 1,
  onnotice: () => {},
};
const admin = postgres({ ...cfg, database: "postgres" });
await admin.unsafe(
  "DROP DATABASE IF EXISTS commercial_analytics_test WITH (FORCE)",
);
await admin.unsafe("CREATE DATABASE commercial_analytics_test");
await admin.end();
const db = postgres({ ...cfg, database: "commercial_analytics_test" });
const root = new URL("../../", import.meta.url);
const read = (p) => fs.readFile(new URL(p, root), "utf8");
try {
  await db.unsafe(`DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
CREATE TABLE user_capabilities(org_id uuid,user_id uuid,capability text);
CREATE TABLE test_members(org_id uuid,user_id uuid,role text);
CREATE FUNCTION public.is_org_member(u uuid,o uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM test_members WHERE org_id=o AND user_id=u) $$;
CREATE FUNCTION public.get_user_org_role(u uuid,o uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT role FROM test_members WHERE org_id=o AND user_id=u $$;
`);
  await db.unsafe(
    await read("scripts/commercial-analytics/schema-fixture.sql"),
  );
  await db.unsafe(
    await read("scripts/commercial-analytics/capability-fixture.sql"),
  );
  await db.unsafe(`CREATE FUNCTION public.commercial_map_revision(p_project_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT md5(concat_ws('|',(SELECT string_agg(row_to_json(o)::text,'' ORDER BY id) FROM lot_sale_orders o WHERE project_id=p_project_id),
 (SELECT string_agg(row_to_json(i)::text,'' ORDER BY i.id) FROM lot_sale_order_items i JOIN lot_sale_orders o ON o.id=i.order_id WHERE o.project_id=p_project_id),
 (SELECT string_agg(row_to_json(i)::text,'' ORDER BY i.id) FROM lot_sale_installments i JOIN lot_sale_orders o ON o.id=i.order_id WHERE o.project_id=p_project_id))) $$;`);
  await db.unsafe(`GRANT SELECT ON map_projects,lot_sale_orders,lot_sale_order_items,lot_sale_installments TO authenticated;
ALTER TABLE lot_sale_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_sale_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_sale_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_read ON lot_sale_orders FOR SELECT TO authenticated USING(map_has_explicit_capability((SELECT org_id FROM map_projects WHERE id=project_id),'map.manage_sales'));
CREATE POLICY items_read ON lot_sale_order_items FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM lot_sale_orders o WHERE o.id=order_id AND map_has_explicit_capability((SELECT org_id FROM map_projects WHERE id=o.project_id),'map.manage_sales')));
CREATE POLICY installments_read ON lot_sale_installments FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM lot_sale_orders o WHERE o.id=order_id AND map_has_explicit_capability((SELECT org_id FROM map_projects WHERE id=o.project_id),'map.manage_sales')));`);
  await db.unsafe(
    await read("scripts/commercial-analytics/confirmation-fixture.sql"),
  );
  await db.unsafe(
    await read("scripts/commercial-analytics/sales-read-fixture.sql"),
  );
  const fixtures = await seed(db);
  await db.begin(async (tx) =>
    tx.unsafe(
      await read(
        "supabase/migrations/20261021223000_commercial_sales_analytics.sql",
      ),
    ),
  );
  const asUser = (actor, fn) =>
    db.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE authenticated");
      await tx`SELECT set_config('request.jwt.claim.sub',${actor},true)`;
      return fn(tx);
    });
  const summary = () =>
    asUser(
      ACTOR,
      async (tx) =>
        (
          await tx`SELECT commercial_sales_analytics_summary(${PROJECT},'2027-01-15') AS v`
        )[0].v,
    );
  const first = await summary();
  assert.equal(
    first.months.filter(
      (m) => m.month >= "2026-12-01" && m.month <= "2028-04-01",
    ).length,
    17,
  );
  assert.equal(first.signature.count, 4); // standard, fees, twenty, one-off Pix. Partial/legacy excluded.
  assert.equal(
    Number(first.signature.averageSeconds),
    ((24 + 48 + 72 + 24) * 3600) / 4,
  );
  assert.equal(first.reconciliation.undistributedCents, "30000");
  const detail = await asUser(
    ACTOR,
    async (tx) =>
      (
        await tx`SELECT commercial_sales_cashflow_month(${PROJECT},'2026-12-01',${first.generation},100,0) AS v`
      )[0].v,
  );
  assert.equal(
    detail.rows.filter((r) => r.orderId === fixtures.twenty.id).length,
    1,
  );
  const feesDetail = detail.rows.find((r) => r.orderId === fixtures.fees.id);
  assert.equal(feesDetail.principalCents, "10000");
  assert.equal(feesDetail.chargeCents, "11000");
  const partialRows = (
    await asUser(
      ACTOR,
      async (tx) =>
        (
          await tx`SELECT commercial_sales_cashflow_month(${PROJECT},'2026-12-01',${first.generation},100,0) AS v`
        )[0].v,
    )
  ).rows.filter((r) => r.orderId === fixtures.partial.id);
  assert.equal(partialRows[0].feesCents, "0");
  assert.equal(partialRows[0].analytic, true);
  for (const basis of ["principal", "charge"]) {
    let scheduled = 0n,
      paid = 0n,
      outstanding = 0n;
    for (const month of first.months) {
      const v = month[basis];
      assert.equal(
        BigInt(v.scheduledCents),
        BigInt(v.paidCents) + BigInt(v.outstandingCents),
      );
      assert.ok(BigInt(v.overdueCents) <= BigInt(v.outstandingCents));
      scheduled += BigInt(v.scheduledCents);
      paid += BigInt(v.paidCents);
      outstanding += BigInt(v.outstandingCents);
    }
    assert.equal(scheduled, paid + outstanding);
  }
  assert.equal(
    BigInt(first.reconciliation.confirmedCents),
    BigInt(first.reconciliation.coveredCents) +
      BigInt(first.reconciliation.undistributedCents),
  );
  assert.ok(first.receiptsByOccurrence.some((r) => r.month === "2027-03-01")); // Pix due June/2028, received March/2027
  await assert.rejects(
    () =>
      asUser(
        VIEWER,
        (tx) => tx`SELECT commercial_sales_analytics_summary(${PROJECT})`,
      ),
    /MAP_PERMISSION_DENIED/,
  );
  await assert.rejects(
    () =>
      asUser(
        ACTOR,
        (tx) =>
          tx`SELECT commercial_sales_analytics_summary('20000000-0000-4000-8000-000000000002')`,
      ),
    /MAP_PERMISSION_DENIED/,
  );
  await assert.rejects(
    () =>
      asUser(ACTOR, (tx) => tx`SELECT * FROM commercial_signature_completions`),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      asUser(
        ACTOR,
        (tx) => tx`SELECT _commercial_sales_projection(${PROJECT})`,
      ),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      asUser(
        ACTOR,
        (tx) =>
          tx`SELECT commercial_sales_cashflow_month(${PROJECT},'2026-12-01','stale',20,0)`,
      ),
    /ANALYTICS_CHANGED/,
  );
  assert.equal(
    (await asUser(VIEWER, (tx) => tx`SELECT * FROM lot_sale_installments`))
      .length,
    0,
  );
  assert.ok(
    (await asUser(ACTOR, (tx) => tx`SELECT * FROM lot_sale_installments`))
      .length > 0,
  );
  const original3 = [
    fixtures.standard.id,
    fixtures.fees.id,
    fixtures.twenty.id,
  ];
  assert.equal(
    Number(
      (
        await db`SELECT avg(seconds) n FROM _commercial_signature_rows(${PROJECT}) WHERE order_id=ANY(${original3}::uuid[])`
      )[0].n,
    ),
    48 * 3600,
  );
  // Exact margins, including tiny components and random adversarial cent distributions.
  for (let n = 0; n < 100; n++) {
    const rows = [1 + n, 33333, 33334],
      total = rows.reduce((a, b) => a + b, 0),
      cols = [1, 17, total - 18];
    const cells =
      await db`SELECT * FROM _commercial_cent_matrix(${rows}::bigint[],${cols}::bigint[])`;
    rows.forEach((v, r) =>
      assert.equal(
        cells
          .filter((c) => c.row_n === r + 1)
          .reduce((a, c) => a + Number(c.cents), 0),
        v,
      ),
    );
    cols.forEach((v, c) =>
      assert.equal(
        cells
          .filter((x) => x.component_n === c + 1)
          .reduce((a, x) => a + Number(x.cents), 0),
        v,
      ),
    );
    assert.ok(cells.every((c) => Number(c.cents) >= 0));
  }
  const pending = await fixtures.order({ values: [100, 200], signed: false });
  const confirm = () =>
    asUser(
      ACTOR,
      (tx) =>
        tx`SELECT confirm_sale_order_items(${pending.id},${pending.items.map((i) => i.id)}::uuid[])`,
    );
  await confirm();
  const event = (
    await db`SELECT * FROM commercial_signature_completions WHERE order_id=${pending.id}`
  )[0];
  assert.equal(event.evidence, "CONFIRMATION");
  await Promise.all([confirm(), confirm()]);
  assert.equal(
    (
      await db`SELECT count(*) n FROM commercial_signature_completions WHERE order_id=${pending.id}`
    )[0].n,
    "1",
  );
  assert.equal(
    (
      await db`SELECT completed_at FROM commercial_signature_completions WHERE order_id=${pending.id}`
    )[0].completed_at.toISOString(),
    event.completed_at.toISOString(),
  );
  // Event transaction failure rolls back all preceding item/sale/lot writes.
  const rollback = await fixtures.order({ signed: false });
  await assert.rejects(
    () =>
      asUser(ACTOR, async (tx) => {
        await tx`SELECT confirm_sale_order_items(${rollback.id},${rollback.items.map((i) => i.id)}::uuid[])`;
        throw Error("forced rollback");
      }),
    /forced rollback/,
  );
  assert.equal(
    (
      await db`SELECT contract_state FROM lot_sale_order_items WHERE id=${rollback.items[0].id}`
    )[0].contract_state,
    "PENDING_SIGNATURE",
  );
  assert.equal(
    (
      await db`SELECT count(*) n FROM commercial_signature_completions WHERE order_id=${rollback.id}`
    )[0].n,
    "0",
  );
  // Revision-inherited SIGNED never creates a conclusion. No cancellation backfill.
  await db`INSERT INTO lot_sale_order_revisions(order_id,before_state,after_state,reason) VALUES(${rollback.id},'{}','{}','test revision')`;
  await asUser(
    ACTOR,
    (tx) =>
      tx`SELECT confirm_sale_order_items(${rollback.id},${rollback.items.map((i) => i.id)}::uuid[])`,
  );
  assert.equal(
    (
      await db`SELECT count(*) n FROM commercial_signature_completions WHERE order_id=${rollback.id}`
    )[0].n,
    "0",
  );
  // A reader sees a single committed snapshot while a writer holds the order lock.
  const concurrent = await fixtures.order({ signed: false });
  const peer = postgres({ ...cfg, database: "commercial_analytics_test" });
  await db.begin(async (tx) => {
    await tx`SELECT * FROM lot_sale_orders WHERE id=${concurrent.id} FOR UPDATE`;
    const during = await peer.begin(async (p) => {
      await p.unsafe("SET LOCAL ROLE authenticated");
      await p`SELECT set_config('request.jwt.claim.sub',${ACTOR},true)`;
      return (
        await p`SELECT commercial_sales_analytics_summary(${PROJECT}) v`
      )[0].v;
    });
    assert.equal(during.signature.exclusions.PENDING_OR_PARTIAL, 2); // original partial + concurrent
  });
  await peer.end();
  await db`INSERT INTO lot_sale_order_revisions(order_id,before_state,after_state,reason) VALUES(${pending.id},'{}','{}','after signature')`;
  assert.equal(
    (
      await db`SELECT completed_at FROM commercial_signature_completions WHERE order_id=${pending.id}`
    )[0].completed_at.toISOString(),
    event.completed_at.toISOString(),
  );
  // Status-only settlement and reversal: occurrence date stays separate from due date.
  const beforePaid = await summary();
  await db`UPDATE lot_sale_installments SET payment_status='PAID',paid_at='2027-04-10T12:00:00Z' WHERE id=${fixtures.standard.installments[0]}`;
  const afterPaid = await summary();
  assert.equal(
    BigInt(afterPaid.months[0].principal.paidCents) -
      BigInt(beforePaid.months[0].principal.paidCents),
    5882n,
  );
  await db`UPDATE lot_sale_installments SET payment_status='PENDING',paid_at=NULL WHERE id=${fixtures.standard.installments[0]}`;
  assert.equal(
    (await summary()).months[0].principal.paidCents,
    beforePaid.months[0].principal.paidCents,
  );
  // Missing and negative timestamps are exclusions, not a zero average.
  const missing = await fixtures.order({
    signed: true,
    noSchedule: true,
    hours: -1,
  });
  assert.equal(
    (
      await db`SELECT exclusion FROM _commercial_signature_rows(${PROJECT}) WHERE order_id=${missing.id}`
    )[0].exclusion,
    "UNPROVEN_COMPLETION",
  );
  // Read-only projection leaves all commercial rows identical (excluding newly recorded completion evidence).
  const fingerprint = async () =>
    (
      await db`SELECT md5(string_agg(t::text,'' ORDER BY t::text)) hash FROM(SELECT row_to_json(o) t FROM lot_sale_orders o UNION ALL SELECT row_to_json(i) FROM lot_sale_installments i UNION ALL SELECT row_to_json(i) FROM lot_sale_order_items i UNION ALL SELECT row_to_json(s) FROM lot_sales s)x`
    )[0].hash;
  const beforeHash = await fingerprint();
  await summary();
  await summary();
  assert.equal(await fingerprint(), beforeHash);
  // Scale probe in a separate project, preserving the small browser-review fixtures.
  const benchmarkProject = "20000000-0000-4000-8000-000000000099";
  await db`INSERT INTO map_projects(id,org_id,name) VALUES(${benchmarkProject},${ORG},'Synthetic performance project')`;
  for (let n = 0; n < 139; n++)
    await fixtures.order({
      projectId: benchmarkProject,
      values: [100, 200, 300, 400],
      count: 17,
    });
  const benchmark = await asUser(ACTOR, (tx) =>
    tx.unsafe(
      `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT commercial_sales_analytics_summary('${benchmarkProject}')`,
    ),
  );
  const report = {
    benchmark: benchmark[0]["QUERY PLAN"],
    environment: "PostgreSQL local 127.0.0.1:55438/commercial_analytics_test",
    identity:
      "Local auth.uid claims + real capability function; no external Supabase session",
    baseline: first,
    fixtures: { ...fixtures, order: undefined },
  };
  await fs.writeFile(
    new URL("docs/commercial-analytics/database-report.json", root),
    JSON.stringify(report, null, 2),
  );
  console.log(
    "PASS: SQL projection, exact cent margins, full/partial confirmations, 20-item order, date bases, permissions, idempotency, rollback, concurrent snapshot.",
  );
} finally {
  await db.end();
}
