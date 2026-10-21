/** Loopback-only bridge to the disposable PostgreSQL used by database-qa.mjs.
 * No Supabase token, remote database or production data is accepted here. */
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const postgres = require(
  process.env.FINANCIAL_TEST_POSTGRES_MODULE ||
    "/tmp/financial-postgres/node_modules/postgres",
);
const database =
  process.env.FINANCIAL_TEST_DATABASE || "financial_composer_test";
if (!/^financial_composer_(test|acceptance)$/.test(database))
  throw Error("Only named disposable local financial databases are allowed");
const sql = postgres({
  host: "127.0.0.1",
  port: 55438,
  user: "postgres",
  password: "local-financial-tests",
  database,
  max: 8,
  onnotice: () => {},
});
const org = "985888b8-155f-4bbe-b6b9-6bef2893d99b";
const approved = "b664fc22-69d3-40f1-8370-16b8a07ec402",
  reader = "f9ed4ab9-0ef3-4ee4-9707-36288dbc828f";
const outsider = (
  await sql`select user_id from org_members where org_id=${org} and user_id not in (select user_id from financial_access_roster where org_id=${org}) limit 1`
)[0]?.user_id;
const actors = [
  { id: approved, label: "Conta de teste · administração financeira" },
  { id: reader, label: "Conta de teste · consulta" },
  { id: outsider, label: "Conta de teste · admin sem acesso financeiro" },
].filter((a) => a.id);
const tables = new Set([
  "financial_editions",
  "financial_revenues",
  "financial_budgets",
  "financial_budget_lines",
  "financial_sponsorships",
]);
const signatures =
  await sql`select p.proname,p.proargnames,ARRAY(select format_type(t,null) from unnest(p.proargtypes) t) types from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'financial_%' and has_function_privilege('authenticated',p.oid,'EXECUTE')`;
const functions = new Map(signatures.map((row) => [row.proname, row]));
const server = http.createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  try {
    if (req.url === "/scope" && req.method === "GET") {
      res.end(JSON.stringify({ org, actors }));
      return;
    }
    if (req.method !== "POST" || !["/rpc", "/read"].includes(req.url))
      throw Error("Route not available");
    if (
      req.headers.origin &&
      !/^http:\/\/127\.0\.0\.1:808[78]$/.test(req.headers.origin)
    )
      throw Error("Origin denied");
    const actor = req.headers["x-financial-test-actor"];
    if (!actors.some((a) => a.id === actor))
      throw Error("Test identity denied");
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 1000000) throw Error("Request too large");
    }
    const input = JSON.parse(body);
    const data = await sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE authenticated");
      await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
      if (req.url === "/rpc") {
        const fn = functions.get(input.name);
        if (!fn) throw Error("RPC not authorized");
        const args = Object.entries(input.args);
        if (args.some(([key]) => !fn.proargnames.includes(key)))
          throw Error("Unexpected argument");
        const argsSql = args
          .map(
            ([key], i) =>
              `${key} => $${i + 1}::${fn.types[fn.proargnames.indexOf(key)]}`,
          )
          .join(",");
        const result = await tx.unsafe(
          `select public.${fn.proname}(${argsSql}) result`,
          args.map(([, value]) => value),
        );
        return result[0].result;
      }
      if (!tables.has(input.table)) throw Error("Table not available");
      const columns = (
        await tx`select column_name from information_schema.columns where table_schema='public' and table_name=${input.table}`
      ).map((r) => r.column_name);
      const filters = input.filters || [];
      if (
        filters.some(([key]) => !columns.includes(key)) ||
        (input.order && !columns.includes(input.order))
      )
        throw Error("Unexpected column");
      const where = filters.length
        ? " where " +
          filters.map(([key], i) => `"${key}"=$${i + 1}`).join(" and ")
        : "";
      return tx.unsafe(
        `select * from public.${input.table}${where}${input.order ? ` order by "${input.order}"` : ""} limit ${Math.min(Math.max(Number(input.limit) || 500, 1), 1000)}`,
        filters.map(([, value]) => value),
      );
    });
    res.end(JSON.stringify({ data, error: null }));
  } catch (e) {
    console.error("Isolated SQL request failed:", e.message, e.detail || "");
    res.end(
      JSON.stringify({
        data: null,
        error: {
          code: e.code || "LOCAL_REVIEW_ERROR",
          message: e.message,
          details: e.detail || "",
        },
      }),
    );
  }
});
server.listen(55439, "127.0.0.1", () =>
  console.log("Financial isolated SQL bridge: http://127.0.0.1:55439"),
);
