import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ACTION_MIN_ROLES: Record<string, string[]> = {
  create: ["admin", "gestor", "operador"],
  update: ["admin", "gestor", "operador"],
  start: ["admin", "gestor", "operador"],
  delete: ["admin", "gestor", "operador"],
  arrive_destination: ["admin", "gestor", "operador"],
  start_return: ["admin", "gestor", "operador"],
  complete_return: ["admin", "gestor", "operador"],
};

// ── Fenasoja return-trip window: 29/04/2026 → 10/05/2026 (SP) ──
const RETURN_WINDOW_START = new Date("2026-04-29T03:00:00.000Z"); // 00:00 SP = 03:00 UTC
const RETURN_WINDOW_END = new Date("2026-05-11T02:59:59.999Z");   // end of 10/05 SP

function isInReturnWindow(inicioEm: string | null | undefined): boolean {
  if (!inicioEm) return false;
  const d = new Date(inicioEm);
  if (isNaN(d.getTime())) return false;
  return d >= RETURN_WINDOW_START && d <= RETURN_WINDOW_END;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { action, payload } = await req.json();

    const allowedRoles = ACTION_MIN_ROLES[action];
    if (!allowedRoles) {
      return err("Ação inválida", 400);
    }

    const orgId = action === "create" ? payload?.transport?.org_id : payload?.orgId;
    if (orgId) {
      const { data: roleData } = await admin.rpc("get_user_org_role", {
        _user_id: user.id,
        _org_id: orgId,
      });
      if (!roleData || !allowedRoles.includes(roleData)) {
        return err("Sem permissão para esta operação", 403);
      }
    }

    if (action === "create") return await handleCreate(admin, user.id, payload);
    if (action === "update") return await handleUpdate(admin, user.id, payload);
    if (action === "start") return await handleStart(admin, user.id, payload);
    if (action === "delete") return await handleDelete(admin, user.id, payload);
    if (action === "arrive_destination") return await handleArriveDestination(admin, user.id, payload);
    if (action === "start_return") return await handleStartReturn(admin, user.id, payload);
    if (action === "complete_return") return await handleCompleteReturn(admin, user.id, payload);
    return err("Ação inválida", 400);
  } catch (err_) {
    return new Response(JSON.stringify({ error: (err_ as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Timezone helper ────────────────────────────────────────
function toSPDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return iso?.slice(0, 10) || '';
  }
}

// ── START ───────────────────────────────────────────────────
async function handleStart(admin: any, userId: string, payload: any) {
  const { id, orgId } = payload;

  const { data: transport, error: fetchErr } = await admin
    .from("transports")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !transport) return err("Transporte não encontrado", 404);

  if (transport.status !== "pendente") {
    return err(`Não é possível iniciar uma viagem com status "${transport.status}"`, 400);
  }

  if (!transport.motorista_user_id) {
    return err("Motorista não vinculado ao transporte", 400);
  }

  // Fetch all linked guests
  const { data: tgLinks } = await admin
    .from("transport_guests")
    .select("guest_id")
    .eq("transport_id", id);

  let allGuests: any[] = [];
  if (tgLinks && tgLinks.length > 0) {
    const guestIds = tgLinks.map((l: any) => l.guest_id);
    const { data: guestsData } = await admin
      .from("guests")
      .select("id, nome, telefone")
      .in("id", guestIds);
    allGuests = guestsData || [];
  }

  // Clear any stale live-location row from a previous start (different driver, retry, etc.)
  // so the current driver's GPS upserts can succeed without RLS UPDATE conflicts.
  await admin.from("transport_locations").delete().eq("transport_id", id);

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await admin
    .from("transports")
    .update({ status: "em_andamento", inicio_real_em: now, fase_atual: "ida" })
    .eq("id", id)
    .select()
    .single();
  if (updateErr) return err(updateErr.message);

  await admin.from("audit_log").insert({
    org_id: orgId,
    actor_user_id: userId,
    entity: "transports",
    entity_id: id,
    action: "status_change",
    before_data: { status: transport.status },
    after_data: { status: "em_andamento", inicio_real_em: now },
  });

  const { data: driverMember } = await admin
    .from("org_members")
    .select("nome_exibicao")
    .eq("user_id", transport.motorista_user_id)
    .eq("org_id", orgId)
    .single();
  const driverName = driverMember?.nome_exibicao || "Motorista";

  let destinoLabel = transport.destino || "";
  if (transport.titulo === "Aeroporto") {
    destinoLabel = `Aeroporto${transport.voo_cidade ? ` de ${transport.voo_cidade}` : ""}`;
  }

  // Fetch vehicle info for inclusion in WhatsApp message
  let vehicleInfo = "";
  if (transport.vehicle_id) {
    const { data: vehicleData } = await admin
      .from("vehicles")
      .select("modelo, cor, placa")
      .eq("id", transport.vehicle_id)
      .single();
    if (vehicleData) {
      const model = (vehicleData.modelo || "").trim();
      const color = (vehicleData.cor || "").trim();
      const plate = (vehicleData.placa || "").trim();
      const descriptor = [model, color].filter(Boolean).join(" ").trim();
      if (descriptor && plate) vehicleInfo = ` O veículo é um ${descriptor}, placa ${plate}.`;
      else if (descriptor) vehicleInfo = ` O veículo é um ${descriptor}.`;
      else if (plate) vehicleInfo = ` Placa do veículo: ${plate}.`;
    }
  }

  const whatsappGuests: any[] = [];
  for (const guest of allGuests) {
    const message = guest.nome
      ? `Olá, ${guest.nome}. Aqui é ${driverName}, motorista responsável pelo seu transporte da Fenasoja Logística. Estou iniciando agora o deslocamento para o ${destinoLabel}.${vehicleInfo} Qualquer necessidade, fico à disposição por aqui.`
      : `Transporte iniciado para ${destinoLabel}. Motorista: ${driverName}.${vehicleInfo}`;

    let normalizedPhone = "";
    let phoneValid = false;
    if (guest.telefone) {
      const digits = guest.telefone.replace(/\D/g, "");
      normalizedPhone = digits.length >= 12 ? digits : `55${digits}`;
      phoneValid = normalizedPhone.length >= 12 && normalizedPhone.length <= 15;
    }

    const whatsappUrl = phoneValid
      ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
      : "";

    whatsappGuests.push({
      phone: normalizedPhone,
      message,
      url: whatsappUrl,
      guestName: guest.nome || "",
      phoneValid,
    });
  }

  if (whatsappGuests.length === 0) {
    whatsappGuests.push({
      phone: "",
      message: `Transporte iniciado para ${destinoLabel}. Motorista: ${driverName}.${vehicleInfo}`,
      url: "",
      guestName: "",
      phoneValid: false,
    });
  }

  const firstGuest = whatsappGuests[0];

  return ok({
    data: updated,
    whatsapp: { ...firstGuest, driverName, startedAt: now },
    whatsappGuests,
    driverName,
    startedAt: now,
  });
}

// ── ARRIVE DESTINATION ──────────────────────────────────────
async function handleArriveDestination(admin: any, userId: string, payload: any) {
  const { id, orgId } = payload;

  const { data: transport, error: fetchErr } = await admin
    .from("transports")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !transport) return err("Transporte não encontrado", 404);

  if (!isInReturnWindow(transport.inicio_em)) {
    return err("Fluxo de retorno disponível apenas para viagens entre 29/04 e 10/05/2026", 400);
  }

  if (transport.status !== "em_andamento") {
    return err(`Status inválido: aguardando "em_andamento", está "${transport.status}"`, 400);
  }

  // Get last GPS position (snapshot before transport_locations row may be deleted later)
  const { data: lastLoc } = await admin
    .from("transport_locations")
    .select("latitude, longitude")
    .eq("transport_id", id)
    .maybeSingle();

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status: "chegou_destino",
    chegada_destino_em: now,
    fase_atual: "ida",
  };
  if (lastLoc?.latitude && lastLoc?.longitude) {
    updates.destino_lat_chegada = lastLoc.latitude;
    updates.destino_lng_chegada = lastLoc.longitude;
  }

  const { data: updated, error: updateErr } = await admin
    .from("transports")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (updateErr) return err(updateErr.message);

  await admin.from("audit_log").insert({
    org_id: orgId,
    actor_user_id: userId,
    entity: "transports",
    entity_id: id,
    action: "arrive_destination",
    before_data: { status: transport.status },
    after_data: updates,
  });

  return ok({ data: updated });
}

