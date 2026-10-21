import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const database =
  process.env.FINANCIAL_TEST_DATABASE || "financial_composer_test";
if (!/^financial_composer_(test|acceptance)$/.test(database))
  throw Error("Only named disposable local financial databases are allowed");
const require = createRequire(import.meta.url);
const postgres = require(
  process.env.FINANCIAL_TEST_POSTGRES_MODULE ||
    "/tmp/financial-postgres/node_modules/postgres",
);
const db = postgres({
  host: "127.0.0.1",
  port: 55438,
  user: "postgres",
  password: "local-financial-tests",
  database,
  max: 8,
  onnotice: () => {},
});
const org = "985888b8-155f-4bbe-b6b9-6bef2893d99b",
  user = "b664fc22-69d3-40f1-8370-16b8a07ec402",
  other = crypto.randomUUID(),
  stranger = crypto.randomUUID(),
  readUser = "f9ed4ab9-0ef3-4ee4-9707-36288dbc828f";
const ids = [
  user,
  "b8fd1e36-b46c-4eff-bb75-372b676ce123",
  "e0ada2e5-4440-4d15-91bd-aa4160247113",
  readUser,
];
const edition = crypto.randomUUID(),
  history = crypto.randomUUID();
const passed = [];
async function asUser(id, fn) {
  return db.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE authenticated");
    await tx`select set_config('request.jwt.claim.sub',${id},true)`;
    return fn(tx);
  });
}
async function call(tx, name, args) {
  const keys = args.map((_, i) => "$" + (i + 1)).join(",");
  const rows = await tx.unsafe(
    `SELECT public.${name}(${keys}) AS result`,
    args,
  );
  return rows[0].result;
}
async function test(name, fn) {
  await fn();
  passed.push(name);
  console.log("PASS", name);
}
async function fail(fn, pattern) {
  await assert.rejects(fn, pattern);
}
function plan(total = 100000) {
  return {
    condition: "parcelado",
    default_method: "pix",
    expected_version: null,
    installments: [
      { due_date: "2028-01-31", amount_cents: Math.floor(total / 3) },
      { due_date: "2028-02-29", amount_cents: Math.floor(total / 3) },
      {
        due_date: "2028-03-31",
        amount_cents: total - 2 * Math.floor(total / 3),
      },
    ],
  };
}
function revenue(desc = "Receita isolada", extra = {}) {
  return {
    description: desc,
    status: "confirmada",
    projected_cents: 100000,
    confirmed_cents: 100000,
    competence_date: "2028-01-20",
    funding_type: "nao_identificado",
    payment_plan: plan(),
    ...extra,
  };
}
const item = (payload) => ({
  draft_id: crypto.randomUUID(),
  expected_version: null,
  payload,
});
const batch = (
  items,
  request = crypto.randomUUID(),
  kind = "revenue",
  ed = edition,
  uid = user,
) =>
  asUser(uid, (tx) =>
    call(tx, "financial_save_batch", [org, ed, kind, items, request]),
  );
