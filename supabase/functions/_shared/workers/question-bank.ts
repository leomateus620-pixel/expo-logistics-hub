/** Reviewed query playbooks, never an answer cache. The provider interprets new
 * phrasing; only closed tools can resolve facts under the current caller's RLS. */
export interface QuestionPlaybook {
  id: string; worker: 'mapa' | 'agenda'; topic: string; terms: string[];
  tool: string; strategy: string; examples: string[];
}
const agenda = (id: string, topic: string, terms: string[], tool: string, strategy: string, examples: string[]): QuestionPlaybook => ({ id: `agenda-${id}`, worker: 'agenda', topic, terms, tool, strategy, examples });
const map = (id: string, topic: string, terms: string[], tool: string, strategy: string, examples: string[]): QuestionPlaybook => ({ id: `mapa-${id}`, worker: 'mapa', topic, terms, tool, strategy, examples });
export const questionPlaybooks: readonly QuestionPlaybook[] = [
  agenda('pessoal', 'Minha Agenda', ['meus','minhas','eu','mim','vinculado','criei','responsabilidade'], 'agenda_personal_summary', 'Identidade autenticada; distinguir criação, responsabilidade e vínculo. Quantidades usam agregado; listas e filtros usam agenda_query com relationship. Nunca inferir presença.', [
    'Quantos eventos eu fiz neste mês?', 'Quais são meus eventos desta semana?', 'Quantos eventos eu criei em outubro?', 'Quais eventos estão sob minha responsabilidade?', 'A quais eventos estou vinculado hoje?', 'Quantos compromissos meus já têm data passada?', 'Quais dos meus eventos ainda estão agendados?', 'Qual foi a duração média prevista dos meus eventos?', 'Mostre meus eventos em uma tabela.', 'Como ficou minha Agenda no mês anterior?',
  ]),
  agenda('periodos', 'Datas e períodos', ['hoje','amanha','semana','mes','ano','periodo','proximos'], 'agenda_query', 'Resolver datas civis em São Paulo, intervalo explícito prevalece. Sobreposição inclui eventos atravessando o período. Sem período para lista: pedir ou usar período solicitado, nunca trocar mês por edição.', [
    'Quais eventos acontecem hoje?', 'O que está programado para amanhã?', 'Mostre a programação desta semana.', 'Quantos eventos existem neste mês?', 'Quais eventos começam no próximo mês?', 'O que está marcado entre 10 e 20 de novembro?', 'Quais eventos atravessam a virada do mês?', 'Quais eventos acontecem no fim de semana?', 'Quais são os próximos compromissos da Agenda?', 'Como está a programação de dezembro de 2026?',
  ]),
  agenda('situacoes', 'Andamento dos eventos', ['situacao','status','concluidos','cancelados','andamento','planejados','pendentes'], 'agenda_query', 'Status explícito fechado; cancelados apenas se pedidos. Concluído é estado cadastrado, data passada não comprova realização. Pizza somente partição completa.', [
    'Quantos eventos estão concluídos neste mês?', 'Quais eventos foram cancelados em outubro?', 'Quais eventos estão em andamento?', 'Mostre os eventos planejados desta semana.', 'Quais eventos aguardam definição?', 'Quais eventos aguardam responsável?', 'Faça um gráfico de pizza por situação dos eventos.', 'Compare eventos planejados e concluídos.', 'Qual a distribuição de situações da minha Agenda?', 'Quais eventos concluídos estavam sob minha responsabilidade?',
  ]),
  agenda('pessoas', 'Pessoas e vínculos', ['pessoas','pessoa','quem','ranking','vinculos','responsaveis'], 'agenda_people_ranking', 'Eventos distintos por identidade persistida e RLS. Ranking agregado completo antes do top. Pessoa nominal exige resolução de identidade sem escolher homônimo; indisponível pedir identificador autorizado.', [
    'Quem tem mais eventos neste mês?', 'Mostre um gráfico de barras das pessoas com mais eventos.', 'Quais são as dez pessoas com mais vínculos na Agenda?', 'Há pessoas empatadas no ranking deste mês?', 'Mostre uma tabela do ranking de pessoas.', 'Quem concentra mais eventos no mês anterior?', 'Quantas pessoas aparecem no ranking deste período?', 'Compare a quantidade de eventos das pessoas mais vinculadas.', 'Qual pessoa tem a maior quantidade de eventos autorizados?', 'Como ficou o ranking das pessoas em setembro de 2026?',
  ]),
  agenda('locais', 'Locais da programação', ['local','locais','restaurante','centro','sala','onde'], 'agenda_query', 'Filtrar local persistido, agrupamento location. Contar cada evento uma vez; localização não implica reserva ou ausência de conflitos.', [
    'Onde serão os eventos de hoje?', 'Quantos eventos estão no Centro de Eventos neste mês?', 'Quais eventos estão na Sala dos Voluntários?', 'Mostre os eventos do Restaurante nesta semana.', 'Qual local concentra mais eventos?', 'Faça um gráfico de eventos por local.', 'Quais eventos não possuem local informado?', 'Compare a programação entre os locais cadastrados.', 'Liste meus eventos no Centro de Eventos.', 'Como se distribuem os eventos por local no mês anterior?',
  ]),
  agenda('categorias', 'Categorias da Agenda', ['categoria','categorias','tipo','tipos','reunioes','reuniao'], 'agenda_query', 'Usar categoria persistida e busca de título quando apropriado. Não inventar equivalência entre categoria e tipo. Agregar antes de limitar.', [
    'Quantos eventos há por categoria neste mês?', 'Faça um gráfico de pizza por categoria.', 'Quais categorias têm mais eventos?', 'Mostre as reuniões desta semana.', 'Compare as categorias da programação.', 'Liste os eventos de uma categoria específica.', 'Qual categoria tem mais eventos concluídos?', 'Qual é a distribuição das categorias dos meus eventos?', 'Quais eventos estão sem categoria informada?', 'Como ficou a distribuição por categoria em setembro?',
  ]),
  agenda('duracoes', 'Duração e horários', ['duracao','horas','horarios','media','longos','curtos','tempo'], 'agenda_query', 'Duração prevista apenas com início e fim válidos, intervalo completo e cobertura declarada. Não calcular presença, horas trabalhadas ou execução real.', [
    'Qual é a duração média prevista dos eventos neste mês?', 'Quantos eventos possuem horários válidos?', 'Quais eventos estão sem horário definido?', 'Quantos eventos atravessam a meia-noite?', 'Mostre os horários dos eventos de hoje.', 'Qual foi a duração média prevista dos meus eventos criados?', 'Qual é o horário de início do evento que escolhi?', 'Qual é o horário de término desse evento?', 'A média de duração considera todos os eventos?', 'Mostre a programação com data e horário em tabela.',
  ]),
  agenda('distribuicao', 'Carga da programação', ['distribuicao','concentracao','dia','dias','quinta','sexta','barras','pizza'], 'agenda_query', 'Agrupar por dia ou dia da semana do início. Filtro weekday é civil; não duplicar multidias. Pizza completa; barras para ranking/evolução.', [
    'Em quais dias da semana há mais eventos?', 'Faça um gráfico de barras dos eventos por dia.', 'Quantos eventos começam na sexta-feira?', 'Quais eventos começam na quinta-feira?', 'Compare a quantidade de eventos por dia da semana.', 'Faça um gráfico de pizza por dia da semana.', 'Qual dia do mês concentra mais eventos?', 'Mostre a distribuição diária dos meus eventos.', 'Há eventos começando aos domingos?', 'Como se distribuem os eventos ao longo deste mês?',
  ]),
  agenda('prioridades', 'Prioridades e detalhes', ['prioridade','critica','alta','detalhes','subeventos','titulo'], 'agenda_query', 'Prioridade persistida, detalhes só campos operacionais permitidos. Subeventos por get_event/list_subevents; não somar subevento ao total de pais.', [
    'Quais eventos têm prioridade crítica?', 'Quantos eventos de prioridade alta existem neste mês?', 'Liste meus eventos de prioridade alta.', 'Mostre os detalhes do evento selecionado.', 'Quais são os subeventos desse evento?', 'Qual é a situação desse subevento?', 'Quais eventos contêm reunião no título?', 'Mostre os eventos com data definida e sem local.', 'Quais compromissos de prioridade baixa estão planejados?', 'Como estão os eventos de prioridade média nesta semana?',
  ]),
  agenda('continuidade', 'Comparações e limites de evidência', ['compare','versus','anterior','comissao','presenca','compareci','participacao'], 'agenda_query', 'Comparar duas consultas completas com mesmos filtros e unidades. Comissões e pessoas precisam de UUID persistido resolvido por fonte autorizada. Presença não existe no vínculo. Pedido fora de catálogo continua por ferramentas, sem resposta memorizada.', [
    'Compare a quantidade de eventos deste mês com o anterior.', 'E na semana anterior?', 'Mostre os mesmos dados em gráfico.', 'Agora mostre a mesma consulta em tabela.', 'Compare meus eventos criados e sob minha responsabilidade.', 'Quais eventos pertencem à comissão selecionada?', 'Quantos eventos concluídos tem essa comissão?', 'Eu estive presente em todos esses eventos?', 'Quantas horas eu efetivamente trabalhei nesses eventos?', 'Pode refazer essa consulta com os dados atualizados?',
  ]),
  map('vendas', 'Valores de vendas', ['vendas','vendemos','valor','realizadas','andamento'], 'map_sales_overview', 'Somar itens confirmados e em andamento separadamente na edição comercial persistida. Centavos para moeda. Confirmação não significa recebimento.', [
    'Como estão as vendas do mapa comercial?', 'Qual é o valor das vendas realizadas?', 'Quanto está em vendas em andamento?', 'Compare as vendas realizadas com as em andamento.', 'Mostre os valores das vendas em gráfico de barras.',
  ]),
  map('pedidos', 'Pedidos e espaços vendidos', ['pedidos','vendidos','confirmados','parciais','cancelados'], 'map_sales_overview', 'Pedido e lote são unidades diferentes; pedido parcial pode aparecer em ambas as categorias, nunca somá-las como pedidos distintos. Cancelados/históricos separados.', [
    'Quantos pedidos têm itens confirmados?', 'Quantos espaços foram vendidos com confirmação?', 'Quantos espaços aguardam confirmação da venda?', 'Há itens cancelados nas vendas?', 'Quantos espaços históricos não têm confirmação verificada?',
  ]),
  map('disponibilidade', 'Disponibilidade dos espaços', ['disponiveis','disponivel','livres','reservados','bloqueados','negociacao','situacao'], 'map_inventory_summary', 'Situação atual dos lotes ativos e autorizados. Aggregação completa antes da amostra. Disponível não é reservado; bloqueado não é vendido.', [
    'Quantos espaços estão disponíveis no mapa?', 'Mostre a distribuição dos espaços por situação.', 'Quais espaços estão reservados?', 'Quantos espaços estão bloqueados?', 'Quais espaços estão em negociação?',
  ]),
  map('areas', 'Áreas comerciais', ['area','areas','metros','metragem','maiores','menores'], 'map_inventory_summary', 'Área oficial em m²; nunca área calculada ou inferida de geometria. Informar cobertura de registros sem metragem.', [
    'Qual é a área disponível em metros quadrados?', 'Há espaços disponíveis com mais de 100 m²?', 'Quais espaços têm entre 50 e 100 m²?', 'Qual é a área dos lotes da quadra A?', 'Quantos espaços estão sem área oficial cadastrada?',
  ]),
  map('quadras', 'Quadras e localização', ['quadra','quadras','setor','localizacao','numero'], 'map_inventory_summary', 'Quadra e número persistidos; nunca decodificar ID técnico. Comparações exigem mesmo projeto e filtro.', [
    'Quantos espaços disponíveis há em cada quadra?', 'Mostre os espaços disponíveis da quadra A.', 'Faça um gráfico de barras por quadra.', 'Compare a disponibilidade das quadras A e B.', 'Quais espaços ainda não têm número comercial?',
  ]),
  map('infraestrutura', 'Infraestrutura dos lotes', ['estrutura','infraestrutura','cobertos','eletricidade','energia','agua','internet'], 'map_inventory_summary', 'Usar indicadores persistidos de cobertura/eletricidade/água/internet. Não inferir de foto, nome do segmento ou localização.', [
    'Quais espaços disponíveis são cobertos?', 'Há espaços disponíveis com eletricidade?', 'Quantos espaços possuem ponto de água cadastrado?', 'Quais espaços disponíveis têm internet cadastrada?', 'Mostre espaços cobertos com água e energia.',
  ]),
  map('segmentos', 'Estruturas e segmentos', ['segmentos','segmento','pavilhoes','pavilhao','estruturas'], 'map_segments', 'Descobrir segmento/entidade no projeto autorizado. Estrutura é entidade persistida; consulta auxiliar só vira resposta se o pedido for por estruturas.', [
    'Quais segmentos estão ativos no mapa?', 'Quais estruturas estão cadastradas nesse projeto?', 'Quais pavilhões fazem parte do mapa comercial?', 'Como está o inventário do segmento selecionado?', 'Quais áreas pertencem a esse segmento?',
  ]),
  map('precos', 'Preços comerciais', ['preco','precos','custa','renovacao','tabela'], 'map_prices', 'Usar regra/preço persistido e edição comprovada. Ausência de preço é pendência; não estimar. Preço de oferta não é receita nem valor de venda.', [
    'Qual é o preço do espaço selecionado?', 'Quais preços estão cadastrados para esse pavilhão?', 'Quais espaços estão sem preço resolvido?', 'Qual é o valor de renovação desse espaço?', 'Compare os preços cadastrados destes dois espaços.',
  ]),
  map('contratos', 'Pedidos e documentos', ['contrato','contratos','documento','assinatura','pedido'], 'list_sale_orders', 'Revalidar permissão de contratos para presença de documento. Documento anexado não comprova assinatura. Detalhe exige pedido resolvido; não expor arquivos privados.', [
    'Quais vendas em aberto estão sem contrato anexado?', 'Qual é a situação de assinatura desse pedido?', 'Quantos espaços fazem parte desse pedido?', 'O contrato desse pedido abrange todos os seus espaços?', 'Quais itens desse pedido foram cancelados?',
  ]),
  map('contexto', 'Edição, comparação e atualização', ['edicao','projeto','2026','2028','mes','atualizados','recebido'], 'map_sales_overview', 'Edição explícita prevalece; projeto via configuração persistida. Período não é posição histórica do mapa. Recebimentos pertencem ao Financeiro e não são inferidos da venda.', [
    'Como estão as vendas da Fenasoja 2026?', 'Compare as vendas confirmadas deste mês com o anterior.', 'Atualize a disponibilidade depois da nova venda.', 'Qual projeto comercial estou consultando?', 'Quanto dessas vendas já foi recebido?',
  ]),
];
export const questionBank = questionPlaybooks.flatMap(playbook => playbook.examples.map((question, index) => ({ id: `${playbook.id}-${index + 1}`, worker: playbook.worker, question, playbookId: playbook.id, tool: playbook.tool })));
export const normalizeQuestion = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Retrieval is advisory only: no equality gate, answer text or customer data. */
export function relevantPlaybooks(worker: string, question: string): QuestionPlaybook[] {
  const tokens = new Set(normalizeQuestion(question).match(/[a-z0-9]+/g) ?? []);
  return questionPlaybooks.filter(item => item.worker === worker).map((item, index) => ({ item, index, score: item.terms.filter(term => tokens.has(term)).length }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 4).map(entry => entry.item);
}
export function plannerPlaybooks(worker: string, question: string): string {
  return relevantPlaybooks(worker, question).map(item => `${item.topic}: ${item.strategy} Ferramenta preferencial: ${item.tool}. Referências, não frases obrigatórias: ${item.examples.slice(0, 2).join(' / ')}`).join('\n');
}