// ── START RETURN ────────────────────────────────────────────
async function handleStartReturn(admin: any, userId: string, payload: any) {
  const { id, orgId } = payload;

  const { data: transport, error: fetchErr } = await admin
    .from("transports")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !transport) return err("Transporte não encontrado", 404);

  if (!isInReturnWindow(transport.inicio_em)) {
    return err("Fluxo de retorno disponível apenas para viagens entre 29/04 e 10/05/2026", 400);
  }

  if (transport.somente_ida) {
    return err("Este transporte foi marcado como Somente Ida", 400);
  }

  if (transport.status !== "chegou_destino") {
    return err("Registre a chegada no destino primeiro", 400);
  }

  // Clear any stale live-location row before the return phase begins,
  // so the current driver can write fresh GPS without RLS conflicts.
  await admin.from("transport_locations").delete().eq("transport_id", id);

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status: "em_retorno",
    inicio_retorno_em: now,
    fase_atual: "volta",
  };

  const { data: updated, error: updateErr } = await admin
    .from("transports")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (updateErr) return err(updateErr.message);

  await admin.from("audit_log").insert({
    org_id: orgId,
    actor_user_id: userId,
    entity: "transports",
    entity_id: id,
    action: "start_return",
    before_data: { status: transport.status },
    after_data: updates,
  });

  return ok({ data: updated });
}

