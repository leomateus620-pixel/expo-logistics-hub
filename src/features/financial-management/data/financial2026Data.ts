import type {
  CommissionBudgetSource,
  ExpenseCategory,
  FinancialExpenseSourceRow,
  FinancialReportDefinition,
  FinancialRevenue,
  FinancialScenario,
  FinancialWorkbookTotals,
  GeneralBudgetItem,
  RevenueCategory,
  Sponsor,
  SponsorTier,
} from '../types';

/**
 * Temporary frontend representation derived from the official Fenasoja 2026
 * financial spreadsheet.
 *
 * No persistence. Must be replaced/integrated with the official financial
 * data source during the backend phase.
 *
 * Source workbook: "1 ORÇAMENTO FENASOJA2026.xlsx".
 * These values are planning references, not live database records.
 */
export const financial2026Source = {
  workbook: '1 ORÇAMENTO FENASOJA2026.xlsx',
  label: 'Base Orçamentária 2026',
  importedLabel: 'Importação de planejamento 2026',
  expenseRange: 'Despesas!A1:L343',
  revenueRange: 'Receitas!A1:Q131',
  scenarioRange: "'PROJEÇÃO 2026'!A1:I19",
} as const;

type RawExpenseRow = readonly [
  sourceRow: number,
  description: string,
  value2025: number,
  value2026: number,
  realizedAmount: number,
  paidWithFreeResource: number,
  municipalityPlanAmount: number,
  rouanetAmount: number,
  paidMarkerAmount: number,
  observation: string,
];

interface RawCommissionBlock {
  sourceRow: number;
  sourceLabel: string;
  commission: string;
  responsible: string;
  budgetCap: number;
  budgetedAmount: number;
  rows: readonly RawExpenseRow[];
}

type RawCommitment = readonly [
  sourceRow: number,
  description: string,
  budgetCap: number,
  budgetedAmount: number,
  observation: string,
];

type RawSponsor = readonly [
  sourceRow: number,
  name: string,
  vehicleCredentials: number,
  soySummitCredentials: number,
  graoDeOuro: string,
  ouro: string,
  prata: string,
  bronze: string,
  soySummit: string,
  outrosApoios: string,
  declaredValue: number,
  projectedFreeResource: number,
  consolidatedFreeResource: number,
  receivableRaw: string | number,
  projectedRouanet: number,
  receivedOn: string | number,
  consolidatedRouanet: number,
  inKindContribution: string | number,
];

type RawRevenue = readonly [
  sourceRow: number,
  source: string,
  projectedAmount: number,
  consolidatedAmount: number,
  receivableAmount: number,
];