try {
  await db`insert into organizations(id) values(${org}),(${other}) on conflict do nothing`;
  for (const id of ids)
    await db`insert into org_members values(${org},${id},true,${id === readUser ? "gestor" : "admin"})`;
  await db`insert into org_members values(${org},${stranger},true,'admin')`;
  await db`insert into user_capabilities values(${org},${readUser},'financial_access')`;
  await db`insert into financial_editions(id,org_id,code,label,status,period_start,period_end) values(${edition},${org},2028,'Edição de teste','operacional','2028-01-01','2028-12-31'),(${history},${org},2026,'Histórico teste','historico','2026-01-01','2026-12-31')`;
  await db.begin(async (tx) =>
    tx.unsafe(
      await fs.readFile(
        "supabase/migrations/20261021205900_financial_restricted_roster.sql",
        "utf8",
      ),
    ),
  );
  await test("roster: exactly four authorized identities; general admin denied", async () => {
    for (const id of ids)
      assert.equal(
        await asUser(id, (tx) =>
          call(tx, "financial_can", [org, "financial_access"]),
        ),
        true,
      );
    assert.equal(
      await asUser(stranger, (tx) =>
        call(tx, "financial_can", [org, "financial_access"]),
      ),
      false,
    );
    await fail(
      () =>
        asUser(stranger, (tx) =>
          call(tx, "financial_list_references", [org, "payee", "", false]),
        ),
      /FINANCIAL_FORBIDDEN/,
    );
    await fail(
      () =>
        batch(
          [item(revenue())],
          crypto.randomUUID(),
          "revenue",
          edition,
          stranger,
        ),
      /FINANCIAL_FORBIDDEN/,
    );
    const rows = await asUser(
      stranger,
      (tx) => tx`select * from financial_revenues`,
    );
    assert.equal(rows.length, 0);
  });
  await test("read access does not imply edit/admin/settle", async () => {
    assert.equal(
      await asUser(readUser, (tx) =>
        call(tx, "financial_can", [org, "financial_edit"]),
      ),
      false,
    );
    await fail(
      () =>
        asUser(readUser, (tx) =>
          call(tx, "financial_create_reference", [
            org,
            "payee",
            "Fornecedor teste",
            null,
            crypto.randomUUID(),
          ]),
        ),
      /FINANCIAL_FORBIDDEN/,
    );
  });
  let reference;
  await test("concurrent normalized creation deduplicates in PostgreSQL", async () => {
    const values = await Promise.all(
      ["Fornecedor Teste", " fornecedor   TESTE ", "FORNECEDOR TESTE"].map(
        (name) =>
          asUser(user, (tx) =>
            call(tx, "financial_create_reference", [
              org,
              "payee",
              name,
              null,
              crypto.randomUUID(),
            ]),
          ),
      ),
    );
    assert.equal(new Set(values.map((x) => x.id)).size, 1);
    reference = values[0];
  });
  await test("cross organization catalogue access denied", async () =>
    fail(
      () =>
        asUser(user, (tx) =>
          call(tx, "financial_list_references", [other, "payee", "", false]),
        ),
      /FINANCIAL_FORBIDDEN/,
    ));
  let saved;
  const request = crypto.randomUUID(),
    items = [
      item(revenue("Primeira receita")),
      item(revenue("Segunda receita")),
    ];
  await test("atomic batch creates one fact and one obligation per item", async () => {
    saved = await batch(items, request);
    assert.equal(saved.count, 2);
    assert.equal(
      Number(
        (
          await db`select count(*) n from financial_revenues where org_id=${org}`
        )[0].n,
      ),
      2,
    );
    assert.equal(
      Number(
        (
          await db`select count(*) n from financial_obligations where org_id=${org}`
        )[0].n,
      ),
      2,
    );
  });
  await test("timeout retry/concurrent double submission returns same identities", async () => {
    const again = await Promise.all([
      batch(items, request),
      batch(items, request),
    ]);
    assert.deepEqual(again[0], saved);
    assert.deepEqual(again[1], saved);
    await fail(
      () => batch([items[0]], request),
      /FINANCIAL_IDEMPOTENCY_CONFLICT/,
    );
  });
  await test("failure in item two rolls back all financial writes", async () => {
    const count = Number(
      (await db`select count(*) n from financial_revenues`)[0].n,
    );
    await fail(
      () =>
        batch([
          item(revenue("Antes da falha")),
          item(
            revenue("Inválida", {
              payment_plan: {
                ...plan(),
                installments: [{ due_date: "2028-01-01", amount_cents: 1 }],
              },
            }),
          ),
        ]),
      /FINANCIAL_INSTALLMENT_SUM_MISMATCH/,
    );
    assert.equal(
      Number((await db`select count(*) n from financial_revenues`)[0].n),
      count,
    );
  });
  let schedule;
  const source = saved.items[0].record;
  const getPlan = () =>
    asUser(user, (tx) =>
      call(tx, "financial_payment_plan", [org, edition, "receita", source.id]),
    );
  await test("1000 / 3 preserves exact cents and civil dates", async () => {
    schedule = await getPlan();
    assert.deepEqual(
      schedule.installments.map((x) => x.amount_cents),
      [33333, 33333, 33334],
    );
    assert.deepEqual(
      schedule.installments.map((x) => x.due_date),
      ["2028-01-31", "2028-02-29", "2028-03-31"],
    );
  });
  let movement;
  await test("partial receipt allocates one parent with installment child; no extra cash", async () => {
    movement = await asUser(user, (tx) =>
      call(tx, "financial_record_movement", [
        org,
        {
          edition_id: edition,
          kind: "recebimento",
          direction: "entrada",
          amount_cents: 10000,
          occurred_on: "2028-02-03",
          method: "pix",
        },
        [
          {
            obligation_id: schedule.obligation_id,
            amount_cents: 10000,
            installments: [
              {
                installment_id: schedule.installments[0].id,
                amount_cents: 10000,
              },
            ],
          },
        ],
        crypto.randomUUID(),
      ]),
    );
    const p = await getPlan();
    assert.equal(p.settled_cents, 10000);
    assert.equal(p.installments[0].settled_cents, 10000);
    assert.equal(p.unassigned_settled_cents, 0);
    assert.equal(
      Number(
        (await db`select sum(amount_cents) n from financial_movements`)[0].n,
      ),
      10000,
    );
  });
  await test("settled installment and source reduction protected", async () => {
    const changed = {
      ...plan(),
      expected_version: schedule.version,
      installments: schedule.installments.map((i, n) => ({
        ...i,
        amount_cents: n === 0 ? 1 : n === 1 ? 66665 : i.amount_cents,
      })),
    };
    await fail(
      () =>
        batch([
          {
            draft_id: crypto.randomUUID(),
            expected_version: source.version,
            payload: { id: source.id, payment_plan: changed },
          },
        ]),
      /FINANCIAL_INSTALLMENT_SETTLED/,
    );
    await fail(
      () =>
        asUser(user, (tx) =>
          call(tx, "financial_save", [
            org,
            "revenue",
            { id: source.id, confirmed_cents: 1 },
            source.version,
            crypto.randomUUID(),
            null,
          ]),
        ),
      /BELOW_SETTLED/,
    );
  });
  await test("reversal reduces original parent and same installment", async () => {
    const key = crypto.randomUUID();
    await asUser(user, (tx) =>
      call(tx, "financial_reverse_movement", [
        org,
        movement.id,
        "Estorno de teste isolado",
        "2028-02-04",
        key,
      ]),
    );
    const p = await getPlan();
    assert.equal(p.settled_cents, 0);
    assert.equal(p.installments[0].settled_cents, 0);
    await asUser(user, (tx) =>
      call(tx, "financial_reverse_movement", [
        org,
        movement.id,
        "Estorno de teste isolado",
        "2028-02-04",
        key,
      ]),
    );
  });
  await test("projected schedule creates neither obligation nor cash", async () => {
    const x = await batch([
      item(
        revenue("Somente previsão", {
          status: "projetada",
          confirmed_cents: null,
        }),
      ),
    ]);
    const p = await asUser(user, (tx) =>
      call(tx, "financial_payment_plan", [
        org,
        edition,
        "receita",
        x.items[0].record.id,
      ]),
    );
    assert.equal(p.obligation_id, null);
  });
  await test("historical 2026 remains read-only", async () =>
    fail(
      () => batch([item(revenue())], crypto.randomUUID(), "revenue", history),
      /FINANCIAL_EDITION_READ_ONLY/,
    ));
  await test("source counted once in server summary; dates use three distinct bases", async () => {
    const summary = await asUser(user, (tx) =>
      call(tx, "financial_edition_summary", [org, edition]),
    );
    assert.equal(summary.revenue.count, 3);
    const schedule = await asUser(user, (tx) =>
      call(tx, "financial_schedule_summary", [org, edition]),
    );
    assert.ok(schedule.months.some((x) => x.month === "2028-03-01"));
  });
  await test("expense batch preserves financial category and separate commitment", async () => {
    const cat = await asUser(user, (tx) =>
      call(tx, "financial_create_reference", [
        org,
        "expense_category",
        "Serviços operacionais",
        null,
        crypto.randomUUID(),
      ]),
    );
    const x = await batch(
      [
        item({
          title: "Despesa isolada",
          category_id: cat.id,
          payee_reference_id: reference.id,
          status: "realizada",
          committed_cents: 100000,
          committed_on: "2028-01-20",
          planned_cents: null,
          payment_plan: { ...plan(), default_method: "boleto" },
        }),
      ],
      crypto.randomUUID(),
      "expense",
    );
    const row = x.items[0].record;
    assert.equal(row.category_id, cat.id);
    assert.equal(row.payee_reference_id, reference.id);
    assert.equal(row.paid_cents, 0);
    assert.equal(
      (
        await db`select financial_category_id from expenses where id=${row.id}`
      )[0].financial_category_id,
      cat.id,
    );
    const p = await asUser(user, (tx) =>
      call(tx, "financial_payment_plan", [org, edition, "despesa", row.id]),
    );
    assert.equal(p.installments.length, 3);
    assert.equal(p.default_method, "boleto");
  });
  await test("financial_edit can create a category without acquiring administration", async () => {
    const editor = ids[1];
    await db`update org_members set role='gestor' where org_id=${org} and user_id=${editor}`;
    await db`insert into user_capabilities values(${org},${editor},'financial_edit')`;
    const cat = await asUser(editor, (tx) =>
      call(tx, "financial_create_reference", [
        org,
        "expense_category",
        "Categoria do lançador",
        null,
        crypto.randomUUID(),
      ]),
    );
    assert.ok(cat.id);
    await fail(
      () =>
        asUser(editor, (tx) =>
          call(tx, "financial_save_category", [
            org,
            { id: cat.id, name: "Nome sem autorização" },
            cat.version,
            crypto.randomUUID(),
          ]),
        ),
      /FINANCIAL_FORBIDDEN/,
    );
    await fail(
      () =>
        batch(
          [item(revenue())],
          crypto.randomUUID(),
          "revenue",
          edition,
          editor,
        ),
      /FINANCIAL_FORBIDDEN/,
    );
  });
  await test("archived reference remains readable; new links rejected", async () => {
    await asUser(user, (tx) =>
      call(tx, "financial_update_reference", [
        org,
        reference.id,
        reference.name,
        false,
        reference.version,
        crypto.randomUUID(),
      ]),
    );
    assert.equal(
      (
        await asUser(user, (tx) =>
          call(tx, "financial_list_references", [org, "payee", "", false]),
        )
      ).length,
      0,
    );
    await fail(
      () =>
        batch(
          [
            item({
              title: "Destino inválido",
              status: "prevista",
              planned_cents: 100000,
              payee_reference_id: reference.id,
              payment_plan: plan(),
            }),
          ],
          crypto.randomUUID(),
          "expense",
        ),
      /FINANCIAL_REFERENCE_INVALID/,
    );
  });
  await test("custom funding source keeps explicit technical classification", async () => {
    const x = await batch([
      {
        ...item(revenue("Origem descritiva", { funding_type: "lei_rouanet" })),
        create_references: { funding_source: "Projeto cultural isolado" },
      },
    ]);
    assert.equal(x.items[0].record.funding_type, "lei_rouanet");
    assert.ok(x.items[0].record.funding_source_reference_id);
    const r = await asUser(user, (tx) =>
      call(tx, "financial_create_reference", [
        org,
        "funding_source",
        "Origem sem classificação",
        null,
        crypto.randomUUID(),
      ]),
    );
    assert.equal(r.funding_type, "nao_identificado");
  });
  await test("concurrent receipts cannot exceed obligation or installment balances", async () => {
    const p = await getPlan();
    const payload = {
      edition_id: edition,
      kind: "recebimento",
      direction: "entrada",
      amount_cents: 60000,
      occurred_on: "2028-02-05",
      method: "pix",
    };
    const a = [
      {
        obligation_id: p.obligation_id,
        amount_cents: 60000,
        installments: [
          { installment_id: p.installments[0].id, amount_cents: 33333 },
          { installment_id: p.installments[1].id, amount_cents: 26667 },
        ],
      },
    ];
    const results = await Promise.allSettled([
      asUser(user, (tx) =>
        call(tx, "financial_record_movement", [
          org,
          payload,
          a,
          crypto.randomUUID(),
        ]),
      ),
      asUser(user, (tx) =>
        call(tx, "financial_record_movement", [
          org,
          payload,
          a,
          crypto.randomUUID(),
        ]),
      ),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    const after = await getPlan();
    assert.equal(after.settled_cents, 60000);
    await fail(
      () =>
        asUser(user, (tx) =>
          call(tx, "financial_record_movement", [
            org,
            {
              ...payload,
              kind: "devolucao",
              direction: "saida",
              amount_cents: 10000,
            },
            [{ obligation_id: p.obligation_id, amount_cents: 10000 }],
            crypto.randomUUID(),
          ]),
        ),
      /FINANCIAL_INSTALLMENT_DETAILS_REQUIRED/,
    );
  });
  await test("legacy unassigned settlement is preserved then explicitly reconciled", async () => {
    const source = saved.items[1].record;
    const p = await asUser(user, (tx) =>
      call(tx, "financial_payment_plan", [org, edition, "receita", source.id]),
    );
    const m = await asUser(user, (tx) =>
      call(tx, "financial_record_movement", [
        org,
        {
          edition_id: edition,
          kind: "recebimento",
          direction: "entrada",
          amount_cents: 1000,
          occurred_on: "2028-02-06",
        },
        [{ obligation_id: p.obligation_id, amount_cents: 1000 }],
        crypto.randomUUID(),
      ]),
    );
    let fresh = await asUser(user, (tx) =>
      call(tx, "financial_payment_plan", [org, edition, "receita", source.id]),
    );
    assert.equal(fresh.unassigned_settled_cents, 1000);
    assert.equal(fresh.installments[0].settled_cents, 0);
    const allocation = fresh.movements.find((x) => x.id === m.id).allocation_id;
    await asUser(user, (tx) =>
      call(tx, "financial_assign_installments", [
        org,
        allocation,
        [{ installment_id: p.installments[0].id, amount_cents: 1000 }],
        crypto.randomUUID(),
      ]),
    );
    fresh = await asUser(user, (tx) =>
      call(tx, "financial_payment_plan", [org, edition, "receita", source.id]),
    );
    assert.equal(fresh.unassigned_settled_cents, 0);
    assert.equal(fresh.installments[0].settled_cents, 1000);
    assert.equal(fresh.settled_cents, 1000);
  });
  await test("new references validate domain and organization; financial payload rejects unknown keys", async () => {
    const payee = await asUser(user, (tx) =>
      call(tx, "financial_create_reference", [
        org,
        "payee",
        "Referência de domínio errado",
        null,
        crypto.randomUUID(),
      ]),
    );
    await fail(
      () =>
        batch([
          item(
            revenue("Domínio errado", { counterparty_reference_id: payee.id }),
          ),
        ]),
      /FINANCIAL_REFERENCE_INVALID/,
    );
    await fail(
      () =>
        batch([
          {
            ...item(revenue()),
            create_references: { payee: "Não criar neste domínio" },
          },
        ]),
      /FINANCIAL_REFERENCE_INVALID/,
    );
    await fail(
      () =>
        batch([
          item(revenue("Payload desconhecido", { unexpected_paid: true })),
        ]),
      /FINANCIAL_PAYLOAD_INVALID/,
    );
    await fail(
      () =>
        asUser(
          stranger,
          (tx) =>
            tx`insert into financial_references(org_id,kind,name,created_by,updated_by) values(${org},'payee','Escrita direta',${stranger},${stranger})`,
        ),
      /permission denied/,
    );
    assert.equal(
      (
        await asUser(
          stranger,
          (tx) => tx`select * from financial_payment_installments`,
        )
      ).length,
      0,
    );
  });
  await test("existing funding reference cannot silently change its technical classification", async () => {
    const r = (
      await db`select * from financial_revenues where org_id=${org} and description='Origem descritiva'`
    )[0];
    const updated = await asUser(user, (tx) =>
      call(tx, "financial_save", [
        org,
        "revenue",
        {
          id: r.id,
          funding_source_reference_id: r.funding_source_reference_id,
          funding_type: "recurso_livre",
        },
        r.version,
        crypto.randomUUID(),
        null,
      ]),
    );
    assert.equal(updated.funding_type, "lei_rouanet");
  });
  await test("changing an applicable total requires a versioned matching schedule; settled method is frozen", async () => {
    const p = await getPlan(),
      r = (await db`select * from financial_revenues where id=${source.id}`)[0];
    await fail(
      () =>
        asUser(user, (tx) =>
          call(tx, "financial_save", [
            org,
            "revenue",
            { id: r.id, confirmed_cents: 120000 },
            r.version,
            crypto.randomUUID(),
            null,
          ]),
        ),
      /FINANCIAL_PLAN_REQUIRES_REVISION/,
    );
    await fail(
      () =>
        asUser(user, (tx) =>
          call(tx, "financial_save", [
            org,
            "revenue",
            {
              id: r.id,
              payment_plan: {
                condition: p.condition,
                default_method: p.default_method,
                expected_version: p.version,
                installments: p.installments.map((i, n) => ({
                  ...i,
                  method: n === 0 ? "boleto" : i.method,
                })),
              },
            },
            r.version,
            crypto.randomUUID(),
            null,
          ]),
        ),
      /FINANCIAL_INSTALLMENT_SETTLED/,
    );
    assert.equal((await getPlan()).total_cents, 100000);
  });
  await test("expense transition updates commitment and schedule together without cash", async () => {
    const original = (
      await batch(
        [
          item({
            title: "Transição isolada",
            status: "prevista",
            planned_cents: 80000,
            payment_plan: plan(80000),
          }),
        ],
        crypto.randomUUID(),
        "expense",
      )
    ).items[0].record;
    const p = await asUser(user, (tx) =>
      call(tx, "financial_payment_plan", [
        org,
        edition,
        "despesa",
        original.id,
      ]),
    );
    assert.equal(p.obligation_id, null);
    const changed = await asUser(user, (tx) =>
      call(tx, "financial_transition_expense", [
        org,
        original.id,
        "realizada",
        original.version,
        {
          committed_cents: 90000,
          committed_on: "2028-01-15",
          payment_plan: {
            ...plan(90000),
            expected_version: p.version,
            installments: p.installments.map((i) => ({
              ...i,
              amount_cents: 30000,
            })),
          },
        },
        "Compromisso de teste",
        crypto.randomUUID(),
      ]),
    );
    const fresh = await asUser(user, (tx) =>
      call(tx, "financial_payment_plan", [
        org,
        edition,
        "despesa",
        original.id,
      ]),
    );
    assert.equal(changed.planned_cents, 80000);
    assert.equal(changed.committed_cents, 90000);
    assert.equal(fresh.total_cents, 90000);
    assert.ok(fresh.obligation_id);
    assert.equal(fresh.settled_cents, 0);
    assert.equal(fresh.version, 2);
  });
  await test("export and origin aggregates cover the full edition independently of page size", async () => {
    const page = await asUser(user, (tx) =>
      call(tx, "financial_list_revenues", [edition, 1, 0]),
    );
    const exported = await asUser(user, (tx) =>
      call(tx, "financial_export_entries", [org, edition, "receita"]),
    );
    assert.equal(page.items.length, 1);
    assert.equal(page.total, exported.length);
    assert.equal(
      page.by_source.reduce((s, i) => s + i.count, 0),
      exported.filter((i) => i.status !== "cancelada").length,
    );
    assert.equal(new Set(exported.map((i) => i.id)).size, exported.length);
    for (const e of exported)
      if (e.plan?.active)
        assert.equal(
          e.plan.installments.reduce((s, i) => s + i.amount_cents, 0),
          e.plan.total_cents,
        );
  });
  const fingerprint = async () => {
    const data =
      await db`select jsonb_build_object('revenues',(select jsonb_agg(to_jsonb(t) order by id) from financial_revenues t),'expenses',(select jsonb_agg(to_jsonb(t) order by id) from expenses t),'plans',(select jsonb_agg(to_jsonb(t) order by id) from financial_payment_plans t),'installments',(select jsonb_agg(to_jsonb(t) order by id) from financial_payment_installments t),'movements',(select jsonb_agg(to_jsonb(t) order by id) from financial_movements t),'audits',(select jsonb_agg(to_jsonb(t) order by id) from financial_audit_events t)) state`;
    return data[0].state;
  };
  await test("migration rerun leaves all records, versions, schedules and audit events unchanged", async () => {
    const before = await fingerprint();
    const ddl = await fs.readFile(
      "supabase/migrations/20261021210000_financial_entry_composer.sql",
      "utf8",
    );
    await db.begin((tx) => tx.unsafe(ddl));
    assert.deepEqual(await fingerprint(), before);
  });
  await test("transaction rollback rehearsal preserves all financial records", async () => {
    const before = await fingerprint();
    await fail(
      () =>
        db.begin(async (tx) => {
          await tx.unsafe(
            await fs.readFile(
              "supabase/migrations/20261021210000_financial_entry_composer.sql",
              "utf8",
            ),
          );
          throw Error("ROLLBACK_REHEARSAL");
        }),
      /ROLLBACK_REHEARSAL/,
    );
    assert.deepEqual(await fingerprint(), before);
  });

  console.log(
    JSON.stringify(
      {
        environment: "isolated PostgreSQL",
        passed: passed.length,
        tests: passed,
      },
      null,
      2,
    ),
  );
} finally {
  await db.end();
}
