// Loopback disposable database only. Run the existing financial bootstrap + database QA first.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const postgres = require("/tmp/financial-postgres/node_modules/postgres");
const db = postgres({
  host: "127.0.0.1",
  port: 55438,
  user: "postgres",
  password: "local-financial-tests",
  database: "financial_composer_test",
  max: 8,
  onnotice: () => {},
});
const org = "985888b8-155f-4bbe-b6b9-6bef2893d99b",
  actor = "b664fc22-69d3-40f1-8370-16b8a07ec402",
  reader = "f9ed4ab9-0ef3-4ee4-9707-36288dbc828f",
  project = "0538d132-34dd-4347-a33c-526edac7339c";
const migration = await fs.readFile(
  "supabase/migrations/20261022090000_financial_live_scenarios.sql",
  "utf8",
);
const passed = [];
const test = async (name, fn) => {
  await fn();
  passed.push(name);
  console.log("PASS", name);
};
const asUser = (uid, fn) =>
  db.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE authenticated");
    await tx`select set_config('request.jwt.claim.sub',${uid},true)`;
    return fn(tx);
  });
const rpc = (name, args, uid = actor) =>
  asUser(
    uid,
    async (tx) =>
      (
        await tx.unsafe(
          `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) v`,
          args,
        )
      )[0].v,
  );
const overview = (basis = "portfolio", uid = reader) =>
  rpc("financial_scenario_overview", [org, edition, basis], uid);
