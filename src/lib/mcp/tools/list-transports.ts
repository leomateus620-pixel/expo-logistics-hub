import { defineTool } from '@lovable.dev/mcp-js';
import { notAuthenticated, supabaseForUser } from '../supabase';
import { executeMcpReadTool, listTransportsInput, workerToolDefinitions, WorkerToolError } from '../../workers/index.ts';

const definition = workerToolDefinitions.find((tool) => tool.name === 'list_transports')!;
export default defineTool({
  name: 'list_transports', title: definition.title, description: definition.description,
  inputSchema: listTransportsInput.shape,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    try {
      const result = await executeMcpReadTool(supabaseForUser(ctx), ctx.getUserId(), 'list_transports', input);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: { transports: result.records, citations: result.citations, total: result.total, truncated: result.truncated } };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: error instanceof WorkerToolError ? error.message : 'Não foi possível consultar os transportes.' }], isError: true };
    }
  },
});
