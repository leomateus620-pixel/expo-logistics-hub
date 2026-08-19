import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_events",
  title: "Listar eventos do cronograma",
  description:
    "Lista eventos da Agenda Fenasoja (cronograma) visíveis para o usuário, com filtros de período, status e busca por título.",
  inputSchema: {
    from_date: z.string().optional().describe("Data inicial (YYYY-MM-DD)."),
    to_date: z.string().optional().describe("Data final (YYYY-MM-DD)."),
    status: z.string().optional().describe("Status do evento, ex.: planejado, concluido, cancelado."),
    search: z.string().optional().describe("Texto buscado no título do evento."),
    limit: z.number().int().min(1).max(100).default(20).describe("Quantidade máxima de eventos."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date, to_date, status, search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("cronograma_eventos_full")
      .select(
        "id,title,description,status,priority,category,start_date,end_date,start_time,end_time,location,commission_name,responsible_name",
      )
      .order("start_date", { ascending: true })
      .limit(limit ?? 20);

    if (from_date) query = query.gte("start_date", from_date);
    if (to_date) query = query.lte("start_date", to_date);
    if (status) query = query.eq("status", status);
    if (search) query = query.ilike("title", `%${search}%`);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { events: data ?? [] },
    };
  },
});