// ── COMPLETE RETURN ─────────────────────────────────────────
async function handleCompleteReturn(admin: any, userId: string, payload: any) {
  const { id, orgId, vehicleUsage } = payload;

  const { data: before } = await admin
    .from("transports")
    .select("*")
    .eq("id", id)
    .single();
  if (!before) return err("Transporte não encontrado", 404);

  if (!isInReturnWindow(before.inicio_em)) {
    return err("Fluxo de retorno disponível apenas para viagens entre 29/04 e 10/05/2026", 400);
  }

  if (before.status !== "em_retorno") {
    return err(`Status inválido: aguardando "em_retorno", está "${before.status}"`, 400);
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status: "concluido",
    fim_retorno_em: now,
    fim_real_em: now,
  };
  if (vehicleUsage?.km_chegada != null) {
    updates.km_devolucao = vehicleUsage.km_chegada;
  }
  if (vehicleUsage?.fim_em) updates.fim_em = vehicleUsage.fim_em;

  const { data: updated, error: updateErr } = await admin
    .from("transports")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (updateErr) return err(updateErr.message);

  await admin.from("audit_log").insert({
    org_id: orgId,
    actor_user_id: userId,
    entity: "transports",
    entity_id: id,
    action: "complete_return",
    before_data: { status: before.status },
    after_data: updates,
  });

  // Register vehicle_usage if KM was provided
  if (vehicleUsage && vehicleUsage.vehicle_id && vehicleUsage.km_saida != null && vehicleUsage.km_chegada != null) {
    try {
      await admin.from("vehicle_usage").insert({
        org_id: orgId,
        vehicle_id: vehicleUsage.vehicle_id,
        responsavel_user_id: vehicleUsage.responsavel_user_id,
        km_saida: vehicleUsage.km_saida,
        km_chegada: vehicleUsage.km_chegada,
        devolucao_em: vehicleUsage.devolucao_em || now,
      });
      await admin
        .from("vehicles")
        .update({ km_atual: vehicleUsage.km_chegada })
        .eq("id", vehicleUsage.vehicle_id);
    } catch (e) {
      console.error("[transport-lifecycle] Failed to create vehicle_usage on complete_return:", e);
    }
  }

  return ok({ data: updated });
}

// ── CREATE ──────────────────────────────────────────────────
async function handleCreate(admin: any, userId: string, payload: any) {
  const { transport, guestIds } = payload;

  const { data, error } = await admin
    .from("transports")
    .insert(transport)
    .select()
    .single();
  if (error) return err(error.message);

  await admin.from("audit_log").insert({
    org_id: transport.org_id,
    actor_user_id: userId,
    entity: "transports",
    entity_id: data.id,
    action: "create",
    after_data: data,
  });

  if (guestIds?.length) {
    await admin.rpc("set_transport_guests", {
      _transport_id: data.id,
      _org_id: transport.org_id,
      _guest_ids: guestIds,
    });
  }

  try {
    await createShiftForTransport(admin, userId, transport, data.id);
  } catch (e) {
    console.error("[transport-lifecycle] Failed to create shift:", e);
  }

  return ok({ data });
}

