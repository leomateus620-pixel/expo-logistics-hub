import { FENASOJA_2028_COLORS as brand } from '@/lib/fenasoja-brand';
import type { WorkerDefinition, WorkerId } from './types';

export const workerCatalog: readonly WorkerDefinition[] = [
  {
    id: 'agenda', name: 'Agenda', shape: 'cubo', color: brand.blue, ink: '#1458A7',
    tagline: 'O dia em ordem. A feira em movimento.', description: 'Seu olhar atento para eventos, responsáveis e tudo o que precisa acontecer na hora certa.',
    skills: [{ title: 'Seu próximo compromisso', description: 'Consulte eventos e subeventos da Agenda Fenasoja.' }, { title: 'Uma visão do dia', description: 'Reúna horários, responsáveis e compromissos acessíveis.' }, { title: 'Conexões importantes', description: 'Investigue conflitos entre a agenda e os espaços de eventos.' }],
    data: ['Agenda Fenasoja', 'Subeventos', 'Responsáveis'], access: 'Pessoas que podem consultar a agenda. Cada consulta respeita o seu escopo.', capabilities: [],
    futureActions: [],
    examples: ['Quantos eventos eu fiz neste mês?', 'Mostre um gráfico de barras das pessoas com mais eventos neste mês.', 'Quais são os eventos de amanhã?'],
    routines: [{ title: 'Amanhã, sem surpresas', schedule: 'Dias úteis · 08:00', prompt: '@agenda Todo dia útil às 8h, prepare um briefing dos eventos de amanhã e dos conflitos com o Restaurante.' }],
  },
  {
    id: 'arena', name: 'Arena', shape: 'favo', color: brand.orange, ink: '#9A480C',
    tagline: 'Cada espaço, uma boa experiência.', description: 'Uma companhia para consultar a operação do Restaurante e da Arena, dos horários à ocupação.',
    skills: [{ title: 'Espaços e horários', description: 'Confira eventos e a ocupação dos espaços.' }, { title: 'Operação preparada', description: 'Consulte os períodos de ocupação e os eventos visíveis.' }, { title: 'Disponibilidade', description: 'Investigue horários e possíveis conflitos de ocupação.' }],
    data: ['Restaurante e Arena', 'Ocupação', 'Disponibilidade'], access: 'Quem tem acesso aos Eventos de Espaço. Informações sensíveis mantêm sua permissão específica.', capabilities: ['venue_events_access'],
    futureActions: ['Salvar uma nota nova em evento'],
    examples: ['Quais eventos estão previstos na Arena?', 'Como está a ocupação dos próximos eventos?', 'Existe conflito entre o Restaurante e a Agenda Fenasoja?'],
    routines: [{ title: 'Espaços preparados', schedule: 'Dias úteis · 08:00', prompt: '@arena Quero consultar a ocupação e os possíveis conflitos dos espaços.' }],
  },
  {
    id: 'mapa', name: 'Mapa', shape: 'onigiri', color: brand.green, ink: '#086E59',
    tagline: 'Uma visão clara de cada oportunidade.', description: 'Encontre o que precisa no Mapa Comercial, com atenção às vendas em aberto, aos lotes e seus vínculos.',
    skills: [{ title: 'Inventário em contexto', description: 'Consulte lotes e segmentos que você pode acessar.' }, { title: 'Venda em aberto', description: 'Diferencie vendas abertas de vendas confirmadas.' }, { title: 'Detalhes comerciais', description: 'Consulte pedidos e vínculos de contratos com a permissão adequada.' }],
    data: ['Mapa Comercial', 'Inventário', 'Vendas e contratos'], access: 'Quem pode consultar o Mapa Comercial. Detalhes de venda exigem a permissão comercial correspondente.', capabilities: ['map.view'],
    futureActions: ['Iniciar uma negociação', 'Reservar um lote'],
    examples: ['Como estão as vendas do mapa comercial?', 'Quais vendas em aberto estão sem contrato?', 'Me mostre o inventário que posso consultar.'],
    routines: [{ title: 'Panorama comercial', schedule: 'Dias úteis · 08:00', prompt: '@mapa Todo dia útil às 8h, consulte vendas em aberto há mais de 7 dias. Pergunte qual projeto comercial usar.' }],
  },
  {
    id: 'interesse', name: 'Interesse', shape: 'nuvem', color: '#F472B6', ink: '#A02768',
    tagline: 'Sinais de interesse, próximos passos.', description: 'Acompanhe como as áreas públicas despertam interesse, com uma visão interna do funil comercial.',
    skills: [{ title: 'Links em perspectiva', description: 'Compare o interesse nos links públicos acessíveis.' }, { title: 'Funil por área', description: 'Observe o movimento por área e pavilhão.' }, { title: 'Follow-up interno', description: 'Organize perguntas e próximos passos sem enviar mensagens.' }],
    data: ['Links públicos', 'Interesse por área'], access: 'Quem gerencia vendas ou administra o Mapa Comercial.', capabilities: ['map.manage_sales', 'map.admin'],
    futureActions: [], examples: ['Qual link público teve mais interesse esta semana?', 'Como está o interesse por pavilhão?', 'Quais áreas merecem atenção comercial?'],
    routines: [{ title: 'Sinais da semana', schedule: 'Segundas · 08:00', prompt: '@interesse Quero planejar uma leitura semanal do interesse nos links públicos.' }],
  },
  {
    id: 'comissao', name: 'Comissão', shape: 'mochi', color: '#7C6FE0', ink: brand.mutedIndigo,
    tagline: 'Todo mundo na mesma página.', description: 'Conecte responsáveis, pendências e ações da sua comissão sem perder o contexto das reuniões.',
    skills: [{ title: 'Quem faz o quê', description: 'Consulte as comissões e seus responsáveis.' }, { title: 'Pendências em foco', description: 'Reúna ações de reunião que você pode acessar.' }, { title: 'Agenda da comissão', description: 'Encontre eventos vinculados às suas frentes de trabalho.' }],
    data: ['Comissões', 'Responsáveis', 'Ações de reunião'], access: 'Membros da organização, limitados aos vínculos e permissões existentes. Comissão Central somente para administradores.', capabilities: [],
    futureActions: [], examples: ['Quais são as pendências da minha comissão?', 'Quem são os responsáveis da comissão?', 'Quais ações de reunião ainda precisam de acompanhamento?'],
    routines: [{ title: 'Comissão em dia', schedule: 'Dias úteis · 08:00', prompt: '@comissao Quero planejar um resumo das pendências e dos próximos compromissos da minha comissão.' }],
  },
  {
    id: 'logistica', name: 'Logística', shape: 'paralelogramo', color: '#38BDF8', ink: '#075B83',
    tagline: 'O cuidado que faz tudo chegar.', description: 'Transporte, frota e operação vistos em conjunto, para você encontrar o caminho da informação.',
    skills: [{ title: 'Transportes à vista', description: 'Consulte a programação e o estado dos transportes.' }, { title: 'Mobilidade na feira', description: 'Consulte reservas de carrinhos e patinetes.' }, { title: 'Frota e escala', description: 'Encontre os dados operacionais disponíveis para você.' }],
    data: ['Transportes', 'Frota', 'Carrinhos e patinetes', 'Escala'], access: 'Pessoas com acesso completo à logística.', capabilities: ['full_access'],
    futureActions: [], examples: ['Quais transportes estão programados?', 'Como estão as reservas de carrinhos?', 'Me mostre a frota disponível para consulta.'],
    routines: [{ title: 'Operação em vista', schedule: 'Dias úteis · 08:00', prompt: '@logistica Todo dia útil às 8h, consulte os registros de clima disponíveis para os transportes.' }],
  },
  {
    id: 'caixa', name: 'Caixa', shape: 'hexagono', color: brand.gold, ink: '#806008',
    tagline: 'Os números, com o contexto certo.', description: 'Uma leitura agregada do orçamento e da execução financeira, sempre a partir dos relatórios oficiais.',
    skills: [{ title: 'Visão agregada', description: 'Consulte o resumo financeiro da edição.' }, { title: 'Planejado e executado', description: 'Compare orçamento e execução pelos relatórios existentes.' }, { title: 'Comparações úteis', description: 'Explore comparações de despesas sem acessar dados desnecessários.' }],
    data: ['Resumos financeiros', 'Orçamento e execução'], access: 'Quem tem acesso explícito à Gestão Financeira. Acesso genérico à operação não substitui essa permissão.', capabilities: ['financial_access'],
    futureActions: [], examples: ['Qual é o resumo financeiro agregado da edição?', 'Como está o orçamento em relação à execução?', 'Me mostre a comparação agregada de despesas.'],
    routines: [{ title: 'Orçamento em perspectiva', schedule: 'Segundas · 08:00', prompt: '@caixa Quero planejar uma consulta semanal do orçamento e da execução financeira.' }],
  },
  {
    id: 'radar', name: 'Radar', shape: 'triangulo', color: '#14B8A6', ink: '#087368',
    tagline: 'Um olhar atento ao que vem de fora.', description: 'Pesquise informações externas relevantes para a Fenasoja, com fonte, data e caminho para conferir.',
    skills: [{ title: 'Pesquisa com fontes', description: 'Busque informações externas com título, URL e data.' }, { title: 'Contexto do agro', description: 'Explore assuntos que ajudam a preparar a feira.' }, { title: 'Informação verificável', description: 'Separe dados encontrados de conteúdo que ainda precisa de confirmação.' }],
    data: ['Pesquisa web', 'Fontes públicas'], access: 'Todas as pessoas autenticadas na Fenasoja. A pesquisa externa depende da conexão do serviço de busca.', capabilities: [],
    futureActions: [], examples: ['Qual é o presidente atual da Fenasoja?', 'Pesquise notícias recentes sobre a Fenasoja, com fontes.', 'Quais tendências do agro podem ser relevantes para a feira?'],
    routines: [{ title: 'Fique por dentro', schedule: 'Segundas · 08:00', prompt: '@radar Quero planejar um briefing com fontes sobre a feira e o agro.' }],
  },
];

export function getWorker(id?: string | null): WorkerDefinition | undefined { return workerCatalog.find(worker => worker.id === id); }
export function workerChatLink(id: WorkerId, prompt?: string): string { return `/equipe-ia?worker=${id}${prompt ? `&prompt=${encodeURIComponent(prompt)}` : ''}`; }
export const workerNeverActions = ['Apagar registros ou histórico', 'Movimentar dinheiro ou confirmar pagamentos', 'Confirmar, cancelar ou revisar vendas', 'Enviar mensagens para outras pessoas', 'Publicar mapa ou alterar links públicos', 'Mudar preços, geometria, usuários ou permissões'];
