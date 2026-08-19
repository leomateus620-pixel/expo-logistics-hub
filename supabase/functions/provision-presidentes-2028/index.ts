// Cadastro e reconciliação dos Presidentes de Comissão FENASOJA 2028.
// Fonte: planilha oficial "COMISSÃO CENTRAL_FENASOJA 2028 — dados".
// Protegido por GOOGLE_SYNC_WORKER_TOKEN (header X-Worker-Token).
// A senha inicial nunca é versionada: chega no corpo da requisição.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PRESIDENTES, type PresidenteRecord } from "./data.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};

const ORG_ID = "985888b8-155f-4bbe-b6b9-6bef2893d99b";
const CENTRAL = "d85594df-142b-46f1-a5af-598b7d504efd";
const SCOPED_CAPABILITIES = ["cronograma_eventos_access", "cronograma_scoped_access"];

const LOWER = new Set(["de", "da", "do", "das", "dos", "e"]);

function titleCase(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("pt-BR");
      if (index > 0 && LOWER.has(lower)) return lower;
      if (/^[a-zà-ÿ]\./i.test(word)) return word;
      return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
    })
    .join(" ");
}

function normalize(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function relationshipRole(record: PresidenteRecord): string {
  if (record.commission_id === CENTRAL) return "corresponsavel";
  if (record.cargo === "CO-RESPONSÁVEL") return "copresidente";
  return "principal";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expected = Deno.env.get("GOOGLE_SYNC_WORKER_TOKEN") ?? "";
  const provided = req.headers.get("X-Worker-Token") ?? "";
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { password?: string; dry_run?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const password = typeof body.password === "string" ? body.password : "";
  const dryRun = body.dry_run === true;
  if (!dryRun && password.length < 8) {
    return new Response(JSON.stringify({ error: "password obrigatória (min 8)" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const results: Record<string, unknown>[] = [];

  for (const record of PRESIDENTES) {
    const fullName = titleCase(record.nome);
    const entry: Record<string, unknown> = {
      nome: fullName,
      comissao_id: record.commission_id,
      acao: record.action,
    };

    if (dryRun) {
      results.push({ ...entry, dry_run: true });
      continue;
    }

    let userId = record.user_id;
    let loginEmail = record.current_email;

    try {
      if (record.action === "create") {
        const { data: created, error } = await admin.auth.admin.createUser({
          email: record.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (error) {
          const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const found = list?.users.find((u) => u.email?.toLowerCase() === record.email.toLowerCase());
          if (!found) {
            results.push({ ...entry, erro: error.message });
            continue;
          }
          userId = found.id;
        } else {
          userId = created.user.id;
        }
        loginEmail = record.email;
      } else if (record.action === "promote" && userId) {
        const { error } = await admin.auth.admin.updateUserById(userId, {
          email: record.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (error) {
          results.push({ ...entry, erro: `promocao: ${error.message}` });
          continue;
        }
        loginEmail = record.email;
      }
    } catch (err) {
      results.push({ ...entry, erro: String(err) });
      continue;
    }

    if (!userId) {
      results.push({ ...entry, erro: "usuario nao resolvido" });
      continue;
    }

    await admin.from("profiles").upsert({ user_id: userId, full_name: fullName }, { onConflict: "user_id" });
    await admin.from("user_roles").upsert({ user_id: userId, role: "user" }, { onConflict: "user_id,role" });

    // --- org_members -------------------------------------------------
    const { data: member } = await admin
      .from("org_members")
      .select("id, telefone, data_nascimento, cargo, role, nome_exibicao")
      .eq("org_id", ORG_ID)
      .eq("user_id", userId)
      .maybeSingle();

    const contact: Record<string, unknown> = {};
    if (record.telefone && !member?.telefone) contact.telefone = record.telefone;
    if (record.nascimento && !member?.data_nascimento) contact.data_nascimento = record.nascimento;

    if (member) {
      const patch: Record<string, unknown> = { ...contact };
      if (record.action !== "keep") {
        patch.nome_exibicao = fullName;
        patch.cargo = record.cargo;
        patch.commission_id = record.commission_id;
        patch.is_active = true;
      }
      if (Object.keys(patch).length > 0) {
        await admin.from("org_members").update(patch).eq("id", member.id);
      }
    } else {
      await admin.from("org_members").insert({
        org_id: ORG_ID,
        user_id: userId,
        role: "leitura",
        nome_exibicao: fullName,
        cargo: record.cargo,
        commission_id: record.commission_id,
        is_active: true,
        ...contact,
      });
    }

    // --- capabilities (somente contas novas/promovidas) ---------------
    if (record.action !== "keep") {
      for (const capability of SCOPED_CAPABILITIES) {
        await admin
          .from("user_capabilities")
          .upsert({ user_id: userId, org_id: ORG_ID, capability }, { onConflict: "user_id,org_id,capability" });
      }
    }

    // --- commission_responsibles --------------------------------------
    const { data: links } = await admin
      .from("commission_responsibles")
      .select("id, user_id, display_name, active")
      .eq("org_id", ORG_ID)
      .eq("commission_id", record.commission_id);

    const target = normalize(record.nome);
    const existing = (links ?? []).find(
      (row) => row.user_id === userId || normalize(row.display_name ?? "") === target,
    );

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (existing.user_id !== userId) patch.user_id = userId;
      if (!existing.active) patch.active = true;
      if (Object.keys(patch).length > 0) {
        await admin.from("commission_responsibles").update(patch).eq("id", existing.id);
      }
      entry.vinculo = "existente";
    } else {
      const { error } = await admin.from("commission_responsibles").insert({
        org_id: ORG_ID,
        commission_id: record.commission_id,
        user_id: userId,
        display_name: fullName,
        responsible_type: "pessoa",
        relationship_role: relationshipRole(record),
        is_primary: relationshipRole(record) === "principal",
        active: true,
        display_order: (links?.length ?? 0) + 1,
      });
      entry.vinculo = error ? `erro: ${error.message}` : "criado";
    }

    results.push({ ...entry, user_id: userId, login: loginEmail, ok: true });
  }

  return new Response(JSON.stringify({ total: results.length, results }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