// ── UPDATE ──────────────────────────────────────────────────
async function handleUpdate(admin: any, userId: string, payload: any) {
  const { id, orgId, updates, expectedUpdatedAt, guestIds, vehicleUsage } = payload;

  const { data: before } = await admin
    .from("transports")
    .select("*")
    .eq("id", id)
    .single();

  if (expectedUpdatedAt && before?.updated_at !== expectedUpdatedAt) {
    return err("Registro modificado por outro usuário. Recarregue os dados.", 409);
  }

  const { data, error } = await admin
    .from("transports")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return err(error.message);

  const action = updates.status && updates.status !== before?.status ? "status_change" : "update";
  await admin.from("audit_log").insert({
    org_id: orgId,
    actor_user_id: userId,
    entity: "transports",
    entity_id: id,
    action,
    before_data: before,
    after_data: data,
  });

  if (guestIds !== undefined) {
    try {
      await admin.rpc("set_transport_guests", {
        _transport_id: id,
        _org_id: orgId,
        _guest_ids: guestIds || [],
      });
    } catch (e) {
      console.error("[transport-lifecycle] Failed to set guests:", e);
    }
  }

  if (updates.status === "concluido" && before?.status !== "concluido" && vehicleUsage) {
    try {
      await admin.from("vehicle_usage").insert({
        org_id: orgId,
        vehicle_id: vehicleUsage.vehicle_id,
        responsavel_user_id: vehicleUsage.responsavel_user_id,
        km_saida: vehicleUsage.km_saida,
        km_chegada: vehicleUsage.km_chegada,
        km_rodados: vehicleUsage.km_rodados,
        devolucao_em: vehicleUsage.devolucao_em,
      });
      await admin
        .from("vehicles")
        .update({ km_atual: vehicleUsage.km_chegada })
        .eq("id", vehicleUsage.vehicle_id);
    } catch (e) {
      console.error("[transport-lifecycle] Failed to create vehicle_usage:", e);
      return err("Erro ao registrar uso do veículo: " + (e as Error).message);
    }
  }

  return ok({ data });
}

// ── DELETE ──────────────────────────────────────────────────
async function handleDelete(admin: any, userId: string, payload: any) {
  const { id, orgId } = payload;

  const { data: before } = await admin
    .from("transports")
    .select("*")
    .eq("id", id)
    .single();

  await admin.from("transport_guests").delete().eq("transport_id", id);
  await admin.from("transport_locations").delete().eq("transport_id", id);

  const { error } = await admin.from("transports").delete().eq("id", id);
  if (error) return err(error.message);

  await admin.from("audit_log").insert({
    org_id: orgId,
    actor_user_id: userId,
    entity: "transports",
    entity_id: id,
    action: "delete",
    before_data: before,
  });

  return ok({ success: true });
}

// ── HELPERS ─────────────────────────────────────────────────
async function createShiftForTransport(admin: any, userId: string, transport: any, transportId: string) {
  const orgId = transport.org_id;
  const inicioEm = transport.inicio_em;
  if (!inicioEm || !transport.motorista_user_id) return;

  let fimEm = transport.fim_em;
  if (!fimEm) {
    try {
      const start = new Date(inicioEm);
      if (!isNaN(start.getTime())) {
        const mins = Number(transport.duracao_estimada_min || 60);
        fimEm = new Date(start.getTime() + mins * 60_000).toISOString();
      }
    } catch { fimEm = inicioEm; }
  }
  if (!fimEm) fimEm = inicioEm;

  const transportDate = toSPDate(inicioEm);

  const titulo = `Transporte: ${transport.titulo || ""} ${transport.origem} → ${transport.destino}`.trim();
  const local = `${transport.origem} → ${transport.destino}`;

  const { data: existingSchedules } = await admin
    .from("schedules")
    .select("id")
    .eq("org_id", orgId)
    .eq("status", "ativa")
    .lte("data_inicio", transportDate)
    .gte("data_fim", transportDate)
    .limit(1);

  let scheduleId = existingSchedules?.[0]?.id;
  if (!scheduleId) {
    const { data: newSchedule } = await admin
      .from("schedules")
      .insert({
        org_id: orgId,
        created_by_user_id: userId,
        nome: "Escala Automática",
        data_inicio: transportDate,
        data_fim: transportDate,
        status: "ativa",
      })
      .select()
      .single();
    scheduleId = newSchedule?.id;
  }

  if (scheduleId) {
    const { data: shift } = await admin
      .from("schedule_shifts")
      .insert({
        org_id: orgId,
        schedule_id: scheduleId,
        titulo,
        inicio_em: inicioEm,
        fim_em: fimEm,
        local,
      })
      .select()
      .single();

    if (shift) {
      await admin.from("shift_assignments").insert({
        org_id: orgId,
        schedule_shift_id: shift.id,
        member_user_id: transport.motorista_user_id,
        created_by_user_id: userId,
        funcao: "Motorista",
        status: "confirmado",
      });
    }
  }
}
