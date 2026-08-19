import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_transports",
  title: "Listar transportes",
  description:
    "Lista transportes da logística Fenasoja visíveis para o usuário, com filtro por status e período de início.",
  inputSchema: {
    status: z
      .string()
      .optional()
      .describe("Status do transporte: pendente, em_andamento, concluido ou cancelado."),
    from_datetime: z.string().optional().describe("Início mínimo (ISO 8601)."),
    to_datetime: z.string().optional().describe("Início máximo (ISO 8601)."),
    limit: z.number().int().min(1).max(100).default(20).describe("Quantidade máxima de registros."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, from_datetime, to_datetime, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("transports")
      .select(
        "id,titulo,status,tipo,origem,destino,inicio_em,fim_em,passageiros_qtd,prioridade,observacoes",
      )
      .order("inicio_em", { ascending: true })
      .limit(limit ?? 20);

    if (status) query = query.eq("status", status);
    if (from_datetime) query = query.gte("inicio_em", from_datetime);
    if (to_datetime) query = query.lte("inicio_em", to_datetime);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { transports: data ?? [] },
    };
  },
});
