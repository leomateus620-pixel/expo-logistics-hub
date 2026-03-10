import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // User client for auth validation
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

    // Admin client for cross-table operations
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { action, payload } = await req.json();

    if (action === "create") {
      return await handleCreate(admin, user.id, payload);
    } else if (action === "update") {
      return await handleUpdate(admin, user.id, payload);
    } else if (action === "delete") {
      return await handleDelete(admin, user.id, payload);
    } else {
      return new Response(JSON.stringify({ error: "Ação inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
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

// ── CREATE ──────────────────────────────────────────────────
async function handleCreate(admin: any, userId: string, payload: any) {
  const { transport, guestIds } = payload;

  // Insert transport
  const { data, error } = await admin
    .from("transports")
    .insert(transport)
    .select()
    .single();
  if (error) return err(error.message);

  // Audit
  await admin.from("audit_log").insert({
    org_id: transport.org_id,
    actor_user_id: userId,
    entity: "transports",
    entity_id: data.id,
    action: "create",
    after_data: data,
  });

  // Set guests via junction
  if (guestIds?.length) {
    await admin.rpc("set_transport_guests", {
      _transport_id: data.id,
      _org_id: transport.org_id,
      _guest_ids: guestIds,
    });
  }

  // Auto-create event + schedule + shift
  try {
    await createEventAndShift(admin, userId, transport, data.id);
  } catch { /* silent */ }

  return ok({ data });
}

// ── UPDATE ──────────────────────────────────────────────────
async function handleUpdate(admin: any, userId: string, payload: any) {
  const { id, orgId, updates, expectedUpdatedAt, guestIds, vehicleUsage } = payload;

  // Fetch current record
  const { data: before } = await admin
    .from("transports")
    .select("*")
    .eq("id", id)
    .single();

  // Optimistic locking check
  if (expectedUpdatedAt && before?.updated_at !== expectedUpdatedAt) {
    return err("Registro modificado por outro usuário. Recarregue os dados.", 409);
  }

  // Perform update
  const { data, error } = await admin
    .from("transports")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return err(error.message);

  // Audit
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

  // Set guests
  if (guestIds !== undefined) {
    try {
      await admin.rpc("set_transport_guests", {
        _transport_id: id,
        _org_id: orgId,
        _guest_ids: guestIds || [],
      });
    } catch { /* silent */ }
  }

  // Handle cancel → cleanup events
  if (updates.status === "cancelado" && before?.status !== "cancelado") {
    try {
      await cleanupTransportEvents(admin, orgId, id, "cancel");
    } catch { /* silent */ }
  }

  // Handle completion → create vehicle_usage + update vehicle km
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
    } catch { /* silent */ }
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

  // Cleanup linked events
  try {
    await cleanupTransportEvents(admin, orgId, id, "delete");
  } catch { /* silent */ }

  const { error } = await admin.from("transports").delete().eq("id", id);
  if (error) return err(error.message);

  // Audit
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
async function createEventAndShift(admin: any, userId: string, transport: any, transportId: string) {
  const orgId = transport.org_id;
  const inicioEm = transport.inicio_em;

  let fimEm = transport.fim_em;
  if (!fimEm && inicioEm) {
    try {
      const start = new Date(inicioEm);
      if (!isNaN(start.getTime())) {
        const mins = Number(transport.duracao_estimada_min || 60);
        fimEm = new Date(start.getTime() + mins * 60_000).toISOString();
      }
    } catch { fimEm = inicioEm; }
  }
  if (!fimEm) fimEm = inicioEm;

  // Create event
  const eventPayload = {
    org_id: orgId,
    created_by_user_id: userId,
    titulo: `Transporte: ${transport.titulo || ""} ${transport.origem} → ${transport.destino}`.trim(),
    inicio_em: inicioEm,
    fim_em: fimEm,
    tipo_tag: "transporte",
    local: `${transport.origem} → ${transport.destino}`,
    descricao: `Transporte #${transportId.slice(0, 8)}`,
    responsavel_user_id: transport.motorista_user_id || null,
  };
  const { data: event } = await admin.from("events").insert(eventPayload).select().single();

  // Create shift if driver assigned
  if (transport.motorista_user_id && event) {
    const transportDate = inicioEm?.slice(0, 10);
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
          titulo: eventPayload.titulo,
          inicio_em: inicioEm,
          fim_em: fimEm,
          local: eventPayload.local,
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
}

async function cleanupTransportEvents(admin: any, orgId: string, transportId: string, mode: "delete" | "cancel") {
  const tag = `Transporte #${transportId.slice(0, 8)}`;
  const { data: linkedEvents } = await admin
    .from("events")
    .select("id, titulo")
    .eq("org_id", orgId)
    .like("descricao", `%${tag}%`);

  if (linkedEvents?.length) {
    for (const ev of linkedEvents) {
      if (mode === "delete") {
        await admin.from("events").delete().eq("id", ev.id);
      } else {
        await admin
          .from("events")
          .update({ titulo: "[CANCELADO] " + (ev.titulo || "") })
          .eq("id", ev.id);
      }
    }
  }
}
