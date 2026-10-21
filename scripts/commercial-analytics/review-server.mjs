// Read-only HTTP adapter over the disposable QA database. Fixed allowlist; loopback only.
import http from "node:http";
import postgres from "postgres";
import { ACTOR, PROJECT, ORG } from "./seed.mjs";
const db = postgres({
  host: "127.0.0.1",
  port: 55438,
  user: "postgres",
  password: "local-financial-tests",
  database: "commercial_analytics_test",
  max: 4,
});
const allowed = {
  list_commercial_sale_orders: [
    "p_project_id",
    "p_search",
    "p_status",
    "p_has_document",
    "p_payment_method",
    "p_from",
    "p_to",
    "p_limit",
    "p_offset",
  ],
  get_commercial_sale_order_detail: ["p_order_id", "p_sale_id"],
  commercial_sales_analytics_summary: ["p_project_id", "p_reference_date"],
  commercial_sales_cashflow_month: [
    "p_project_id",
    "p_month",
    "p_generation",
    "p_limit",
    "p_offset",
  ],
  commercial_sales_signature_details: [
    "p_project_id",
    "p_generation",
    "p_limit",
    "p_offset",
  ],
};
const server = http.createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  try {
    if (req.url === "/inventory") {
      const lots =
        await db`SELECT l.id,l.entity_id,l.public_identifier,l.status,l.official_area_sqm,s.id AS sale_id,s.negotiated_value,s.status AS sale_status FROM commercial_lots l LEFT JOIN lot_sales s ON s.lot_id=l.id WHERE l.project_id=${PROJECT}`;
      const [{ revision }] =
        await db`SELECT commercial_map_revision(${PROJECT}) revision`;
      res.end(
        JSON.stringify({ lots, projectId: PROJECT, orgId: ORG, revision }),
      );
      return;
    }
    if (req.method !== "POST" || req.url !== "/rpc") throw Error("Not allowed");
    let text = "";
    for await (const chunk of req) {
      text += chunk;
      if (text.length > 10000) throw Error("Too large");
    }
    const { name, args } = JSON.parse(text);
    if (!allowed[name]) throw Error("RPC not allowed");
    const data = await db.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE authenticated");
      await tx`SELECT set_config('request.jwt.claim.sub',${ACTOR},true)`;
      const params = allowed[name].filter((k) => args[k] !== undefined);
      const sql = `SELECT public.${name}(${params.map((k, i) => `${k} => $${i + 1}`).join(",")}) AS value`;
      return (
        await tx.unsafe(
          sql,
          params.map((k) => args[k]),
        )
      )[0].value;
    });
    res.end(JSON.stringify({ data, error: null }));
  } catch (error) {
    res.end(
      JSON.stringify({
        data: null,
        error: { message: error.message, code: error.code },
      }),
    );
  }
});
server.listen(55440, "127.0.0.1", () =>
  console.log("Commercial SQL review adapter on 127.0.0.1:55440"),
);