let edition;
try {
  edition = (
    await db`select id from financial_editions where org_id=${org} and code=2028`
  )[0].id;
  if (!(await db`select to_regclass('public.map_projects') t`)[0].t) {
    await db.unsafe(
      await fs.readFile(
        "scripts/financial-scenarios/commercial-schema.sql",
        "utf8",
      ),
    );
    await db.unsafe(`CREATE TABLE public.map_segments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,slug text,is_active boolean DEFAULT true);
  CREATE TABLE public.map_entities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,parent_entity_id uuid,public_identifier text,classification text,is_archived boolean DEFAULT false,segment_id uuid,metadata jsonb DEFAULT '{}');`);
  }
  await db`insert into map_projects(id,org_id,name) values(${project},${org},'FENASOJA fictícia · testes') on conflict do nothing`;
  for (const identifier of ["B1", "B2", "B3", "B4", "B5", "B6", "B8", "B10"])
    await db`insert into map_entities(project_id,public_identifier,classification) select ${project},${identifier},'PAVILION' where not exists(select 1 from map_entities where project_id=${project} and public_identifier=${identifier})`;
  for (const slug of [
    "industria-comercio-servicos",
    "exporural",
    "espaco-automovel",
  ])
    await db`insert into map_segments(project_id,slug) select ${project},${slug} where not exists(select 1 from map_segments where project_id=${project} and slug=${slug})`;
  await test("atomic migration and immutable official references", async () => {
    await db.begin((tx) => tx.unsafe(migration));
    const v = await overview();
    assert.equal(v.scenarios.length, 3);
    const optimistic = v.scenarios.find((s) => s.key === "optimistic");
    assert.equal(optimistic.targets.investment_capacity, "313922964");
    assert.equal(
      BigInt(optimistic.targets.revenue_total) -
        BigInt(optimistic.targets.operating_execution) -
        BigInt(optimistic.targets.cash_reserve),
      315922964n,
    );
    assert.equal(optimistic.targets.parking, "72000000");
    await assert.rejects(
      () => db`update financial_scenarios set notes='alterado'`,
      /IMMUTABLE/,
    );
  });
  await test("reapplying seed creates no versions or audit events", async () => {
    const before = await db`select count(*) n from financial_scenarios`;
    const audit = await db`select count(*) n from financial_audit_events`;
    await db.begin((tx) => tx.unsafe(migration));
    assert.deepEqual(
      await db`select count(*) n from financial_scenarios`,
      before,
    );
    assert.deepEqual(
      await db`select count(*) n from financial_audit_events`,
      audit,
    );
  });
  await test("anonymous, roster outsider and cross-org denied; financial reader has no map grant", async () => {
    const outsider = (
      await db`select user_id from org_members where org_id=${org} and user_id not in(select user_id from financial_access_roster) limit 1`
    )[0].user_id;
    await assert.rejects(() => overview("portfolio", outsider), /FORBIDDEN/);
    await assert.rejects(
      () =>
        rpc("financial_scenario_overview", [
          crypto.randomUUID(),
          edition,
          "portfolio",
        ]),
      /FORBIDDEN/,
    );
    await assert.rejects(
      () =>
        db.begin(async (tx) => {
          await tx.unsafe("set local role anon");
          return tx`select financial_scenario_overview(${org},${edition},'portfolio')`;
        }),
      /permission denied/,
    );
    assert.equal((await overview()).editionId, edition);
    assert.equal(
      (
        await db`select count(*) n from user_capabilities where user_id=${reader} and capability='map.manage_sales'`
      )[0].n,
      "0",
    );
    assert.equal(
      (
        await db`select has_function_privilege('authenticated','public._financial_scenario_build(uuid,uuid,text)','EXECUTE') p`
      )[0].p,
      false,
    );
  });
  const order = async (
    values,
    fees = 0,
    {
      signed = values.map(() => true),
      categories = values.map(() => "pavilion_ics"),
      legacy = false,
    } = {},
  ) => {
    const id = crypto.randomUUID(),
      total = values.reduce((a, b) => a + b, 0);
    await db`insert into lot_sale_orders(id,project_id,buyer_name,stage,spaces_subtotal,fees_total,fee_admin,negotiated_total,payment_type,payment_method,salesperson_user_id,idempotency_key) values(${id},${project},'Empresa fictícia','RENOVACAO',${total / 100},${fees / 100},${fees / 100},${(total + fees) / 100},'CASH','PIX',${actor},${id})`;
    const items = [];
    for (let j = 0; j < values.length; j++) {
      const ent = crypto.randomUUID(),
        lot = crypto.randomUUID(),
        sale = crypto.randomUUID(),
        item = crypto.randomUUID();
      const parent =
        categories[j] === "pavilion_ics"
          ? (
              await db`select id from map_entities where public_identifier='B3'`
            )[0].id
          : categories[j] === "agroindustry"
            ? (
                await db`select id from map_entities where public_identifier='B10'`
              )[0].id
            : null;
      const segment =
        categories[j] === "automotive"
          ? "espaco-automovel"
          : categories[j] === "exporural"
            ? "exporural"
            : "industria-comercio-servicos";
      const segmentId = (
        await db`select id from map_segments where slug=${segment}`
      )[0].id;
      await db`insert into map_entities(id,project_id,parent_entity_id,public_identifier,classification,segment_id) values(${ent},${project},${parent},${"TEST-" + ent},${parent ? "INTERNAL_STAND" : "SELLABLE_LOT"},${segmentId})`;
      await db`insert into commercial_lots(id,project_id,entity_id,public_identifier,display_name,status,lot_number) values(${lot},${project},${ent},${"TEST-" + lot},'Lote fictício',${signed[j] ? "SOLD" : "SALE_OPEN"},null)`;
      await db`insert into lot_sales(id,lot_id,buyer_name,negotiated_value,sale_date,salesperson_user_id,salesperson_name,status) values(${sale},${lot},'Fictício',${values[j] / 100},'2026-10-20',${actor},'Teste',${signed[j] ? "CONFIRMED" : "OPEN"})`;
      await db`insert into lot_sale_order_items(id,order_id,lot_id,public_identifier,official_area_snapshot,price_per_sqm_snapshot,pricing_stage,item_total,original_status,sale_id,contract_state) values(${item},${id},${lot},${"TEST-" + lot},1,1,'RENOVACAO',${values[j] / 100},'AVAILABLE',${sale},${legacy ? "LEGACY_UNVERIFIED" : signed[j] ? "SIGNED" : "PENDING_SIGNATURE"})`;
      items.push({ item, lot, sale, ent, value: values[j] });
    }
    return { id, items };
  };
  let partial;
  await test("single and multi-category order conserve principal plus all fees; partial keeps confirmed shares", async () => {
    const before = await overview(),
      confirmedBefore = await overview("confirmed");
    partial = await order([10001, 20002, 30003], 101, {
      signed: [true, false, true],
      categories: ["pavilion_ics", "automotive", "exporural"],
    });
    const portfolio = await overview(),
      confirmed = await overview("confirmed");
    assert.equal(
      BigInt(portfolio.totals.revenueCents) -
        BigInt(before.totals.revenueCents),
      60107n,
    );
    const shares =
      await db`select * from _financial_scenario_commercial(${project}) where origin_id in ${db(partial.items.map((i) => i.item))}`;
    assert.equal(
      shares.reduce((a, i) => a + BigInt(i.fees), 0n),
      101n,
    );
    const expected = shares
      .filter((i) => i.stage === "confirmed")
      .reduce((a, i) => a + BigInt(i.principal) + BigInt(i.fees), 0n);
    assert.equal(
      BigInt(confirmed.totals.revenueCents) -
        BigInt(confirmedBefore.totals.revenueCents),
      expected,
    );
    assert.equal(
      shares.find((i) => i.origin_id === partial.items[1].item).category,
      "automotive",
    );
    const one = await order([100], 3);
    assert.equal(
      (
        await db`select sum(principal+fees)::text n from _financial_scenario_commercial(${project}) where origin_id=${one.items[0].item}`
      )[0].n,
      "103",
    );
  });
  await test("cancel/revise decreases current; unnumbered ExpoRural and physical B3 resolve correctly", async () => {
    const before = await overview();
    const removed = partial.items[1];
    await db`update lot_sale_order_items set contract_state='CANCELLED' where id=${removed.item}`;
    await db`update lot_sales set status='REVERTED' where id=${removed.sale}`;
    await db`update lot_sale_orders set spaces_subtotal=spaces_subtotal-${removed.value / 100},negotiated_total=negotiated_total-${removed.value / 100} where id=${partial.id}`;
    const after = await overview();
    assert.equal(
      BigInt(before.totals.revenueCents) - BigInt(after.totals.revenueCents),
      20002n,
    );
    assert.equal(
      (
        await db`select category from _financial_scenario_lots(${project}) where lot_id=${partial.items[0].lot}`
      )[0].category,
      "pavilion_ics",
    );
    assert.equal(
      (
        await db`select category from _financial_scenario_lots(${project}) where lot_id=${partial.items[2].lot}`
      )[0].category,
      "exporural",
    );
  });
  await test("legacy, mismatch, missing parent and unreliable fees are exposed without stock prices", async () => {
    await order([900], 0, { legacy: true });
    const invalid = await order([300], 8);
    await db`update lot_sales set negotiated_value=9 where id=${invalid.items[0].sale}`;
    const unclassified = await order([500]);
    await db`update map_entities set parent_entity_id=${crypto.randomUUID()} where id=${unclassified.items[0].ent}`;
    const v = await overview();
    assert.ok(v.coverage.issueCount >= 3);
    assert.ok(BigInt(v.totals.unclassifiedCents) >= 500n);
    assert.ok(v.sourceCoverage.some((x) => x.issue === "FEES_TO_RECONCILE"));
    assert.ok(v.sourceCoverage.some((x) => x.issue === "LEGACY_UNVERIFIED"));
  });
  await test("more than 500 records aggregate fully, declared/in-kind excluded, confirmed replaces projection", async () => {
    const before = await overview();
    await db`insert into financial_sponsorships(org_id,edition_id,name,negotiation_status,projected_free_cents,projected_rouanet_cents,confirmed_free_cents,confirmed_rouanet_cents,declared_cents,in_kind_value_cents,created_by,updated_by)
   select ${org},${edition},'Fictício '||g,'negociacao',100,20,0,0,99999,99999,${actor},${actor} from generate_series(1,501)g`;
    const after = await overview();
    assert.equal(
      BigInt(after.totals.revenueCents) - BigInt(before.totals.revenueCents),
      60120n,
    );
    const id = (
      await db`select id from financial_sponsorships where name='Fictício 1'`
    )[0].id;
    await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
      await tx`update financial_sponsorships set negotiation_status='confirmado',confirmed_free_cents=70,confirmed_rouanet_cents=10 where id=${id}`;
    });
    const replaced = await overview();
    assert.equal(
      BigInt(after.totals.revenueCents) - BigInt(replaced.totals.revenueCents),
      40n,
    );
  });
  await test("collector deduplicates buckets, records bases separately and no audit per read", async () => {
    const before = (await db`select count(*) n from financial_audit_events`)[0]
      .n;
    await overview();
    await overview();
    await db`select _financial_collect_scenarios()`;
    await db`select _financial_collect_scenarios()`;
    assert.equal(
      (await db`select count(*) n from financial_scenario_observations`)[0].n,
      "3",
    );
    assert.equal(
      (await db`select count(*) n from financial_audit_events`)[0].n,
      before,
    );
  });
  const plan = (total) => ({
    condition: "avista",
    default_method: "pix",
    expected_version: null,
    installments: [{ due_date: "2028-01-01", amount_cents: total }],
  });
  await test("versioned v2 references are idempotent, concurrent edits conflict, reader cannot edit", async () => {
    const v = await overview(),
      s = v.scenarios[0],
      a = {
        schemaVersion: 2,
        moneyUnit: "BRL_CENTS",
        referenceKey: "test-audited-v2",
        targets: s.targets,
        provenance: s.provenance,
      },
      request = crypto.randomUUID();
    const args = [
      org,
      edition,
      s.key,
      a,
      "Revisão fictícia de teste",
      request,
      s.version,
    ];
    await assert.rejects(
      () => rpc("financial_save_scenario", args, reader),
      /FORBIDDEN/,
    );
    const saved = await rpc("financial_save_scenario", args);
    assert.deepEqual(await rpc("financial_save_scenario", args), saved);
    const results = await Promise.allSettled(
      [1, 2].map((n) =>
        rpc("financial_save_scenario", [
          org,
          edition,
          s.key,
          { ...a, referenceKey: "concurrent-" + n },
          "Revisão concorrente",
          crypto.randomUUID(),
          saved.version,
        ]),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  });
  await test("financial cash is allocated movement net; PAID commercial installment is not inferred cash", async () => {
    const id = crypto.randomUUID();
    await db`insert into lot_sale_installments(id,order_id,installment_number,due_date,amount,payment_status,paid_at) values(${id},${partial.id},1,'2028-01-01',10,'PAID',now())`;
    const v = await overview("cash");
    assert.ok(v.coverage.unreconciledCommercialPayments >= 1);
    assert.equal(v.coverage.cashScope, "FINANCIAL_ALLOCATIONS_ONLY");
  });
  await test("a failure after DDL and seed rolls back all transaction effects", async () => {
    const count = (await db`select count(*) n from financial_scenarios`)[0].n;
    await assert.rejects(
      () =>
        db.begin(async (tx) => {
          await tx.unsafe(migration);
          await tx.unsafe("select 1/0");
        }),
      /division by zero/,
    );
    assert.equal(
      (await db`select count(*) n from financial_scenarios`)[0].n,
      count,
    );
  });

  await test("manual classification and stable origin links deduplicate portfolio without suppressing cash", async () => {
    const before = await overview();
    const r = await rpc("financial_save", [
      org,
      "revenue",
      {
        edition_id: edition,
        description: "Alimentação fictícia",
        status: "confirmada",
        projected_cents: 1000,
        confirmed_cents: 800,
        funding_type: "recurso_livre",
      },
      null,
      crypto.randomUUID(),
      null,
    ]);
    await rpc("financial_link_scenario_revenue", [
      org,
      edition,
      r.id,
      "food_points",
      "manual",
      null,
      0,
      crypto.randomUUID(),
    ]);
    const mapped = await overview();
    assert.equal(
      BigInt(mapped.currentByCategory.food_points.amountCents),
      800n,
    );
    const linked = await rpc("financial_link_scenario_revenue", [
      org,
      edition,
      r.id,
      "pavilion_ics",
      "sale_order",
      partial.id,
      1,
      crypto.randomUUID(),
    ]);
    const dedup = await overview();
    assert.equal(dedup.totals.revenueCents, before.totals.revenueCents);
    await assert.rejects(
      () =>
        rpc("financial_link_scenario_revenue", [
          org,
          edition,
          r.id,
          "food_points",
          "sale_order",
          crypto.randomUUID(),
          linked.version,
          crypto.randomUUID(),
        ]),
      /ORIGIN_INVALID/,
    );
    const ob = (
      await db`select id from financial_obligations where source_type='receita' and source_id=${r.id}`
    )[0].id;
    const cashBefore = await overview("cash");
    const movement = await rpc("financial_record_movement", [
      org,
      {
        edition_id: edition,
        kind: "recebimento",
        direction: "entrada",
        amount_cents: 300,
        occurred_on: "2026-10-22",
        method: "pix",
      },
      [{ obligation_id: ob, amount_cents: 300 }],
      crypto.randomUUID(),
    ]);
    const cashAfter = await overview("cash");
    assert.equal(
      BigInt(cashAfter.totals.revenueCents) -
        BigInt(cashBefore.totals.revenueCents),
      300n,
    );
    await rpc("financial_reverse_movement", [
      org,
      movement.id,
      "Estorno fictício",
      "2026-10-22",
      crypto.randomUUID(),
    ]);
    assert.equal(
      (await overview("cash")).totals.revenueCents,
      cashBefore.totals.revenueCents,
    );
  });
  await test("planned expense replaced by commitment; commitment does not create payment", async () => {
    const before = await overview(),
      confirmed = await overview("confirmed"),
      cash = await overview("cash");
    const e = await rpc("financial_save_expense", [
      org,
      {
        edition_id: edition,
        title: "Despesa fictícia de teste",
        planned_cents: 1000,
        planned_on: "2026-10-22",
      },
      null,
      crypto.randomUUID(),
      null,
    ]);
    assert.equal(
      BigInt((await overview()).totals.expenseCents) -
        BigInt(before.totals.expenseCents),
      1000n,
    );
    await rpc("financial_transition_expense", [
      org,
      e.id,
      "realizada",
      e.version,
      { committed_cents: 800, committed_on: "2026-10-22" },
      "Realização fictícia",
      crypto.randomUUID(),
    ]);
    assert.equal(
      BigInt((await overview()).totals.expenseCents) -
        BigInt(before.totals.expenseCents),
      800n,
    );
    assert.equal(
      BigInt((await overview("confirmed")).totals.expenseCents) -
        BigInt(confirmed.totals.expenseCents),
      800n,
    );
    assert.equal(
      (await overview("cash")).totals.expenseCents,
      cash.totals.expenseCents,
    );
  });
  await test("physical pavilion registry parity and ambiguous parent coverage", async () => {
    const expected = {
      B1: 1,
      B2: 14,
      B3: 12,
      B4: 8,
      B5: 13,
      B6: 3,
      B8: 5,
      B10: 7,
    };
    const rows =
      await db`select e.public_identifier,p.physical_number from financial_scenario_pavilions p join map_entities e on e.id=p.entity_id`;
    assert.deepEqual(
      Object.fromEntries(
        rows.map((r) => [r.public_identifier, r.physical_number]),
      ),
      expected,
    );
    const r = await order([11], 0, { categories: ["agroindustry"] });
    assert.equal(
      (
        await db`select category from _financial_scenario_lots(${project}) where lot_id=${r.items[0].lot}`
      )[0].category,
      "agroindustry",
    );
    await db`update map_entities set parent_entity_id=id where id=${r.items[0].ent}`;
    assert.equal(
      (
        await db`select issue from _financial_scenario_lots(${project}) where lot_id=${r.items[0].lot}`
      )[0].issue,
      "PARENT_INVALID",
    );
  });
  await test("seed refuses mismatched organization and historical edition remains untouched", async () => {
    const before =
      await db`select row_to_json(s)::text data from financial_scenarios s join financial_editions e on e.id=s.edition_id where e.code=2026`;
    await assert.rejects(
      () =>
        db.begin(async (tx) => {
          await tx`update map_projects set org_id=${crypto.randomUUID()} where id=${project}`;
          await tx.unsafe(migration);
        }),
      /SEED_SCOPE_INVALID/,
    );
    assert.deepEqual(
      await db`select row_to_json(s)::text data from financial_scenarios s join financial_editions e on e.id=s.edition_id where e.code=2026`,
      before,
    );
  });
  await test("missing legacy order margins retain known fees in reconciliation coverage", async () => {
    const patch = await fs.readFile(
      "supabase/migrations/20261022093000_financial_scenario_projection_hardening.sql",
      "utf8",
    );
    const classificationBefore =
      await db`select * from _financial_scenario_lots(${project}) order by lot_id`;
    await db.begin((tx) => tx.unsafe(patch));
    assert.deepEqual(
      await db`select * from _financial_scenario_lots(${project}) order by lot_id`,
      classificationBefore,
    );
    const r = await order([1000], 19);
    await db`update lot_sale_orders set spaces_subtotal=null where id=${r.id}`;
    const rows =
      await db`select * from _financial_scenario_commercial(${project}) where origin_id=${r.id}`;
    assert.equal(rows[0].issue, "FEES_TO_RECONCILE");
    assert.equal(rows[0].fees, "19");
  });
  await test("all bases return cents strings; malformed historical cash remains unobservable without rewriting history", async () => {
    const patch = await fs.readFile(
      "supabase/migrations/20261022100000_financial_scenario_cash_contract.sql",
      "utf8",
    );
    await db.begin((tx) => tx.unsafe(patch));
    for (const basis of ["portfolio", "confirmed", "cash"]) {
      const v = await overview(basis);
      for (const row of Object.values(v.currentByCategory))
        for (const c of row.composition)
          assert.match(c.principalCents, /^-?\d+$/);
      if (basis === "cash")
        assert.ok(
          v.history.some(
            (h) =>
              !h.coverageComplete && Object.keys(h.categories).length === 0,
          ),
        );
    }
  });
  await test("cash sponsorship splits conserved cents and reversal removes the same free and Rouanet shares", async () => {
    const ob = (
      await db`select o.id from financial_obligations o join financial_sponsorships s on s.id=o.source_id where o.source_type='patrocinio' and s.name='Fictício 1'`
    )[0].id;
    const before = await overview("cash");
    const movement = await rpc("financial_record_movement", [
      org,
      {
        edition_id: edition,
        kind: "recebimento",
        direction: "entrada",
        amount_cents: 20,
        occurred_on: "2026-10-22",
        method: "pix",
      },
      [{ obligation_id: ob, amount_cents: 20 }],
      crypto.randomUUID(),
    ]);
    const after = await overview("cash");
    assert.equal(
      BigInt(after.totals.sponsorshipFreeCents) -
        BigInt(before.totals.sponsorshipFreeCents),
      17n,
    );
    assert.equal(
      BigInt(after.totals.sponsorshipRouanetCents) -
        BigInt(before.totals.sponsorshipRouanetCents),
      3n,
    );
    await rpc("financial_reverse_movement", [
      org,
      movement.id,
      "Estorno fictício de teste",
      "2026-10-22",
      crypto.randomUUID(),
    ]);
    assert.equal(
      (await overview("cash")).totals.revenueCents,
      before.totals.revenueCents,
    );
  });
  // Richer synthetic-only review state: above-target revenue and over-budget spending are distinct.
  await order([200000000, 20000000, 90000000, 85000000, 19000000], 12345, {
    signed: [true, false, true, true, true],
    categories: [
      "pavilion_ics",
      "automotive",
      "exporural",
      "external_ics",
      "agroindustry",
    ],
  });
  await db`insert into financial_sponsorships(org_id,edition_id,name,negotiation_status,projected_free_cents,projected_rouanet_cents,created_by,updated_by) values(${org},${edition},'Patrocínio fictício de revisão','negociacao',280000000,65000000,${actor},${actor})`;
  await rpc("financial_save_expense", [
    org,
    {
      edition_id: edition,
      title: "Orçamento fictício excedido",
      planned_cents: 700100000,
      planned_on: "2026-10-22",
    },
    null,
    crypto.randomUUID(),
    null,
  ]);
  await fs.writeFile(
    "docs/financial-scenarios/evidence/synthetic-overview.json",
    JSON.stringify(await overview(), null, 2),
  );
  await test("representative complete commercial volume and measured execution plan", async () => {
    for (let n = 0; n < 141; n++)
      await order([101, 202, 303, 404, 505], 17, {
        signed: [true, false, true, false, true],
        categories: [
          "pavilion_ics",
          "automotive",
          "exporural",
          "external_ics",
          "agroindustry",
        ],
      });
    const v = await overview();
    assert.ok(v.currentByCategory.pavilion_ics.count > 140);
  });
  for (const basis of ["confirmed", "cash"])
    await fs.writeFile(
      `docs/financial-scenarios/evidence/synthetic-${basis}.json`,
      JSON.stringify(await overview(basis), null, 2),
    );
  const planResult = await asUser(
    reader,
    (tx) =>
      tx`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT financial_scenario_overview(${org},${edition},'portfolio')`,
  );
  await fs.writeFile(
    "docs/financial-scenarios/evidence/synthetic-overview.json",
    JSON.stringify(await overview(), null, 2),
  );
  await fs.writeFile(
    "docs/financial-scenarios/evidence/database-tests.json",
    JSON.stringify(
      {
        environment: "isolated PostgreSQL 18.4, synthetic facts only",
        passed: passed.length,
        tests: passed,
        plan: planResult,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: passed.length }, null, 2));
} finally {
  await db.end();
}