const rawCommissionBlocks: readonly RawCommissionBlock[] = [
  {
    sourceRow: 4,
    sourceLabel: "CCP (DÁRIO)",
    commission: "CCP",
    responsible: "Dário",
    budgetCap: 20000,
    budgetedAmount: 17500,
    rows: [
      [4, "Alimentação Voluntários (R$38,00) (130 vales)", 0, 0, 0, 0, 0, 0, 0, ""],
      [5, "Vales Água/Refri (R$6,00  130 vales)", 0, 0, 0, 0, 0, 0, 0, ""],
      [6, "Café com os Presidentes (durante fenasoja)", 0, 0, 0, 0, 0, 0, 0, ""],
      [7, "Encontrão Presidentes 60 anos (06 de maio)", 0, 17500, 17500, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 8,
    sourceLabel: "Comissão Central",
    commission: "Comissão Central",
    responsible: "",
    budgetCap: 3500000,
    budgetedAmount: 3273228.95,
    rows: [
      [9, "Equipe CLÉO ANTONIO ROCKENBACH - MEI   (R$6.615,00)", 79380, 60000, 139380, 0, 0, 0, 0, ""],
      [10, "Equipe ZELIA SAVOLDI - MEI (R$6.000,00)", 72000, 30000, 102000, 0, 0, 0, 0, ""],
      [11, "Equipe DEBORA (R$3.600,00)", 43200, 18000, 61200, 0, 0, 0, 0, ""],
      [12, "Equipe FERNANDA (R$3.900,00", 46800, 19500, 66300, 0, 0, 0, 0, ""],
      [13, "Equipe ROQUE LUGOCH (R$3000,00)", 36000, 15000, 51000, 0, 0, 0, 0, ""],
      [14, "Equipe temporária (Luciana)", 0, 2600, 0, 0, 0, 0, 0, ""],
      [15, "Escritório Contabilidade ACERTEI (Jarbas) (R$3.500,00)", 45500, 17500, 63000, 0, 0, 0, 0, ""],
      [16, "ESCRITÓRIO ZIMMERMANN  (Multa recisão)", 49350, 0, 49350, 0, 0, 0, 0, ""],
      [17, "Gastos Gerais Administrativos (captação/viagens/hospedagem/Comb)", 50000, 25000, 75000, 0, 0, 0, 0, ""],
      [18, "Gastos gerais Suporte Administrativo", 12000, 5000, 17000, 0, 0, 0, 0, ""],
      [19, "Gastos lanches reuniões CC", 9600, 4000, 13600, 0, 0, 0, 0, ""],
      [20, "FOTOGRAFIAS (mais Refeições 2.200,00)", 0, 11500, 11500, 0, 9250, 4250, 0, ""],
      [21, "SHELTER MONITORAMENTO", 7200, 3000, 10200, 0, 0, 0, 0, ""],
      [22, "Shelter Câmeras feira", 0, 50000, 50000, 0, 0, 0, 0, ""],
      [23, "Alimentação Equipe Adm 100 (R$38,00)", 0, 0, 0, 0, 0, 0, 0, ""],
      [24, "Material de Expediente (Administrativo)", 3000, 3000, 6000, 0, 0, 0, 0, ""],
      [25, "Material de Limpeza e Cozinha (Administrativo)", 3000, 1000, 4000, 0, 0, 0, 0, ""],
      [26, "Colocação Carpete Pav 1 (C&C)", 0, 8000, 8000, 0, 0, 0, 0, ""],
      [27, "Montagem Extra C&C", 0, 122000, 122000, 0, 0, 0, 0, ""],
      [28, "Montagem Módulos (C&C)", 0, 408310, 408310, 0, 0, 0, 0, ""],
      [29, "Montagem Básica (Cavalini)", 0, 369320, 369320, 0, 0, 0, 0, "204.449, já pago Planop Prefeitura"],
      [30, "Pirâmides Externas (Cavalini)", 0, 163449.14, 163449.14, 0, 0, 0, 0, ""],
      [31, "Cavalini EXTRA", 0, 27824.86, 27824.86, 0, 0, 0, 0, ""],
      [32, "Pavilhão Lona Palco Semear (FabriLonas)", 0, 30000, 30000, 0, 0, 0, 0, ""],
      [33, "Luz parque FENASOJA 2026", 0, 200000, 200000, 0, 0, 0, 0, ""],
      [34, "PPCI Engenheiro Djeison", 0, 27720, 27720, 0, 0, 0, 0, ""],
      [35, "PPCI - Geral - Instalação extintores, taxas, adequações", 0, 20000, 20000, 0, 0, 0, 0, ""],
      [36, "PPCI Feira", 0, 44000, 44000, 0, 0, 0, 0, ""],
      [37, "Tecnicon (12 x 1613,71)", 19364.52, 8158.55, 27523.07, 0, 0, 0, 0, ""],
      [38, "Decorção Eventos Pré Feira (Thais Broglio)", 0, 21500, 21500, 0, 0, 0, 0, ""],
      [39, "Ornamentação/jardinagem (Feira)", 0, 35000, 35000, 0, 0, 0, 0, ""],
      [40, "Aquisição Fenos Decoração", 0, 15000, 15000, 0, 0, 0, 0, ""],
      [41, "Alvarás Expositor Prefeitura", 0, 63000, 63000, 63000, 0, 0, 0, ""],
      [42, "Brindes Voluntários (SOJA STORE)", 0, 16000, 16000, 0, 0, 0, 0, ""],
      [43, "Jantar Encerramento Feira", 0, 30000, 30000, 0, 0, 0, 0, ""],
      [44, "Climatização Pavilhões", 0, 63000, 63000, 0, 0, 0, 0, "Pinguim"],
      [45, "Contratação Geradores (6)", 0, 21380, 21380, 0, 0, 0, 0, ""],
      [46, "Genermac Banheiros (6) e Gradil Isolamento", 0, 58000, 58000, 0, 0, 0, 0, ""],
      [47, "Contratação Seguro Parque", 0, 21947.88, 21947.88, 0, 0, 0, 0, ""],
      [48, "Camisas Fenasoja Voluntários", 0, 14000, 14000, 0, 0, 0, 0, ""],
      [49, "Camisetas Voluntários (Camisa - Camiseta - Polo) Média 75,00 x 260", 0, 19500, 19500, 0, 0, 0, 0, ""],
      [50, "Chapéus (300 x 36,00)", 0, 10800, 10800, 0, 0, 0, 0, ""],
      [51, "Corta vento (170,00 cada 86 total)", 0, 14620, 14620, 0, 0, 0, 0, ""],
      [52, "DETETIZAÇÃO", 0, 1700, 1700, 0, 0, 0, 0, ""],
      [53, "Contratação de Assessoria de Eventos", 0, 12500, 12500, 0, 0, 0, 0, ""],
      [54, "Trofeu 60 anos Fenasoja", 0, 15000, 15000, 0, 0, 0, 0, ""],
      [55, "Trofeu Mniatura Soja Santa Rosa (150)", 0, 15000, 15000, 0, 0, 0, 0, ""],
      [56, "Monumento Soja Santa Rosa (150)", 0, 8000, 8000, 0, 0, 0, 0, ""],
      [57, "Aquisição de 2 Notebook novos fenasoja", 0, 5000, 5000, 0, 0, 0, 0, ""],
      [58, "Videos Will", 0, 7500, 7500, 0, 0, 0, 0, ""],
      [59, "Contratação Suporte de maketing (Card)", 0, 3500, 3500, 0, 0, 0, 0, ""],
      [60, "Contratação MUÑOZ (Cerimonial Abertura e Soy Summit convites)", 0, 12000, 12000, 0, 0, 0, 0, ""],
      [61, "Guego REI ARTES Placas", 0, 4604, 4604, 0, 0, 0, 0, ""],
      [62, "Divulgação Etnias", 0, 5000, 5000, 0, 0, 0, 0, ""],
      [63, "Reforma Memorial e Marco Zero", 0, 12000, 12000, 0, 0, 0, 0, ""],
      [66, "Reserva de Gastos não Previstos", 0, 600000, 600000, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 67,
    sourceLabel: "Bilheteria (GUSTAVO)",
    commission: "Bilheteria",
    responsible: "Gustavo",
    budgetCap: 280000,
    budgetedAmount: 275037.5,
    rows: [
      [67, "", 0, 0, 0, 0, 0, 0, 0, "Foi captado do patrocinador fulano de tal"],
      [68, "Sistema Bilheteria Mehga Feira", 0, 130000, 130000, 130000, 0, 0, 0, ""],
      [69, "Prefeitura imposto Bilheteria 2%", 0, 9000, 9000, 0, 0, 0, 0, ""],
      [70, "Repasse de 25% para a Mega Feira", 0, 136037.5, 136037.5, 136037.5, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 72,
    sourceLabel: "Marketing (ZELIA)",
    commission: "Marketing",
    responsible: "Zelia",
    budgetCap: 1100000,
    budgetedAmount: 1150769,
    rows: [
      [73, "Canal RURAL", 0, 0, 0, 0, 0, 0, 0, "Presente no Soyu Summit até domingo)"],
      [74, "RBS TV Caderno Especial", 0, 8000, 8000, 0, 0, 0, 0, ""],
      [75, "RBS TV Propagandas (Mídia avulsa)", 0, 15023, 15023, 0, 0, 0, 0, "8165,00 já pago p RBS"],
      [76, "RBS TV JÁ (bem Prati)", 0, 188826, 188826, 0, 0, 0, 0, ""],
      [77, "RBS TV - Rádio Gaúcha Atualidades", 0, 40000, 40000, 0, 0, 0, 0, ""],
      [78, "TV PAMPA", 0, 105000, 105000, 0, 0, 0, 0, "Já foi pago 48.000,00"],
      [79, "SBT", 0, 30000, 30000, 0, 0, 0, 0, ""],
      [80, "BAND", 0, 30000, 30000, 0, 0, 0, 0, ""],
      [81, "RECORD", 0, 30000, 30000, 0, 0, 18338.36, 0, ""],
      [82, "Rádio Guaiba", 0, 3000, 3000, 0, 0, 0, 0, ""],
      [83, "Impressos (Programação, espaço cultural Flayer)", 0, 15000, 15000, 0, 0, 10000, 0, ""],
      [84, "Outdoor (Aluguél, lona) Identificação Interna Parque (Taura)", 0, 128278, 128278, 0, 0, 35520, 0, ""],
      [85, "Outdoor (Aluguél, lona) Identificação Interna Parque (ADH Promus)", 0, 20000, 20000, 0, 0, 0, 0, ""],
      [86, "Rádio Santo ângelo", 0, 3600, 3600, 0, 0, 3600, 0, ""],
      [87, "Rádio Sepé", 0, 3600, 3600, 0, 0, 4660, 0, ""],
      [88, "Rádio Colonial", 0, 2100, 2100, 0, 0, 1800, 0, ""],
      [89, "Rádio Sucesso", 0, 2100, 2100, 0, 0, 1500, 0, ""],
      [90, "Rádio Ativa", 0, 2100, 2100, 0, 0, 1500, 0, ""],
      [91, "Rádio Navegante", 0, 2100, 2100, 0, 0, 1500, 0, ""],
      [92, "Rádio 104", 0, 1100, 1100, 0, 0, 700, 0, ""],
      [93, "Rádio Girua", 0, 1100, 1100, 0, 0, 750, 0, ""],
      [94, "Rádio Comunitária", 0, 1100, 1100, 0, 0, 700, 0, ""],
      [95, "Rádio Liderson", 0, 2100, 2100, 0, 0, 500, 0, ""],
      [96, "Rádio Santa Rosa", 0, 1000, 1000, 0, 0, 0, 0, ""],
      [97, "Rádio Progresso", 0, 2100, 2100, 0, 0, 1500, 0, ""],
      [98, "Rádio Jornal da Manhã", 0, 2100, 2100, 0, 0, 1500, 0, ""],
      [99, "Rádio Capital", 0, 2100, 2100, 0, 0, 1500, 0, ""],
      [100, "Rádio 95", 0, 1500, 1500, 0, 0, 1000, 0, ""],
      [101, "Rádio Vera Cruz", 0, 1500, 1500, 0, 0, 1000, 0, ""],
      [102, "Rádio Olinda", 0, 2100, 2100, 0, 0, 700, 0, ""],
      [103, "Rádio Maua", 0, 1500, 1500, 0, 0, 1000, 0, ""],
      [104, "Rádio Regional", 0, 2100, 2100, 0, 0, 1500, 0, ""],
      [105, "Rádio Missioneira", 0, 2100, 2100, 0, 0, 1500, 0, ""],
      [106, "Rádio Mundial Ijui", 0, 2100, 2100, 0, 0, 1500, 0, ""],
      [107, "Rádio Cerro Azul Chambala", 0, 0, 0, 0, 0, 1000, 0, ""],
      [108, "Site Jornalagorana costa", 0, 1000, 1000, 0, 0, 750, 0, ""],
      [109, "SitePaulomarques", 0, 1500, 1500, 0, 0, 750, 0, ""],
      [110, "SiteRBNoticiaa", 0, 600, 600, 0, 0, 0, 0, ""],
      [111, "Jornal Gazeta", 0, 2100, 2100, 0, 0, 1200, 0, ""],
      [112, "Jornal Folha Rural", 0, 1500, 1500, 0, 0, 0, 0, ""],
      [113, "Jornal Semanal", 0, 500, 500, 0, 0, 300, 0, ""],
      [114, "Revista Urbana", 0, 800, 800, 0, 0, 500, 0, ""],
      [115, "Portal Missiones online", 0, 1600, 1600, 0, 0, 0, 0, ""],
      [116, "Todo Misiones", 0, 1000, 1000, 0, 0, 0, 0, ""],
      [117, "Rádio Querência São Martinho", 0, 800, 800, 0, 0, 500, 0, ""],
      [118, "Rádio Alto Uruguai Três Passos", 0, 900, 900, 0, 0, 750, 0, ""],
      [119, "Rádio Novos Horizontes Sto Ângelo", 0, 1000, 1000, 0, 0, 750, 0, ""],
      [120, "Rádio Atitude FM Campina das Missões", 0, 700, 700, 0, 0, 500, 0, ""],
      [121, "Rádio Querência Santo Augusto", 0, 900, 900, 0, 0, 750, 0, ""],
      [122, "Duo Social Extra (1.600 x 17)", 0, 27200, 27200, 0, 0, 0, 0, ""],
      [123, "Duo Social Contratação Feira (10  dias)", 0, 25000, 25000, 25000, 0, 0, 0, ""],
      [124, "Painel Led Arco (Eporural (17mil e Espaço do Automóvel (14mil))", 0, 31000, 31000, 0, 0, 24000, 0, "ver leo"],
      [125, "Mídias Sociais (impulsionamentos)", 0, 15000, 15000, 0, 0, 0, 0, ""],
      [126, "Rádio Parque (Caixas de som) (Huff)", 0, 31000, 31000, 0, 20000, 0, 0, ""],
      [127, "Contratação de 1 Jornalistas (60 dias)", 0, 6300, 6300, 6300, 0, 0, 0, ""],
      [128, "Contratação Jornalistas SÃO PAULO", 0, 0, 0, 0, 0, 0, 0, ""],
      [129, "GH - Contratação", 0, 120000, 120000, 0, 0, 0, 0, ""],
      [130, "GH - Site com Expositor", 0, 10000, 10000, 0, 0, 0, 0, ""],
      [131, "ProduSom", 0, 15400, 15400, 0, 15400, 0, 0, ""],
      [132, "Stúdio de PodCast", 0, 0, 0, 0, 0, 0, 0, ""],
      [133, "Lançamento Fenasoja Porto Alegre (Hotel Devile)", 0, 50000, 50000, 0, 0, 0, 0, ""],
      [134, "Lançamento Fenasoja Possadas e Oberá", 0, 9000, 9000, 0, 0, 0, 0, ""],
      [135, "Lançamento Santa Rosa", 0, 50000, 50000, 0, 0, 0, 0, ""],
      [136, "Patrocínio CORRIDA SESI", 0, 6500, 6500, 0, 0, 0, 0, ""],
      [137, "Patrocínio CORRIDA SESI 2026", 0, 6500, 6500, 0, 0, 0, 0, ""],
      [138, "Portico SANTA ROSA - Berço", 0, 12500, 12500, 0, 0, 0, 0, ""],
      [139, "Revista 60 anos", 0, 6692, 6692, 0, 0, 0, 0, ""],
      [140, "Contratação Apresentadora Francini (TV Fenasoja) (3.600 1.200)", 0, 4800, 4800, 0, 0, 0, 0, ""],
      [141, "TV Fenasoja (Harumi)", 0, 24000, 24000, 0, 0, 0, 0, ""],
      [142, "Impressão Mapas do Parque", 0, 12650, 12650, 0, 0, 0, 0, ""],
      [143, "APOIO Grenal SOLIDÁRIO (Câmara)", 0, 5000, 5000, 0, 0, 0, 0, ""],
      [144, "APOIO  (Câmara)", 0, 3000, 3000, 0, 0, 0, 0, ""],
      [145, "NOROESTE Plus Prefeitura", 0, 10000, 10000, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 147,
    sourceLabel: "Agricultura soja e derivados (VANESSA)",
    commission: "Agricultura, Soja e Derivados",
    responsible: "Vanessa",
    budgetCap: 25000,
    budgetedAmount: 25000,
    rows: [
      [148, "Insumos Cozinha da Soja", 0, 6000, 6000, 0, 0, 0, 0, ""],
      [149, "Livro Cozinha da Soja", 0, 3000, 3000, 0, 0, 0, 0, ""],
      [150, "Material Maquete Caminhos da Soja", 0, 10000, 10000, 0, 0, 0, 0, ""],
      [151, "Bolo comemorativo 60 anos", 0, 2000, 2000, 0, 0, 0, 0, ""],
      [152, "Diversos", 0, 4000, 4000, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 153,
    sourceLabel: "Pecuária (ELIS)",
    commission: "Pecuária",
    responsible: "Elis",
    budgetCap: 20000,
    budgetedAmount: 17200,
    rows: [
      [153, "Carga de Casca de arroz (duas cargas)", 0, 4400, 4400, 0, 0, 0, 0, ""],
      [154, "Tosadores", 0, 10000, 10000, 0, 0, 0, 0, ""],
      [155, "Alimentação Tratadores (R$40,00) (70 vales)", 0, 2800, 2800, 0, 0, 0, 0, ""],
      [156, "Tratadores Pagamento", 0, 0, 0, 0, 0, 0, 0, ""],
      [157, "Trofeu", 0, 0, 0, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 158,
    sourceLabel: "Cooperativismo (ALEXANDRE)",
    commission: "Cooperativismo",
    responsible: "Alexandre",
    budgetCap: 5000,
    budgetedAmount: 0,
    rows: [
    ],
  },
  {
    sourceRow: 162,
    sourceLabel: "Arte e Cultura (LEO)",
    commission: "Arte e Cultura",
    responsible: "Leo",
    budgetCap: 400000,
    budgetedAmount: 216000,
    rows: [
      [164, "", 0, 0, 0, 0, 0, 0, 0, "4459 + 6022 já pago"],
      [165, "Contatação artistas e cultura", 0, 200000, 200000, 0, 0, 0, 0, ""],
      [166, "Premiação Projeto Orgulho Nacional (Escolas - 5mil, 3mil e 2mil)", 0, 10000, 10000, 0, 0, 0, 0, ""],
      [167, "Encargos Projeto Orgulho Nacional", 0, 5000, 5000, 0, 0, 0, 0, ""],
      [168, "", 0, 1000, 1000, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 173,
    sourceLabel: "Inovação e Experiência (DOUGLAS)",
    commission: "Inovação e Experiência",
    responsible: "Douglas",
    budgetCap: 651000,
    budgetedAmount: 679417.5,
    rows: [
      [173, "SOY SUMMIT", 0, 0, 0, 0, 0, 0, 0, ""],
      [174, "Estrutura de Som e equipamentos para Soy Summit", 0, 25000, 25000, 0, 0, 0, 0, "18.000,00 0 Sebrae irá pagar"],
      [175, "Logistica Soy Summit", 0, 15000, 15000, 0, 0, 0, 0, ""],
      [176, "Hotelaria Soy Summit", 0, 6000, 6000, 0, 0, 0, 0, ""],
      [177, "Almoços Convidados", 0, 5000, 5000, 0, 0, 0, 0, ""],
      [178, "Coffee break (a base deve ser com derivados de soja)", 0, 5000, 5000, 0, 0, 0, 0, ""],
      [179, "PalestraProf. Molion", 0, 6000, 6000, 0, 0, 0, 0, ""],
      [180, "Palestra Paulo Guedes", 0, 275000, 275000, 275000, 0, 0, 0, ""],
      [181, "Logistica Paulo Guedes", 0, 5000, 5000, 0, 0, 0, 0, ""],
      [182, "Thais Broglio (credenciamento)", 0, 1500, 1500, 0, 0, 0, 0, ""],
      [183, "Contratação de PodCast", 0, 25000, 25000, 0, 0, 0, 0, ""],
      [184, "Revista SOY SUMMIT (Micheli Gazeta)", 0, 15000, 15000, 15000, 0, 0, 0, ""],
      [185, "Impressão Revista Soy Summit (2000 cópias x 8,99)", 0, 17980, 17980, 17980, 0, 0, 0, ""],
      [186, "Impressão Material Aeroporto", 0, 8700, 8700, 0, 0, 0, 0, ""],
      [187, "Material AEROPORTO", 0, 26000, 26000, 0, 0, 0, 0, ""],
      [188, "Video Aeroporto", 0, 1300, 1300, 0, 0, 0, 0, ""],
      [189, "Locução Video aeroporto", 0, 1500, 1500, 0, 0, 0, 0, ""],
      [191, "Trofeu Berço Nacional da Soja", 0, 0, 0, 0, 0, 0, 0, ""],
      [192, "Contratação Rede Pampa Organização Trofeu", 0, 105000, 105000, 105000, 0, 0, 105000, ""],
      [193, "Jantar de Gala Berço Nacional da Soja (60,00 x 485) Sv a francesa", 0, 29100, 29100, 0, 0, 0, 0, ""],
      [194, "Entradas, sobremesas e alugeul de louças (50,00 x 485)", 0, 24250, 24250, 0, 0, 0, 0, ""],
      [195, "Decoração", 0, 17200, 17200, 0, 0, 0, 0, ""],
      [196, "Aluguel cadeiras e tampão mesas", 0, 6200, 6200, 0, 0, 0, 0, ""],
      [197, "Garçons (50 x 300,00)", 0, 15000, 15000, 0, 0, 0, 0, ""],
      [198, "Telão Palco", 0, 15000, 15000, 0, 0, 0, 0, ""],
      [199, "Bebidas (30 x 450)", 0, 7399.5, 7399.5, 0, 0, 0, 0, ""],
      [200, "Trofeu (12 x 750,00)", 0, 11750, 11750, 0, 0, 0, 0, ""],
      [201, "Alimentação Alunos Guarda de honra", 0, 1470, 1470, 0, 0, 0, 0, ""],
      [202, "Suporte equipe MUÑOZ", 0, 4499, 4499, 0, 0, 0, 0, ""],
      [203, "Staff (83 x 43,00)", 0, 3569, 3569, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 204,
    sourceLabel: "Exporural (GERMANO)",
    commission: "Exporural",
    responsible: "Germano",
    budgetCap: 90000,
    budgetedAmount: 81036,
    rows: [
      [205, "Segurança extra Exporural", 0, 14228, 14228, 0, 0, 0, 0, ""],
      [206, "Roçadas", 0, 15000, 15000, 0, 0, 0, 0, ""],
      [207, "Feno 734 (a R$12,00)", 0, 8808, 8808, 0, 0, 0, 0, ""],
      [208, "Manejo e roçamento", 10000, 15000, 25000, 0, 0, 0, 0, ""],
      [209, "Gastos Extras", 0, 15000, 15000, 0, 0, 0, 0, ""],
      [210, "Gradil Escola da Terra", 0, 3000, 3000, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 211,
    sourceLabel: "Infraestrutura (DJEISON)",
    commission: "Infraestrutura",
    responsible: "Djeison",
    budgetCap: 450000,
    budgetedAmount: 333000,
    rows: [
      [211, "Contratação Técnico de Segurança do Trabalho e Equipe", 0, 15000, 15000, 0, 0, 0, 0, ""],
      [212, "Aquisição de Duas Roçadeiras", 0, 6000, 6000, 0, 0, 0, 0, ""],
      [214, "Porteira Exporural", 0, 2000, 2000, 0, 0, 0, 0, ""],
      [215, "Grama", 0, 60000, 60000, 0, 0, 0, 0, ""],
      [216, "Melhorias e preparação INFRA p a Feira (pintura, reparos, etc)", 0, 250000, 250000, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 219,
    sourceLabel: "Indústria Comércio e SV (TITO)",
    commission: "Indústria, Comércio e Serviços",
    responsible: "Tito",
    budgetCap: 0,
    budgetedAmount: 0,
    rows: [
      [220, "Custos das obras já incluido em investimentos", 0, 0, 0, 0, 0, 0, 0, ""],
      [223, "Salão do Automóvel", 0, 0, 0, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 225,
    sourceLabel: "Novas Gerções (JOSYANE)",
    commission: "Novas Gerações",
    responsible: "Josyane",
    budgetCap: 50000,
    budgetedAmount: 45957,
    rows: [
      [226, "Revista Sojinha (Educare)", 20155, 0, 20155, 0, 0, 0, 0, ""],
      [227, "Impressão Revista Sojinha", 0, 23980, 23980, 0, 0, 0, 0, ""],
      [230, "Ação das Crianças (Brincando com Sojinha)", 0, 1822, 1822, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 231,
    sourceLabel: "Logística, Hotelaria e Turismo (DUDO)",
    commission: "Logística, Hotelaria e Turismo",
    responsible: "Dudo",
    budgetCap: 233000,
    budgetedAmount: 232375,
    rows: [
      [231, "Alimentação Voluntários (R$38,00) (100 vales)", 0, 0, 0, 0, 0, 0, 0, ""],
      [232, "Aluguél dos carros elétricos", 0, 178000, 178000, 178000, 0, 0, 0, ""],
      [234, "Hotel Benos", 0, 4247, 4247, 4247, 0, 0, 0, ""],
      [235, "Hotel Imigrantes", 0, 10128, 10128, 10128, 0, 0, 0, ""],
      [236, "Gastos gerais logíastica", 0, 40000, 40000, 40000, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 238,
    sourceLabel: "Relações Internacional (EVERTON e FABRÍCIO)",
    commission: "Relações Internacionais",
    responsible: "Everton e Fabrício",
    budgetCap: 25000,
    budgetedAmount: 20000,
    rows: [
      [238, "Alimentação Voluntários (R$38,00) (10 vales)", 0, 0, 0, 0, 0, 0, 0, ""],
      [240, "Participação Feira Paraguai", 0, 0, 0, 0, 0, 0, 0, ""],
      [241, "Missão Farm Progres Show (EUA)", 0, 0, 0, 0, 0, 0, 0, ""],
      [242, "Missão Agritechnica (Alemanhã)", 0, 20000, 20000, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 245,
    sourceLabel: "Credenciamento (DANIEL)",
    commission: "Credenciamento",
    responsible: "Daniel",
    budgetCap: 2000,
    budgetedAmount: 0,
    rows: [
    ],
  },
  {
    sourceRow: 248,
    sourceLabel: "Recepção (SIMONE)",
    commission: "Recepção",
    responsible: "Simone",
    budgetCap: 25000,
    budgetedAmount: 23450,
    rows: [
      [248, "Alimentação Voluntários (R$38,00) (40 vales)", 0, 0, 0, 0, 0, 0, 0, ""],
      [249, "Uniformes Recepcionistas (Colete", 0, 0, 0, 0, 0, 0, 0, ""],
      [250, "Água (R$2,50) (300)", 0, 0, 0, 0, 0, 0, 0, ""],
      [251, "Refri (R$4,00) (300)", 0, 0, 0, 0, 0, 0, 0, ""],
      [252, "Vale Água/Refri (R$6,00 300 vales)", 0, 0, 0, 0, 0, 0, 0, ""],
      [253, "Alimentação Recepcionistas (30 vales por dia) R$40,00", 0, 0, 0, 0, 0, 0, 0, ""],
      [254, "Coletes Rotary", 0, 2450, 2450, 0, 0, 0, 0, ""],
      [255, "Repasse Casa Rotária", 0, 20000, 20000, 0, 0, 0, 0, ""],
      [256, "Café com Expositores (Último dia)", 0, 1000, 1000, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 257,
    sourceLabel: "Relações Institucionais (NEDEL)",
    commission: "Relações Institucionais",
    responsible: "Nedel",
    budgetCap: 2000,
    budgetedAmount: 0,
    rows: [
      [257, "Gastos comissão", 0, 0, 0, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 262,
    sourceLabel: "Serviços (CEL VALTAIR)",
    commission: "Serviços",
    responsible: "Cel. Valtair",
    budgetCap: 300000,
    budgetedAmount: 296208,
    rows: [
      [262, "Contratação Limpeza (7.644h x 36,00)", 0, 275184, 275184, 0, 0, 18600, 0, ""],
      [263, "Contratação empresa de recolhimento de resíduos", 0, 18000, 18000, 0, 0, 0, 0, ""],
      [264, "Limpeza EXTRA", 0, 3024, 3024, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 268,
    sourceLabel: "Gastronomia (CALIXTO)",
    commission: "Gastronomia",
    responsible: "Calixto",
    budgetCap: 260000,
    budgetedAmount: 264385.35,
    rows: [
      [268, "Alimentação e bebida GERAL VOLUNTÁRIOS (bebida e comida)", 0, 196679, 196679, 0, 0, 0, 0, ""],
      [269, "Bebidas Apoio Ketten", 0, 30912, 30912, 0, 0, 0, 0, ""],
      [270, "Alimentação ALMOÇOS Restaurante RBS TV", 0, 36794.35, 36794.35, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 272,
    sourceLabel: "Segurança (CEL VANESSA)",
    commission: "Segurança",
    responsible: "Cel. Vanessa",
    budgetCap: 550000,
    budgetedAmount: 521138,
    rows: [
      [272, "Alimentação Voluntários (R$38,00) (700 vales)  foi 684 ano passado", 0, 0, 0, 0, 0, 0, 0, ""],
      [273, "Alimentação Polícia Civíl (R$38,00 x 60 vales)", 0, 0, 0, 0, 0, 0, 0, ""],
      [275, "Contratação Segurança AGG (1350 x 32,40)", 0, 0, 0, 0, 0, 0, 0, "Total 43.740,00 menos p patrocínio de 7.091,00"],
      [276, "Contratação segurança Privada (6300h x 48,00) menos 30mil (302.400 - 30.000)", 0, 267400, 267400, 0, 0, 0, 0, "Total 172.141,80 menos 27.909,00 de patrocínio"],
      [277, "Contratação Segurança EXTRA", 0, 26738, 26738, 0, 0, 0, 0, ""],
      [278, "Contratação EXTRA Segurança e ABRIL", 0, 20000, 20000, 0, 0, 0, 0, ""],
      [280, "SHELTER Câmeras internas e externas (Ficou em troca Shelter Móvel)", 0, 32000, 32000, 0, 0, 0, 0, ""],
      [281, "Brigada Militar", 0, 150000, 150000, 0, 0, 0, 0, ""],
      [282, "Polícia Rodoviária", 0, 25000, 25000, 0, 0, 0, 0, ""],
      [283, "Água (R$2,50) (820)", 0, 0, 0, 0, 0, 0, 0, ""],
      [284, "Refri (R$4,00) (820)", 0, 0, 0, 0, 0, 0, 0, ""],
      [285, "Vale Água/Refri (R$6,00 820 vales)", 0, 0, 0, 0, 0, 0, 0, "Piso na sede da Polícia Rodoviária"],
    ],
  },
  {
    sourceRow: 286,
    sourceLabel: "Soja Store (CARLA)",
    commission: "Soja Store",
    responsible: "Carla",
    budgetCap: 50000,
    budgetedAmount: 40000,
    rows: [
      [287, "Aquisição Produtos", 0, 40000, 40000, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 290,
    sourceLabel: "Shows (VITOR DUTRA)",
    commission: "Shows",
    responsible: "Vitor Dutra",
    budgetCap: 980000,
    budgetedAmount: 977552.84,
    rows: [
      [290, "Repasse Fenasoja p os Show", 0, 375000, 375000, 0, 0, 0, 0, ""],
      [291, "Contratação de 6 Conteiner (Banheiros na Arena)", 0, 39000, 39000, 0, 0, 0, 0, ""],
      [292, "Lançamento dos Shows", 6000, 0, 6000, 0, 0, 0, 0, ""],
      [293, "ECAD (Vitor Dutra)", 0, 77900, 77900, 0, 0, 0, 0, ""],
      [294, "ECAD 2° Etapa", 0, 70000, 70000, 0, 0, 0, 0, ""],
      [295, "Pagamento metade transmição telão", 0, 13800, 13800, 0, 0, 0, 0, ""],
      [296, "Reserva Aplicação Arena 2028", 0, 325000, 325000, 0, 0, 0, 0, ""],
      [297, "Seguro Arena", 0, 7052.84, 7052.84, 0, 0, 0, 0, ""],
      [298, "Contratação Estrutra Dellaflora (visão do mirante)", 0, 8000, 8000, 0, 0, 0, 0, ""],
      [299, "Pagamento Leo e Cauha", 0, 10000, 10000, 0, 0, 0, 0, ""],
      [300, "Aquisição de mais 20 lugares no camarote", 0, 12500, 12500, 0, 0, 0, 0, ""],
      [301, "Aquisição Camarote AUTORIDADES CONVIDADOS", 0, 33300, 33300, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 302,
    sourceLabel: "Prevenção e Combate Incêndio (CAP DAMBROZ)",
    commission: "Prevenção e Combate a Incêndio",
    responsible: "Cap. Dambroz",
    budgetCap: 30000,
    budgetedAmount: 27795,
    rows: [
      [303, "Contratação Bombeiros Civil (14)", 0, 27795, 27795, 27795, 0, 0, 0, ""],
      [304, "Alimentação Bombeiros Civil(R$38,00 x 60 vales)", 0, 0, 0, 0, 0, 0, 0, ""],
    ],
  },
  {
    sourceRow: 306,
    sourceLabel: "Saúde e Bem Estar (ROSA)",
    commission: "Saúde e Bem-Estar",
    responsible: "Rosa",
    budgetCap: 2000,
    budgetedAmount: 0,
    rows: [
      [306, "Alimentação Voluntários (R$38,00) ( 150 vales)", 0, 0, 0, 0, 0, 0, 0, ""],
      [307, "Água (R$2,50) (150)", 0, 0, 0, 0, 0, 0, 0, ""],
      [308, "Refri (R$4,00) (150)", 0, 0, 0, 0, 0, 0, 0, ""],
      [309, "Vale Água/Refri (R$6,00 150 vales)", 0, 0, 0, 0, 0, 0, 0, ""],
    ],
  },
];

const rawGeneralBudgetItems: readonly RawCommitment[] = [
  [311, "Emprestimos Fenasoja 24", 650000, 650000, ""],
  [312, "Pag Fornecedores Fena 24", 77000, 77000, ""],
  [313, "Repasse Musicanto", 100000, 100000, ""],
  [314, "Doações (APAE) Fenasoja 24", 30000, 30000, "(vinculado somente para a obra)"],
  [315, "Cozinha Pav 8 e 12", 215000, 215000, ""],
  [316, "Luz parque FENASOJA 2022", 124000, 124000, ""],
  [317, "Luz parque FENASOJA 2024", 128000, 128000, ""],
  [318, "Portico Portão 04", 0, 0, "Recurso oriundo do MAPA R$600.000,00"],
  [319, "Banheiro Alameda Cav Crioulo", 0, 0, "Recurso oriundo do MAPA R$600.000,00"],
  [320, "Alameda Cav Crioulo", 0, 0, "Recurso oriundo do MAPA R$600.000,00"],
  [321, "Melhorias Parque", 0, 0, ""],
  [322, "Projeto Portão 04 completo", 15000, 15000, ""],
  [323, "Sala Quartel Bombeiros", 15000, 15000, "Contra partida Bombeiros"],
  [324, "Cerca Exporural", 8000, 8000, ""],
  [325, "Reparos Exporural", 10000, 10000, ""],
  [326, "Exporural Tubulações", 110000, 110000, ""],
  [327, "Interligação Pavilhões", 3000, 3000, ""],
  [328, "Reforma Pav 09", 0, 0, ""],
  [329, "Frente Pav 07", 106000, 106000, ""],
  [330, "Reforma Pav 07", 175000, 175000, ""],
  [331, "Reforma Cozinha Banh. Pav.7", 39000, 39000, ""],
  [332, "Recapeamento Asfaltico", 155648.54, 155648.64, ""],
  [333, "Nova Rua", 88088.07, 88088.07, ""],
  [334, "Preparação Teste drive (Britas)", 10000, 0, ""],
  [335, "Preparação área parquinho", 15000, 0, ""],
  [336, "Portão RBS TV", 10000, 0, ""],
  [337, "Preparação ARENA", 20000, 0, "Aterro e fechamento"],
  [338, "Banheiros Pav 08", 0, 0, "Dividir entre as 3 feiras (cota Fenasoja 24mil) 70mil"],
  [339, "Piso Pizzaria Central", 10000, 10000, "Dividir entre as 3 feiras (Cota Fenasoja 10 mil) 30mil"],
  [340, "Piso Pavilhão 01", 0, 0, "Dividir entre as 3 feiras (Cota Fenasoja 50 mil) 150mil"],
  [341, "Doação Proj. Centro Eventos", 50000, 0, ""],
  [342, "Rede Hidráulica", 30000, 0, "Dividir entre as 3 feiras (Cota Fenasoja 30 mil) 90mil"],
];

const rawSponsors: readonly RawSponsor[] = [
  [2, "KETTEN BEBIDAS", 2, 2, "", "X", "", "", "", "", 500000, 500000, 500000, 0, 0, "", 0, ""],
  [3, "PARQUE STTALONNE", 0, 0, "", "", "X", "", "", "", 182000, 182000, 182000, 0, 0, "", 0, ""],
  [4, "COTRIROSA", 4, 0, "", "", "X", "", "", "", 60000, 60000, 60000, 0, 0, "", 0, ""],
  [5, "Cotrirosa Soy Summit", 0, 20, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [6, "Inducal", 0, 0, "", "", "", "", "", "X", 33200, 33200, 33200, 0, 0, "", 0, "(800 toneladas de calcário, valor de R$83,00 a Ton"],
  [7, "SICREDI", 10, 0, "X", "", "", "", "", "", 535000, 535000, 535000, 0, 0, "", 0, ""],
  [8, "Sicredi Soy Summit", 0, 100, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, "Fenasoja irá fornecer 150 convites para o Sicredi (Patrocínio MASTER)"],
  [9, "Sicredi Portões", 0, 0, "", "", "", "", "", "X", 50000, 50000, 50000, 0, 0, "", 0, ""],
  [10, "Sicredi Orgulho Nacional", 0, 0, "", "", "", "", "", "X", 15000, 15000, 15000, 0, 0, "", 0, ""],
  [11, "Sicredi Rádio Parque", 0, 0, "", "", "", "", "", "X", 15000, 15000, 15000, 0, 0, "", 0, ""],
  [12, "Sicredi - REVISTA SOJINHA", 0, 0, "", "", "", "", "", "X", 0, 0, 0, 0, 0, "", 0, ""],
  [13, "Sicredi Exporural", 0, 0, "", "", "", "", "", "X", 35000, 35000, 35000, 0, 0, "", 0, ""],
  [14, "ICATU/Sicredi", 2, 0, "", "X", "", "", "", "", 650000, 650000, 650000, 0, 0, "", 0, ""],
  [15, "GH", 0, 0, "", "X", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [16, "COOPERMIL", 4, 0, "", "", "X", "", "", "", 60000, 60000, 60000, 0, 0, "", 0, ""],
  [17, "Coopermil - REVISTA SOJINHA", 0, 0, "", "", "", "", "", "X", 5000, 5000, 5000, 0, 0, "", 0, "Revista Sojinha"],
  [18, "Coopermil Soy Summit", 0, 20, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [19, "CIEE-RS", 2, 0, "", "", "", "X", "", "", 60000, 60000, 60000, 0, 0, "", 0, ""],
  [20, "CIEE-RS Soy Summit", 0, 40, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, "(patrocínio MASTER)"],
  [21, "ALIBEM", 3, 0, "", "X", "", "", "", "", 100000, 100000, 100000, 75000, 0, "", 0, "Parcelado em 4 de 25.000 (30/06   30/08  30/10   30/12)"],
  [22, "Alibem Soy Summit", 0, 20, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [24, "CARPENEDO PG", 0, 4, "", "", "", "", "", "", 25000, 25000, 0, 0, 25000, "", 25000, ""],
  [25, "FUNDIMISA PG", 0, 0, "", "", "", "", "", "", 25000, 25000, 25000, 0, 0, "", 0, ""],
  [26, "CELENA PG", 0, 10, "", "", "", "", "", "", 25000, 25000, 25000, 0, 0, "", 0, ""],
  [27, "CAMERA PG", 0, 8, "", "", "", "", "", "", 25000, 25000, 25000, 0, 0, "", 0, ""],
  [28, "BOTOLLI PG", 0, 8, "", "", "", "", "", "", 25000, 25000, 25000, 0, 0, "", 0, ""],
  [29, "ALIBEM PG", 0, 8, "", "", "", "", "", "", 25000, 25000, 25000, 25000, 0, "", 0, "Parcelado em 4 de 25.000 (30/06   30/08  30/10   30/12)"],
  [30, "COTRIROSA", 0, 10, "", "", "", "", "", "", 25000, 25000, 25000, 8333.33, 0, "", 0, "3 x 8.333,33 (meses 05, 06, 07)"],
  [31, "COOPERMIL", 0, 10, "", "", "", "", "", "", 25000, 25000, 25000, 8333.33, 0, "", 0, "2 x 8.333,33"],
  [32, "STARA", 0, 8, "", "", "", "", "", "", 25000, 25000, 25000, 0, 0, "", 0, ""],
  [33, "BAYER", 0, 0, "", "", "", "X", "", "", 80000, 80000, 80000, 80000, 0, "", 0, ""],
  [34, "BAYER Soy Summti", 0, 20, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [35, "ACEBRA Soy Summit", 0, 10, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [36, "APROBIO", 0, 10, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [37, "GENERMAC", 2, 0, "", "", "", "", "", "X", 0, 0, 0, 0, 0, "", 0, ""],
  [38, "Genermac Soy Summit", 0, 8, "", "", "", "", "X", "", 0, 0, 0, 0, 0, "", 0, "Genermac irá fornecer Gerador p o Soy Summit sem custos"],
  [39, "TECNICON", 2, 0, "", "", "X", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [40, "COOPERLUZ", 4, 4, "X", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [41, "Cooperluz Cultural", 0, 0, "X", "", "", "", "", "", 40000, 0, 0, 0, 40000, "", 40000, ""],
  [42, "AGROBRAVO", 2, 0, "", "", "", "X", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [43, "Agrobravo Soy Summit", 0, 0, "", "", "", "", "", "X", 0, 0, 0, 0, 0, "", 0, ""],
  [44, "STOCK CENTER", 3, 0, "", "", "X", "", "", "", 120000, 0, 0, 0, 120000, 46090, 120000, ""],
  [45, "QUERO-QUERO", 2, 0, "", "", "X", "", "", "", 60000, 0, 0, 0, 60000, 46020, 60000, ""],
  [46, "Pipi Máquinas Soy Summit", 0, 10, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [47, "Camera Soy Summit", 0, 20, "", "", "", "", "", "", 12500, 12500, 12500, 0, 0, "", 0, ""],
  [48, "SULNET", 2, 2, "", "X", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [49, "HD Distribuidora", 2, 0, "", "", "", "X", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [50, "PREFEITURA", 0, 0, "", "", "", "", "", "", 1030000, 1030000, 1030000, 0, 0, "", 0, ""],
  [51, "Prefeitura Soy Summit", 0, 50, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [52, "CÂMARA DE VEREADORES", 0, 0, "", "", "", "", "", "X", 340000, 340000, 340000, 0, 0, "", 0, "Patrocínio (5mil Revista Sojinha) e 15 pulseira camarote Fenasoj, 25 - Camisetas Polos - Maquina de Café - Geladeira com água e refri"],
  [53, "Câmara PLUS", 0, 0, "", "", "", "", "", "", 10000, 10000, 10000, 0, 0, "", 0, "Ránio Noroeste 8 mil Rádio Mais FM 2mil"],
  [54, "Câmara - REVISTA SOJINHA", 0, 0, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [55, "Câmara Soy Summit", 0, 40, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [56, "Botolli VW", 4, 2, "", "", "", "", "", "X", 0, 0, 0, 0, 0, "", 0, ""],
  [57, "CREA", 2, 0, "", "", "", "X", "", "", 60000, 60000, 60000, 0, 0, "", 0, ""],
  [58, "CRESOL", 2, 5, "", "", "", "X", "", "", 60000, 60000, 60000, 0, 0, "", 0, ""],
  [59, "Cresol Pav Agroindustrias", 0, 0, "", "", "", "", "", "X", 13709, 13709, 13709, 0, 0, "", 0, ""],
  [60, "CORSAN/AEGEA", 2, 0, "", "", "X", "", "", "", 100000, 100000, 100000, 100000, 0, "", 0, ""],
  [61, "ERVATEIRA TOMELERO", 4, 0, "", "", "", "", "", "X", 15000, 15000, 15000, 0, 0, "", 0, ""],
  [62, "BANRISUL", 4, 0, "", "", "X", "", "", "", 228000, 228000, 228745, "pago", 0, "", 0, "tínhamos pedido 330.000,00"],
  [63, "BANCO DO BRASIL", 2, 0, "", "", "", "", "", "", 0, 35000, 35000, 35000, 0, "", 0, ""],
  [64, "CAIXA", 4, 0, "", "", "X", "", "", "", 150000, 150000, 150000, 150000, 0, "", 0, ""],
  [65, "SEBRAE", 4, 0, "", "X", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [66, "Badesul Soy Summit", 0, 0, "", "", "", "", "", "X", 12500, 12500, 12500, 12000, 0, "", 0, ""],
  [67, "Sebrae Soy Summit", 0, 35, "", "", "", "", "", "X", 0, 0, 0, 0, 0, "", 0, ""],
  [68, "CRVR", 2, 0, "", "", "", "X", "", "", 60000, 60000, 20000, 0, 40000, "", 0, ""],
  [69, "CRVR", 0, 8, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [70, "OCERGS", 2, 0, "", "", "", "X", "", "", 60000, 60000, 60000, 0, 0, "", 0, ""],
  [71, "Grupo FELICE", 2, 0, "", "", "", "X", "", "", 60000, 60000, 60000, 0, 0, "", 0, ""],
  [72, "Viação OURO e PRATA", 2, 0, "", "", "", "X", "", "", 0, 0, 0, 0, 0, "", 0, "Quilometragem para Agricultores"],
  [73, "DETRAN/RS", 2, 0, "", "", "", "X", "", "", 60000, 60000, 60000, 0, 0, "", 0, ""],
  [74, "BRDE", 2, 0, "", "", "", "X", "", "", 33750, 33750, 33750, 0, 0, "", 0, ""],
  [75, "UNIJUI", 2, 0, "", "", "X", "", "", "", 30000, 30000, 30000, "pago", 0, "", 0, 46183],
  [76, "Unijui Soy Summit SEMENTE", 0, 8, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [77, "HAVAN", 2, 0, "", "X", "", "", "", "", 180000, 0, 0, 0, 180000, 46106, 180000, ""],
  [78, "Central Auto Peças", 2, 0, "", "", "", "", "", "X", 35000, 0, 0, 0, 35000, 46052, 35000, "Espaço do Automóvel"],
  [79, "Via Certa", 2, 0, "", "", "", "X", "", "", 60000, 0, 0, 0, 60000, 46020, 60000, ""],
  [80, "Via  Certa Soy Summit", 0, 20, "", "", "", "", "", "", 12500, 0, 0, 0, 12500, 46021, 12500, ""],
  [81, "Embrapa Soy Summit", 0, 0, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [82, "Emater Soy Summit", 0, 80, "", "", "", "", "", "X", 0, 0, 0, 0, 0, "", 0, ""],
  [83, "CARPENEDO CCL", 2, 8, "", "", "", "", "", "X", 15000, 0, 0, 0, 15000, 46080, 15000, "Revista Sojnha"],
  [84, "AENORGS Soy Summit", 0, 120, "", "", "", "", "", "", 12500, 12500, 12500, 0, 0, "", 0, ""],
  [85, "Semear Agro Hub Soy Summit", 0, 10, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [86, "LACTALIS", 2, 0, "", "X", "", "", "", "", 283721.02, 0, 0, 0, 284000, 46119, 284000, ""],
  [87, "Lactalis Soy Summit", 0, 10, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [88, "Vencal", 0, 0, "", "", "", "", "", "X", 40000, 0, 0, 0, 40000, 46104, 40000, ""],
  [89, "Protefort", 2, 0, "", "", "", "", "", "X", 0, 0, 0, 0, 0, "", 0, ""],
  [90, "Shelter", 2, 0, "", "", "", "", "", "X", 0, 0, 0, 0, 0, "", 0, ""],
  [91, "Acisap/ AgroMove", 2, 5, "", "", "", "", "", "X", 0, 0, 0, 0, 0, "", 0, ""],
  [92, "Rádio Fema", 0, 0, "", "", "", "", "", "X", 0, 0, 0, 0, 0, "", 0, ""],
  [93, "Integra", 27, 5, "", "", "", "", "", "X", 0, 0, 0, 0, 0, "", 0, ""],
  [94, "Voluntários Fenasoja", 0, 15, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [95, "CCP", 0, 20, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [96, "Setrem", 0, 15, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [97, "Escola Fronteira Noroeste", 0, 15, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [98, "Amufron", 0, 20, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [99, "Sindilojas", 2, 0, "", "", "", "", "", "X", 0, 0, 0, 0, 0, "", 0, ""],
  [100, "Casas Rotaria", 0, 0, "", "", "", "", "", "X", 0, 0, 0, 0, 0, "", 0, ""],
  [101, "AD", 0, 0, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
  [102, "Etnias", 65, 0, "", "", "", "", "", "", 0, 0, 0, 0, 0, "", 0, ""],
];

const rawRevenueSources: readonly RawRevenue[] = [
  [107, "Pav 1", 405010, 405126, 0],
  [108, "Pav 3", 477573, 478851, 0],
  [109, "Pav 5", 55456, 54058, 0],
  [110, "Pav 7 (Agroindustrias SDR)", 220000, 220000, 220000],
  [111, "Pav 7 (Agroindústrias venda direta)", 21060, 21060, 0],
  [112, "Pav 8", 184123, 184123, 0],
  [113, "Pav 12", 365094, 365094, 0],
  [114, "Pav 13", 263664, 263664, 0],
  [115, "Pav 14", 350745, 350745, 0],
  [116, "Exporural", 811749.82, 656698, 0],
  [117, "Area Externa", 1157469.69, 941943, 0],
  [118, "Gastronomia (Está junto 1 edições do Restaurante Central , 1 Restaurante Fenasoja e 1 Churrascaria)", 420000, 436700, 0],
  [119, "Rádio Parque Fenasoja", 15000, 0, 0],
  [120, "Comercialização Rádio Parque (10% do líquido Percentual p a Fema)", 29000, 5000, 0],
  [121, "Bilheteria Estacionamento (26.572  Receita 674.150,00)", 408000, 408212.5, 0],
  [122, "Covatti Filho (Via Prefeitura) (entraPróxima feira(250mil", 0, 0, 0],
  [123, "Fonte não identificada — linha 123", 433000, 433000, 0],
  [124, "Patrocínio dois carros elétrico BANCO DO BRASIL", 0, 0, 0],
  [125, "Indumóveis", 80000, 93432.42, 93432.42],
  [126, "Hortigranjeiros", 80000, 93432.42, 93432.42],
  [127, "Acisap (Ingresso Paulo Guedes)", 0, 75000, 0],
  [128, "Restaurante Fenasoja", 0, 0, 0],
  [130, "Luz Pontos de Alimentação", 30000, 20000, 0],
];

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function classifyExpense(description: string): ExpenseCategory {
  const value = normalizeSearchValue(description);

  if (/reserva|nao previstos/.test(value)) return 'Reservas';
  if (/investimento|edicao|fenasoja 2022|fenasoja 2024/.test(value)) {
    return 'Obrigações de Edições Anteriores';
  }
  if (/seguranca|bombeiro|brigada|policia|extintor|monitoramento/.test(value)) return 'Segurança';
  if (/alvara|taxa|seguro|licenca/.test(value)) return 'Taxas, Seguros e Licenças';
  if (/radio|jornal|revista|marketing|site|outdoor|impresso|placa|fotografia|midia|painel led|divulgacao|camisa|chapeu|tv /.test(value)) {
    return 'Marketing e Comunicação';
  }
  if (/aliment|refeic|hotel|hosped|agua|refri|bebida|cafe|jantar|lanche|cozinha|restaurante/.test(value)) {
    return 'Alimentação e Hospitalidade';
  }
  if (/logistica|transporte|carro eletrico|quilometr|aeroporto|viagem/.test(value)) {
    return 'Logística e Transporte';
  }
  if (/obra|pavilh|reforma|portico|banheiro|asfalto|piso|cerca|tubul|alameda|nova rua|estrutura|montagem|gradil|pintura|aterro/.test(value)) {
    return 'Infraestrutura e Obras';
  }
  if (/equipe|staff|voluntar|jornalista|recepcion|tecnico|assessoria|secretaria|palestrante|artista/.test(value)) {
    return 'Pessoal e Equipes';
  }
  if (/show|palestra|trofeu|premiacao|evento|lancamento|decoracao|atracao|cultural|soy summit/.test(value)) {
    return 'Eventos e Produção';
  }
  if (/equipamento|material|aquisicao|gerador|impressora|mobiliario/.test(value)) {
    return 'Equipamentos e Materiais';
  }
  if (/contratacao|servico|limpeza|locacao|aluguel|manutencao|dedetizacao/.test(value)) {
    return 'Serviços Operacionais';
  }
  return 'Não classificado';
}

function normalizeExpense(row: RawExpenseRow): FinancialExpenseSourceRow {
  const [
    sourceRow,
    description,
    value2025,
    value2026,
    realizedAmount,
    paidWithFreeResource,
    municipalityPlanAmount,
    rouanetAmount,
    paidMarkerAmount,
    observation,
  ] = row;

  return {
    id: `expense-${sourceRow}`,
    sourceRow,
    description,
    category: classifyExpense(description),
    value2025,
    value2026,
    realizedAmount,
    paidWithFreeResource,
    municipalityPlanAmount,
    rouanetAmount,
    paidMarkerAmount,
    ...(observation ? { observation } : {}),
  };
}

export const commissionBudgetSources: readonly CommissionBudgetSource[] = rawCommissionBlocks.map((block) => ({
  id: `commission-${block.sourceRow}`,
  sourceStartRow: block.sourceRow,
  sourceLabel: block.sourceLabel,
  commission: block.commission,
  ...(block.responsible ? { responsible: block.responsible } : {}),
  budgetCap: block.budgetCap,
  budgetedAmount: block.budgetedAmount,
  expenses: block.rows.map(normalizeExpense),
}));

export const generalBudgetItems: readonly GeneralBudgetItem[] = rawGeneralBudgetItems.map(
  ([sourceRow, description, budgetCap, budgetedAmount, observation]) => ({
    id: `commitment-${sourceRow}`,
    sourceRow,
    description,
    kind: sourceRow <= 317 ? 'historical-obligation' : 'investment',
    budgetCap,
    budgetedAmount,
    ...(observation ? { observation } : {}),
  }),
);

function resolveSponsorTier(row: RawSponsor): SponsorTier {
  const [, , , , graoDeOuro, ouro, prata, bronze, soySummit, outrosApoios] = row;
  if (graoDeOuro) return 'Grão de Ouro';
  if (ouro) return 'Ouro';
  if (prata) return 'Prata';
  if (bronze) return 'Bronze';
  if (soySummit) return 'Soy Summit';
  if (outrosApoios) return 'Outros Apoios';
  return 'Não classificado';
}

export const sponsors: readonly Sponsor[] = rawSponsors.map((row) => {
  const [
    sourceRow,
    name,
    vehicleCredentials,
    soySummitCredentials,
    , , , , , ,
    declaredValue,
    projectedFreeResource,
    consolidatedFreeResource,
    receivableRaw,
    projectedRouanet,
    receivedOn,
    consolidatedRouanet,
    inKindContribution,
  ] = row;
  const hasDateLikeContributionAnomaly = sourceRow === 75 && inKindContribution === 46183;

  return {
    id: `sponsor-${sourceRow}`,
    sourceRow,
    name,
    tier: resolveSponsorTier(row),
    vehicleCredentials,
    soySummitCredentials,
    declaredValue,
    projectedFreeResource,
    consolidatedFreeResource,
    receivableAmount: typeof receivableRaw === 'number' ? receivableRaw : 0,
    ...(typeof receivableRaw === 'string' && receivableRaw
      ? { receivableNote: receivableRaw }
      : {}),
    projectedRouanet,
    consolidatedRouanet,
    ...(receivedOn !== '' ? { receivedOn } : {}),
    ...(inKindContribution !== '' && !hasDateLikeContributionAnomaly
      ? { inKindContribution }
      : {}),
    ...(hasDateLikeContributionAnomaly
      ? {
        sourceQualityFlag: {
          code: 'DATE_LIKE_VALUE_IN_CONTRIBUTION_COLUMN' as const,
          cell: 'Q75',
          rawValue: inKindContribution,
        },
      }
      : {}),
  };
});

function classifyRevenue(source: string): RevenueCategory {
  const value = normalizeSearchValue(source);
  if (/pav\.?\s|pavilh/.test(value)) return 'Comercialização de pavilhões';
  if (/exporural/.test(value)) return 'Exporural';
  if (/area externa/.test(value)) return 'Área externa';
  if (/gastronomia|restaurante|alimentacao/.test(value)) return 'Gastronomia';
  if (/bilheteria|estacionamento/.test(value)) return 'Bilheteria e estacionamento';
  if (/radio|midia/.test(value)) return 'Rádio e mídia';
  if (/ingresso|evento|trofeu/.test(value)) return 'Eventos';
  return 'Outras receitas';
}

const sponsorshipRevenue: FinancialRevenue = {
  id: 'revenue-sponsorship-summary',
  sourceRow: 106,
  source: 'Recursos Livres + Rouanet',
  ecosystem: 'sponsorship',
  category: 'Patrocínios',
  fundingType: 'Misto',
  projectedAmount: 5899659,
  consolidatedAmount: 5795404,
  receivableAmount: 493666.66,
  projectedFreeResource: 4988159,
  consolidatedFreeResource: 4923904,
  projectedRouanet: 911500,
  consolidatedRouanet: 871500,
  notes: 'A receber informado em Receitas!M103; não equivale à lacuna de consolidação.',
};

export const revenueSources: readonly FinancialRevenue[] = [
  sponsorshipRevenue,
  ...rawRevenueSources.map(([sourceRow, source, projectedAmount, consolidatedAmount, receivableAmount]) => ({
    id: `revenue-${sourceRow}`,
    sourceRow,
    source: source || 'Sem descrição na fonte',
    ecosystem: 'commercial' as const,
    category: classifyRevenue(source),
    fundingType: 'Não identificado' as const,
    projectedAmount,
    consolidatedAmount,
    receivableAmount,
    projectedFreeResource: 0,
    consolidatedFreeResource: 0,
    projectedRouanet: 0,
    consolidatedRouanet: 0,
  })),
];

export const financialScenarios: readonly FinancialScenario[] = [
  {
    id: 'realistic',
    label: 'Realista',
    commercialization: 2046838.75,
    exporural: 811749.69,
    externalArea: 1157469.82,
    agroindustryPavilion: 220000,
    foodPoints: 420000,
    parking: 549525,
    commercialRevenue: 5205583.26,
    freeSponsorship: 3000000,
    rouanetSponsorship: 1000000,
    totalRevenue: 9205583.26,
    operatingExecution: 6519000,
    historicalObligations: 891000,
    reserve: 200000,
    // PROJEÇÃO 2026!C18 is hardcoded at 0.06 below the arithmetic bridge.
    investmentCapacity: 1595583.2,
    negativeResult: 0,
  },
  {
    id: 'pessimistic',
    label: 'Pessimista',
    commercialization: 1637471,
    exporural: 649399.75,
    externalArea: 925975.85,
    agroindustryPavilion: 75000,
    foodPoints: 336000,
    parking: 439620,
    commercialRevenue: 4063466.6,
    freeSponsorship: 2310000,
    rouanetSponsorship: 600000,
    totalRevenue: 6973466.6,
    operatingExecution: 6519000,
    historicalObligations: 891000,
    reserve: 0,
    investmentCapacity: 0,
    negativeResult: 436533.4,
  },
  {
    id: 'optimistic',
    label: 'Otimista',
    commercialization: 2046838.75,
    exporural: 811749.69,
    externalArea: 1157469.82,
    agroindustryPavilion: 220000,
    foodPoints: 420000,
    parking: 659425,
    commercialRevenue: 5315483.26,
    freeSponsorship: 4000000,
    rouanetSponsorship: 1000000,
    totalRevenue: 10315483.26,
    operatingExecution: 6519000,
    historicalObligations: 891000,
    reserve: 500000,
    // PROJEÇÃO 2026!I18 is hardcoded at 0.04 above the arithmetic bridge.
    investmentCapacity: 2405483.3,
    negativeResult: 0,
  },
];

export const financialWorkbookTotals: FinancialWorkbookTotals = {
  coreCommissionBudgetCap: 9050000,
  coreCommissionBudgeted: 8517050.14,
  generalBudgetCap: 11243736.61,
  generalBudgeted: 10575786.85,
  projectedRevenue: 11706603.51,
  consolidatedRevenue: 11301543.34,
  sponsorshipProjected: 5899659,
  sponsorshipConsolidated: 5795404,
  sponsorshipReceivableReported: 493666.66,
  commercialReceivableReported: 406864.84,
  paidWithFreeResource: 1033487.5,
  municipalityPlanAmount: 44650,
  rouanetAmount: 148368.36,
};

export const financialReports: readonly FinancialReportDefinition[] = [
  {
    id: 'executive-summary',
    title: 'Resumo Financeiro Executivo',
    description: 'Leitura consolidada de receita, orçamento, execução e capacidade.',
    route: 'dashboard',
    insight: 'Quanto a base 2026 projeta, consolida e compromete.',
  },
  {
    id: 'revenue-comparison',
    title: 'Receita Projetada x Consolidada',
    description: 'Comparação por fonte sem confundir consolidação com recebimento.',
    route: 'receitas-confirmadas',
    insight: 'Onde permanece a lacuna de consolidação.',
  },
  {
    id: 'revenue-source',
    title: 'Receita por Fonte',
    description: 'Composição comercial e institucional da receita.',
    route: 'receitas-projetadas',
    insight: 'Quais frentes sustentam a projeção financeira.',
  },
  {
    id: 'sponsorships',
    title: 'Patrocínios',
    description: 'Captação por tier, recurso e situação financeira.',
    route: 'patrocinios',
    insight: 'Quanto foi projetado, consolidado e informado a receber.',
  },
  {
    id: 'expense-commission',
    title: 'Despesas por Comissão',
    description: 'Distribuição dos lançamentos da planilha por comissão.',
    route: 'despesas-previstas',
    insight: 'Quais comissões concentram o orçamento.',
  },
  {
    id: 'expense-category',
    title: 'Despesas por Categoria',
    description: 'Taxonomia analítica com descrição original preservada.',
    route: 'despesas-previstas',
    insight: 'Quais naturezas de despesa mais pressionam o plano.',
  },
  {
    id: 'commission-budget',
    title: 'Orçamento por Comissão',
    description: 'Teto, orçado, saldo e utilização por comissão.',
    route: 'orcamento-comissoes',
    insight: 'Quem está abaixo, próximo ou acima do teto.',
  },
  {
    id: 'budget-utilization',
    title: 'Utilização Orçamentária',
    description: 'Ranking gerencial de consumo do teto financeiro.',
    route: 'orcamento-comissoes',
    insight: 'Onde a atenção executiva é mais urgente.',
  },
  {
    id: 'funding-origin',
    title: 'Origem dos Recursos',
    description: 'Leitura dos registros de Recurso Livre, Prefeitura e Rouanet.',
    route: 'despesas-realizadas',
    insight: 'Como os pagamentos e fontes informadas se distribuem.',
  },
  {
    id: 'scenarios',
    title: 'Cenários Financeiros',
    description: 'Comparação Realista, Pessimista e Otimista da planilha.',
    route: 'simulacoes',
    insight: 'Como receita, obrigações e reserva alteram a capacidade.',
  },
];
