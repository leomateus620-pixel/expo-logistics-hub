import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listEventsTool from "./tools/list-events";
import getEventTool from "./tools/get-event";
import createEventTool from "./tools/create-event";
import listTransportsTool from "./tools/list-transports";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "fenasoja-log",
  title: "Fenasoja Log",
  version: "0.1.0",
  instructions:
    "Ferramentas da Fenasoja Log. Use `list_events`/`get_event` para consultar a Agenda Fenasoja, `create_event` para registrar novos eventos e `list_transports` para acompanhar a logística de transportes. Todas as chamadas respeitam as permissões do usuário conectado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listEventsTool, getEventTool, createEventTool, listTransportsTool],
});
