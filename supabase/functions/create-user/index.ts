import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canCreateAccount, canUpdateAccount, isOrgRole, type Membership } from "./authorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Fenasoja-Account-Policy": "org-scoped-v1",
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

const forbidden = () => response({ error: "Sem permissão para administrar esta conta ou organização." }, 403);
const failed = () => response({ error: "Não foi possível concluir a administração da conta." }, 500);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Método inválido." }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return response({ error: "Não autorizado." }, 401);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) return response({ error: "Não autorizado." }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return response({ error: "Dados inválidos." }, 400);
    const orgId = body.org_id == null ? null : body.org_id;
    if (orgId !== null && (typeof orgId !== "string" || !uuid.test(orgId))) {
      return response({ error: "Organização inválida." }, 400);
    }
    const role: unknown = body.role ?? "operador";
    if (!isOrgRole(role)) return response({ error: "Papel inválido." }, 400);
    const action = body.action ?? "create";
    if (action !== "create" && action !== "update_identity" && action !== "update_email" && action !== "update_password") {
      return response({ error: "Ação inválida." }, 400);
    }

    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [membership, globalRole] = await Promise.all([
      orgId ? service.from("org_members").select("org_id,role,is_active")
        .eq("user_id", caller.id).eq("org_id", orgId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      service.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle(),
    ]);
    if (membership.error || globalRole.error) return failed();
    const actor = membership.data as Membership | null;
    const callerIsGlobalAdmin = !!globalRole.data;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
    const cargo = typeof body.cargo === "string" ? body.cargo.trim() || null : null;
    if (fullName.length > 160 || (cargo?.length ?? 0) > 160 || email.length > 254) {
      return response({ error: "Dados fora do tamanho permitido." }, 400);
    }

    if (action !== "create") {
      const targetId = body.target_user_id;
      if (!orgId || typeof targetId !== "string" || !uuid.test(targetId)) {
        return response({ error: "Informe a organização e a conta a ser administrada." }, 400);
      }
      if (!actor?.is_active || (actor.role !== "admin" && actor.role !== "gestor")) return forbidden();
      const [targetMemberships, targetGlobal] = await Promise.all([
        service.from("org_members").select("org_id,role,is_active").eq("user_id", targetId),
        service.from("user_roles").select("role").eq("user_id", targetId).eq("role", "admin").maybeSingle(),
      ]);
      if (targetMemberships.error || targetGlobal.error) return failed();
      if (!canUpdateAccount(actor, callerIsGlobalAdmin, targetMemberships.data as Membership[], !!targetGlobal.data, orgId, action)) {
        return forbidden();
      }
      if ((action === "update_identity" && !fullName) || (action === "update_email" && !email)
        || (action === "update_password" && !password)) {
        return response({ error: "Preencha os dados da alteração." }, 400);
      }

      const attributes = action === "update_identity" ? { user_metadata: { full_name: fullName, name: fullName } }
        : action === "update_email" ? { email, email_confirm: true }
        : { password };
      const { error } = await service.auth.admin.updateUserById(targetId, attributes);
      if (error) return response({ error: "O serviço de contas recusou a alteração." }, 400);
      if (action === "update_identity") {
        const { error: profileError } = await service.from("profiles").update({ full_name: fullName }).eq("user_id", targetId);
        if (profileError) return failed();
      }
      return response({ ok: true });
    }

    if (!canCreateAccount(actor, callerIsGlobalAdmin, orgId, role)) return forbidden();
    if (!email || !password) return response({ error: "E-mail e senha são obrigatórios." }, 400);
    const { data, error } = await service.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (error) return response({ error: "O serviço de contas recusou a criação." }, 400);
    const userId = data.user.id;
    const { error: roleError } = await service.from("user_roles").upsert(
      { user_id: userId, role: "user" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
    if (roleError) {
      await service.auth.admin.deleteUser(userId);
      return failed();
    }
    if (orgId) {
      const { error: memberError } = await service.from("org_members").insert({
        org_id: orgId, user_id: userId, role, nome_exibicao: fullName || email, cargo,
      });
      if (memberError) {
        await service.auth.admin.deleteUser(userId);
        return failed();
      }
    }
    return response({ user: { id: userId } });
  } catch {
    return failed();
  }
});
