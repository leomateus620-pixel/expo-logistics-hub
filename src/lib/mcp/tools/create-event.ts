import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_event",
  title: "Criar evento no cronograma",
  description:
    "Cria um novo evento na Agenda Fenasoja para a organização do usuário autenticado.",
  inputSchema: {
    title: z.string().trim().min(1).describe("Título do evento."),
    start_date: z.string().describe("Data de início (YYYY-MM-DD)."),
    end_date: z.string().optional().describe("Data de término (YYYY-MM-DD)."),
    start_time: z.string().optional().describe("Horário de início (HH:MM)."),
    end_time: z.string().optional().describe("Horário de término (HH:MM)."),
    location: z.string().optional().describe("Local do evento."),
    description: z.string().optional().describe("Descrição/observações."),
    priority: z.string().optional().describe("Prioridade do evento."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    const { data: membership, error: membershipError } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      return { content: [{ type: "text", text: membershipError.message }], isError: true };
    }
    if (!membership?.org_id) {
      return {
        content: [{ type: "text", text: "Usuário não está vinculado a nenhuma organização." }],
        isError: true,
      };
    }

    const { data, error } = await supabase
      .from("cronograma_eventos")
      .insert({
        org_id: membership.org_id,
        created_by_user_id: userId,
        title: input.title,
        start_date: input.start_date,
        end_date: input.end_date ?? null,
        start_time: input.start_time ?? null,
        end_time: input.end_time ?? null,
        location: input.location ?? null,
        description: input.description ?? null,
        priority: input.priority ?? null,
        has_exact_date: true,
      })
      .select("id,title,start_date,status")
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { event: data },
    };
  },
});
