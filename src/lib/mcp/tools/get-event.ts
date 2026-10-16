import { defineTool } from '@lovable.dev/mcp-js';
import { notAuthenticated, supabaseForUser } from '../supabase';
import { executeMcpReadTool, getEventInput, workerToolDefinitions, WorkerToolError } from '../../workers/index.ts';

const definition = workerToolDefinitions.find((tool) => tool.name === 'get_event')!;
export default defineTool({
  name: 'get_event', title: definition.title, description: definition.description,
  inputSchema: getEventInput.shape,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    try {
      const result = await executeMcpReadTool(supabaseForUser(ctx), ctx.getUserId(), 'get_event', input);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: { event: result.records[0] ?? null, citations: result.citations } };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: error instanceof WorkerToolError ? error.message : 'Não foi possível consultar o evento.' }], isError: true };
    }
  },
});
