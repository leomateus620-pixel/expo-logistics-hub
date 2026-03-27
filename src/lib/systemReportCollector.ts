import { isWithinInterval, parseISO, format } from 'date-fns';

/* ── Types ── */
export interface ReportPeriod {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

export interface ModuleConfig {
  id: string;
  label: string;
  dateFields: string[];
  columns: { key: string; label: string }[];
}

export interface ModuleResult {
  config: ModuleConfig;
  records: Record<string, any>[];
  created: number;
  updated: number;
  total: number;
  inconsistencies: string[];
}

export interface SystemReportPayload {
  period: ReportPeriod;
  generatedAt: string;
  reportId: string;
  modules: ModuleResult[];
  totalRecords: number;
  totalInconsistencies: number;
}

/* ── Module definitions ── */
export const ALL_MODULES: ModuleConfig[] = [
  {
    id: 'transports',
    label: 'Transportes',
    dateFields: ['inicio_em', 'created_at', 'updated_at'],
    columns: [
      { key: 'titulo', label: 'Título' },
      { key: 'origem', label: 'Origem' },
      { key: 'destino', label: 'Destino' },
      { key: 'status', label: 'Status' },
      { key: 'inicio_em', label: 'Início' },
      { key: 'fim_em', label: 'Fim' },
      { key: 'vehicle_id', label: 'Veículo ID' },
      { key: 'motorista_user_id', label: 'Motorista ID' },
      { key: 'passageiros_qtd', label: 'Passageiros' },
      { key: 'distancia_estimada_km', label: 'KM Estimado' },
      { key: 'km_retirada', label: 'KM Retirada' },
      { key: 'km_devolucao', label: 'KM Devolução' },
      { key: 'observacoes', label: 'Observações' },
      { key: 'created_at', label: 'Criado em' },
      { key: 'updated_at', label: 'Atualizado em' },
    ],
  },
  {
    id: 'vehicles',
    label: 'Veículos',
    dateFields: ['created_at', 'updated_at'],
    columns: [
      { key: 'placa', label: 'Placa' },
      { key: 'modelo', label: 'Modelo' },
      { key: 'marca', label: 'Marca' },
      { key: 'ano', label: 'Ano' },
      { key: 'cor', label: 'Cor' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'km_atual', label: 'KM Atual' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Criado em' },
      { key: 'updated_at', label: 'Atualizado em' },
    ],
  },
  {
    id: 'vehicle_usage',
    label: 'Uso de Veículos',
    dateFields: ['retirada_em', 'created_at'],
    columns: [
      { key: 'vehicle_id', label: 'Veículo ID' },
      { key: 'retirada_em', label: 'Retirada' },
      { key: 'devolucao_em', label: 'Devolução' },
      { key: 'km_saida', label: 'KM Saída' },
      { key: 'km_chegada', label: 'KM Chegada' },
      { key: 'km_rodados', label: 'KM Rodados' },
      { key: 'observacoes', label: 'Observações' },
      { key: 'created_at', label: 'Criado em' },
    ],
  },
  {
    id: 'fuel_records',
    label: 'Abastecimentos',
    dateFields: ['created_at'],
    columns: [
      { key: 'vehicle_id', label: 'Veículo ID' },
      { key: 'litros', label: 'Litros' },
      { key: 'valor', label: 'Valor (R$)' },
      { key: 'posto', label: 'Posto' },
      { key: 'km_abastecimento', label: 'KM Abastecimento' },
      { key: 'observacoes', label: 'Observações' },
      { key: 'created_at', label: 'Criado em' },
    ],
  },
  {
    id: 'guests',
    label: 'Hóspedes',
    dateFields: ['checkin_em', 'checkout_em', 'created_at'],
    columns: [
      { key: 'nome', label: 'Nome' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'hotel_nome', label: 'Hotel' },
      { key: 'checkin_em', label: 'Check-in' },
      { key: 'checkout_em', label: 'Check-out' },
      { key: 'prioridade', label: 'Prioridade' },
      { key: 'observacoes', label: 'Observações' },
      { key: 'created_at', label: 'Criado em' },
    ],
  },
  {
    id: 'events',
    label: 'Agenda / Eventos',
    dateFields: ['inicio_em', 'created_at'],
    columns: [
      { key: 'titulo', label: 'Título' },
      { key: 'descricao', label: 'Descrição' },
      { key: 'inicio_em', label: 'Início' },
      { key: 'fim_em', label: 'Fim' },
      { key: 'local', label: 'Local' },
      { key: 'tipo_tag', label: 'Tipo' },
      { key: 'observacoes', label: 'Observações' },
      { key: 'created_at', label: 'Criado em' },
    ],
  },
  {
    id: 'tasks',
    label: 'Tarefas',
    dateFields: ['due_em', 'created_at', 'updated_at'],
    columns: [
      { key: 'titulo', label: 'Título' },
      { key: 'descricao', label: 'Descrição' },
      { key: 'status', label: 'Status' },
      { key: 'prioridade', label: 'Prioridade' },
      { key: 'due_em', label: 'Prazo' },
      { key: 'completed_at', label: 'Concluída em' },
      { key: 'recorrencia', label: 'Recorrência' },
      { key: 'created_at', label: 'Criado em' },
      { key: 'updated_at', label: 'Atualizado em' },
    ],
  },
  {
    id: 'electric_carts',
    label: 'Carrinhos Elétricos',
    dateFields: ['created_at', 'updated_at', 'retirada_em', 'devolucao_em'],
    columns: [
      { key: 'codigo', label: 'Código' },
      { key: 'nome', label: 'Responsável' },
      { key: 'status', label: 'Status' },
      { key: 'comissao', label: 'Comissão' },
      { key: 'retirada_em', label: 'Retirada' },
      { key: 'devolucao_em', label: 'Devolução' },
      { key: 'observacoes', label: 'Observações' },
      { key: 'created_at', label: 'Criado em' },
    ],
  },
  {
    id: 'scooters',
    label: 'Patinetes',
    dateFields: ['created_at', 'updated_at', 'retirada_em', 'devolucao_em'],
    columns: [
      { key: 'codigo', label: 'Código' },
      { key: 'nome', label: 'Responsável' },
      { key: 'status', label: 'Status' },
      { key: 'comissao', label: 'Comissão' },
      { key: 'retirada_em', label: 'Retirada' },
      { key: 'devolucao_em', label: 'Devolução' },
      { key: 'observacoes', label: 'Observações' },
      { key: 'created_at', label: 'Criado em' },
    ],
  },
  {
    id: 'schedules',
    label: 'Escalas',
    dateFields: ['data_inicio', 'created_at'],
    columns: [
      { key: 'nome', label: 'Nome' },
      { key: 'data_inicio', label: 'Início' },
      { key: 'data_fim', label: 'Fim' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Criado em' },
    ],
  },
  {
    id: 'schedule_shifts',
    label: 'Turnos da Escala',
    dateFields: ['inicio_em', 'created_at'],
    columns: [
      { key: 'titulo', label: 'Título' },
      { key: 'inicio_em', label: 'Início' },
      { key: 'fim_em', label: 'Fim' },
      { key: 'local', label: 'Local' },
      { key: 'observacoes', label: 'Observações' },
      { key: 'created_at', label: 'Criado em' },
    ],
  },
  {
    id: 'shift_assignments',
    label: 'Atribuições de Turno',
    dateFields: ['created_at'],
    columns: [
      { key: 'member_user_id', label: 'Membro ID' },
      { key: 'funcao', label: 'Função' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Criado em' },
    ],
  },
  {
    id: 'org_members',
    label: 'Equipe',
    dateFields: ['created_at'],
    columns: [
      { key: 'nome_exibicao', label: 'Nome' },
      { key: 'cargo', label: 'Cargo' },
      { key: 'role', label: 'Papel' },
      { key: 'status', label: 'Status' },
      { key: 'telefone', label: 'Telefone' },
      { key: 'created_at', label: 'Criado em' },
    ],
  },
];

/* ── Helpers ── */
function dateInRange(dateStr: string | null, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  try {
    const d = parseISO(dateStr);
    return isWithinInterval(d, { start, end });
  } catch {
    return false;
  }
}

function recordInPeriod(record: Record<string, any>, dateFields: string[], start: Date, end: Date): boolean {
  return dateFields.some(f => dateInRange(record[f], start, end));
}

/* ── Main collector ── */
export function collectSystemReport(
  dataByModule: Record<string, any[]>,
  period: ReportPeriod,
  selectedModuleIds: string[],
): SystemReportPayload {
  const start = parseISO(period.start);
  // end of day
  const end = new Date(parseISO(period.end).getTime() + 86400000 - 1);

  const modules: ModuleResult[] = [];

  for (const mod of ALL_MODULES) {
    if (!selectedModuleIds.includes(mod.id)) continue;

    const raw = dataByModule[mod.id] || [];
    const records = raw.filter(r => recordInPeriod(r, mod.dateFields, start, end));

    const created = records.filter(r => dateInRange(r.created_at, start, end)).length;
    const updated = records.filter(r => {
      if (!r.updated_at || !r.created_at) return false;
      return r.updated_at !== r.created_at && dateInRange(r.updated_at, start, end);
    }).length;

    // Detect inconsistencies
    const inconsistencies: string[] = [];
    for (const r of records) {
      const id = r.id?.slice(0, 8) || '?';
      if (mod.id === 'transports') {
        if (!r.vehicle_id) inconsistencies.push(`Transporte ${id}: sem veículo associado`);
        if (!r.origem || !r.destino) inconsistencies.push(`Transporte ${id}: origem/destino ausente`);
      }
      // Generic: check for null on critical fields
      const hasAllNullDates = mod.dateFields.every(f => !r[f]);
      if (hasAllNullDates) {
        inconsistencies.push(`Registro ${id} (${mod.label}): todos os campos de data nulos`);
      }
    }

    modules.push({
      config: mod,
      records,
      created,
      updated,
      total: records.length,
      inconsistencies,
    });
  }

  const totalRecords = modules.reduce((s, m) => s + m.total, 0);
  const totalInconsistencies = modules.reduce((s, m) => s + m.inconsistencies.length, 0);

  return {
    period,
    generatedAt: new Date().toISOString(),
    reportId: crypto.randomUUID(),
    modules,
    totalRecords,
    totalInconsistencies,
  };
}
