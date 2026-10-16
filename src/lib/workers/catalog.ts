import type { WorkerToolDefinition } from './types.ts';
import { agendaTools } from './tools/agenda/index.ts';
import { arenaTools } from './tools/arena/index.ts';
import { mapaTools } from './tools/mapa/index.ts';
import { interesseTools } from './tools/interesse/index.ts';
import { comissaoTools } from './tools/comissao/index.ts';
import { logisticaTools } from './tools/logistica/index.ts';
import { caixaTools } from './tools/caixa/index.ts';

/** Shared metadata for the orchestrator and MCP; execution lives in the closed dispatcher. */
export const workerToolDefinitions: readonly WorkerToolDefinition[] = Object.freeze([
  ...agendaTools,
  ...arenaTools,
  ...mapaTools,
  ...interesseTools,
  ...comissaoTools,
  ...logisticaTools,
  ...caixaTools,
]);
