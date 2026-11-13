import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const socket = process.env.SOJA_STORE_TEST_PG_SOCKET;
const port = Number(process.env.SOJA_STORE_TEST_PG_PORT ?? 55442);
if (!socket?.startsWith("/") || !Number.isInteger(port)) throw new Error("Use a disposable PostgreSQL Unix socket.");

const connection = { host: socket, port, username: "postgres", onnotice: () => {} };
const admin = postgres({ ...connection, database: "postgres", max: 1 });
const database = `soja_team_test_${randomUUID().replaceAll("-", "")}`;
await admin`CREATE DATABASE ${admin(database)}`;
const sql = postgres({ ...connection, database, max: 4 });

const [org, commission, account, outsider, person, formerPerson, foreignPerson, location] = Array.from({ length: 8 }, () => randomUUID());
const migrations = [
  "20261112120000_soja_store_catalog.sql",
  "20261112120100_soja_store_directory.sql",
  "20261112120200_soja_store_purchases_stock.sql",
  "20261112120500_soja_store_access_rollout.sql",
  "20261112121100_soja_store_team.sql",
];
const as = (actor, query) => sql.begin(async (tx) => {
  await tx`SET LOCAL ROLE authenticated`;
  await tx`SELECT set_config('request.jwt.claim.sub', ${actor}, true)`;
  return query(tx);
});
const save = (payload, version = null, request = randomUUID(), actor = account) => as(actor, async (tx) => (
  await tx`SELECT public.soja_store_save_team_record(${org}, ${commission}, ${request}, ${version}, ${tx.json(payload)}) AS result`
)[0].result);
const list = (kind = "shift", actor = account) => as(actor, async (tx) => (
  await tx`SELECT public.soja_store_team(${org}, ${commission}, ${kind}) AS result`
)[0].result);
const expectedError = (code, message) => (error) => error.code === code && error.message === message;

try {
  await sql.unsafe(await readFile(new URL("./schema-fixture.sql", import.meta.url), "utf8"));
  await sql`INSERT INTO public.organizations (id) VALUES (${org})`;
  await sql`INSERT INTO public.commissions (id,org_id,slug) VALUES (${commission},${org},'soja-store')`;
  await sql`INSERT INTO auth.users (id) VALUES (${account}), (${outsider})`;
  await sql`INSERT INTO public.org_members (org_id,user_id,role) VALUES (${org},${account},'admin'),(${org},${outsider},'operador')`;
  await sql`INSERT INTO public.commission_people (id,org_id,display_name) VALUES
    (${person},${org},'Pessoa escalada'),(${formerPerson},${org},'Vínculo inativo'),(${foreignPerson},${org},'Outra frente')`;
  await sql`INSERT INTO public.commission_responsibles (commission_id,org_id,person_id,active) VALUES
    (${commission},${org},${person},true),(${commission},${org},${formerPerson},false)`;
  const migrationConnection = await sql.reserve();
  try {
    for (const name of migrations) {
      await migrationConnection.unsafe(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8"));
    }
  } finally {
    await migrationConnection.release();
  }
  await sql`UPDATE soja_store_private.scopes SET enabled=true WHERE org_id=${org} AND commission_id=${commission}`;
  await sql`INSERT INTO soja_store_private.locations (id,org_id,commission_id,name,kind,status,created_by,updated_by)
    VALUES (${location},${org},${commission},'Ponto de teste','point','active',${account},${account})`;

  const shift = { kind: "shift", person_id: person, title: "Atendimento", location_id: location,
    starts_local: "2026-11-12T09:00", ends_local: "2026-11-12T10:00", status: "active" };
  await assert.rejects(list("shift", outsider), expectedError("42501", "SOJA_STORE_FORBIDDEN"));
  await assert.rejects(save(shift, null, randomUUID(), outsider), expectedError("42501", "SOJA_STORE_FORBIDDEN"));
  await assert.rejects(save({ ...shift, person_id: foreignPerson }), expectedError("22023", "SOJA_STORE_TEAM_PERSON_UNAVAILABLE"));
  await assert.rejects(save({ ...shift, person_id: formerPerson }), expectedError("22023", "SOJA_STORE_TEAM_PERSON_UNAVAILABLE"));
  await assert.rejects(save({ ...shift, ends_local: shift.starts_local }), expectedError("22023", "SOJA_STORE_INVALID_TEAM_TIME"));
  const request = randomUUID();
  const record = await save(shift, null, request);
  assert.deepEqual(await save(shift, null, request), record);
  const retrieved = await list();
  assert.equal(retrieved.total, 1);
  assert.equal(retrieved.people.length, 1);
  assert.equal(new Date(retrieved.items[0].starts_at).toISOString(), "2026-11-12T12:00:00.000Z");
  assert.equal(retrieved.items[0].location_id, location);

  const results = await Promise.allSettled([
    save({ ...shift, starts_local: "2026-11-12T10:00", ends_local: "2026-11-12T11:00" }),
    save({ ...shift, starts_local: "2026-11-12T10:15", ends_local: "2026-11-12T11:30" }),
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.ok(results.some((item) => item.status === "rejected" && item.reason.message === "SOJA_STORE_TEAM_SHIFT_OVERLAP"));
  await assert.rejects(save({ ...shift, id: record.id, status: "cancelled" }, 2), expectedError("PT409", "SOJA_STORE_STALE_VERSION"));
  assert.equal((await save({ ...shift, id: record.id, status: "cancelled" }, 1)).status, "cancelled");
  assert.equal((await list()).total, 2);

  await save({ kind: "training", person_id: person, title: "Cuidados com produtos", completed_on: "2026-11-10", status: "active" });
  const training = await list("training");
  assert.equal(training.total, 1);
  assert.equal(training.items[0].completed_on, "2026-11-10");
  console.log("Soja Store team: access, identity, timezone, idempotency, overlap, history and training passed.");
} finally {
  await sql.end();
  await admin`DROP DATABASE ${admin(database)}`;
  await admin.end();
}
