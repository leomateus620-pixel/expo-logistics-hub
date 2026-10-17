# Catálogo de perguntas do BOT FENASOJA

150 referências revisadas: 50 para Mapa Comercial e 100 para Agenda. Não há respostas ou valores comerciais memorizados. Este formulário de cobertura é interno; não cria 150 botões no chat.

Cada pergunta referencia uma estratégia e ferramentas fechadas. O planejador interpreta intenção, sinônimos e perguntas fora do catálogo; as ferramentas consultam os dados atuais com JWT, organização e RLS. Perguntas sem dados comprováveis recebem esclarecimento ou indicação do próximo caminho, nunca valores inventados.

Atualização: cada nova requisição consulta novamente as fontes. Alterar uma venda, evento, lote ou estrutura muda a próxima leitura autorizada; não exige regravar o catálogo. Repetir o mesmo request_id idempotente mantém a resposta original daquele turno. Não existe coleta automática de perguntas pessoais nem treino com registros dos usuários.

Apresentação: contagem simples → indicador; distribuição completa → pizza ou barras; comparação → dois agregados com o mesmo escopo; lista → tabela; detalhe → resumo operacional. Pizza inclui todas as categorias, inclusive Outros calculado no servidor. Amostras de detalhes não geram totais ou rankings.

## Formulário de cobertura

| Nº | Especialista | Pergunta de referência | Estratégia | Consulta preferencial |
| --- | --- | --- | --- | --- |
| 1 | Agenda | Quantos eventos eu fiz neste mês? | Minha Agenda | agenda_personal_summary |
| 2 | Agenda | Quais são meus eventos desta semana? | Minha Agenda | agenda_personal_summary |
| 3 | Agenda | Quantos eventos eu criei em outubro? | Minha Agenda | agenda_personal_summary |
| 4 | Agenda | Quais eventos estão sob minha responsabilidade? | Minha Agenda | agenda_personal_summary |
| 5 | Agenda | A quais eventos estou vinculado hoje? | Minha Agenda | agenda_personal_summary |
| 6 | Agenda | Quantos compromissos meus já têm data passada? | Minha Agenda | agenda_personal_summary |
| 7 | Agenda | Quais dos meus eventos ainda estão agendados? | Minha Agenda | agenda_personal_summary |
| 8 | Agenda | Qual foi a duração média prevista dos meus eventos? | Minha Agenda | agenda_personal_summary |
| 9 | Agenda | Mostre meus eventos em uma tabela. | Minha Agenda | agenda_personal_summary |
| 10 | Agenda | Como ficou minha Agenda no mês anterior? | Minha Agenda | agenda_personal_summary |
| 11 | Agenda | Quais eventos acontecem hoje? | Datas e períodos | agenda_query |
| 12 | Agenda | O que está programado para amanhã? | Datas e períodos | agenda_query |
| 13 | Agenda | Mostre a programação desta semana. | Datas e períodos | agenda_query |
| 14 | Agenda | Quantos eventos existem neste mês? | Datas e períodos | agenda_query |
| 15 | Agenda | Quais eventos começam no próximo mês? | Datas e períodos | agenda_query |
| 16 | Agenda | O que está marcado entre 10 e 20 de novembro? | Datas e períodos | agenda_query |
| 17 | Agenda | Quais eventos atravessam a virada do mês? | Datas e períodos | agenda_query |
| 18 | Agenda | Quais eventos acontecem no fim de semana? | Datas e períodos | agenda_query |
| 19 | Agenda | Quais são os próximos compromissos da Agenda? | Datas e períodos | agenda_query |
| 20 | Agenda | Como está a programação de dezembro de 2026? | Datas e períodos | agenda_query |
| 21 | Agenda | Quantos eventos estão concluídos neste mês? | Andamento dos eventos | agenda_query |
| 22 | Agenda | Quais eventos foram cancelados em outubro? | Andamento dos eventos | agenda_query |
| 23 | Agenda | Quais eventos estão em andamento? | Andamento dos eventos | agenda_query |
| 24 | Agenda | Mostre os eventos planejados desta semana. | Andamento dos eventos | agenda_query |
| 25 | Agenda | Quais eventos aguardam definição? | Andamento dos eventos | agenda_query |
| 26 | Agenda | Quais eventos aguardam responsável? | Andamento dos eventos | agenda_query |
| 27 | Agenda | Faça um gráfico de pizza por situação dos eventos. | Andamento dos eventos | agenda_query |
| 28 | Agenda | Compare eventos planejados e concluídos. | Andamento dos eventos | agenda_query |
| 29 | Agenda | Qual a distribuição de situações da minha Agenda? | Andamento dos eventos | agenda_query |
| 30 | Agenda | Quais eventos concluídos estavam sob minha responsabilidade? | Andamento dos eventos | agenda_query |
| 31 | Agenda | Quem tem mais eventos neste mês? | Pessoas e vínculos | agenda_people_ranking |
| 32 | Agenda | Mostre um gráfico de barras das pessoas com mais eventos. | Pessoas e vínculos | agenda_people_ranking |
| 33 | Agenda | Quais são as dez pessoas com mais vínculos na Agenda? | Pessoas e vínculos | agenda_people_ranking |
| 34 | Agenda | Há pessoas empatadas no ranking deste mês? | Pessoas e vínculos | agenda_people_ranking |
| 35 | Agenda | Mostre uma tabela do ranking de pessoas. | Pessoas e vínculos | agenda_people_ranking |
| 36 | Agenda | Quem concentra mais eventos no mês anterior? | Pessoas e vínculos | agenda_people_ranking |
| 37 | Agenda | Quantas pessoas aparecem no ranking deste período? | Pessoas e vínculos | agenda_people_ranking |
| 38 | Agenda | Compare a quantidade de eventos das pessoas mais vinculadas. | Pessoas e vínculos | agenda_people_ranking |
| 39 | Agenda | Qual pessoa tem a maior quantidade de eventos autorizados? | Pessoas e vínculos | agenda_people_ranking |
| 40 | Agenda | Como ficou o ranking das pessoas em setembro de 2026? | Pessoas e vínculos | agenda_people_ranking |
| 41 | Agenda | Onde serão os eventos de hoje? | Locais da programação | agenda_query |
| 42 | Agenda | Quantos eventos estão no Centro de Eventos neste mês? | Locais da programação | agenda_query |
| 43 | Agenda | Quais eventos estão na Sala dos Voluntários? | Locais da programação | agenda_query |
| 44 | Agenda | Mostre os eventos do Restaurante nesta semana. | Locais da programação | agenda_query |
| 45 | Agenda | Qual local concentra mais eventos? | Locais da programação | agenda_query |
| 46 | Agenda | Faça um gráfico de eventos por local. | Locais da programação | agenda_query |
| 47 | Agenda | Quais eventos não possuem local informado? | Locais da programação | agenda_query |
| 48 | Agenda | Compare a programação entre os locais cadastrados. | Locais da programação | agenda_query |
| 49 | Agenda | Liste meus eventos no Centro de Eventos. | Locais da programação | agenda_query |
| 50 | Agenda | Como se distribuem os eventos por local no mês anterior? | Locais da programação | agenda_query |
| 51 | Agenda | Quantos eventos há por categoria neste mês? | Categorias da Agenda | agenda_query |
| 52 | Agenda | Faça um gráfico de pizza por categoria. | Categorias da Agenda | agenda_query |
| 53 | Agenda | Quais categorias têm mais eventos? | Categorias da Agenda | agenda_query |
| 54 | Agenda | Mostre as reuniões desta semana. | Categorias da Agenda | agenda_query |
| 55 | Agenda | Compare as categorias da programação. | Categorias da Agenda | agenda_query |
| 56 | Agenda | Liste os eventos de uma categoria específica. | Categorias da Agenda | agenda_query |
| 57 | Agenda | Qual categoria tem mais eventos concluídos? | Categorias da Agenda | agenda_query |
| 58 | Agenda | Qual é a distribuição das categorias dos meus eventos? | Categorias da Agenda | agenda_query |
| 59 | Agenda | Quais eventos estão sem categoria informada? | Categorias da Agenda | agenda_query |
| 60 | Agenda | Como ficou a distribuição por categoria em setembro? | Categorias da Agenda | agenda_query |
| 61 | Agenda | Qual é a duração média prevista dos eventos neste mês? | Duração e horários | agenda_query |
| 62 | Agenda | Quantos eventos possuem horários válidos? | Duração e horários | agenda_query |
| 63 | Agenda | Quais eventos estão sem horário definido? | Duração e horários | agenda_query |
| 64 | Agenda | Quantos eventos atravessam a meia-noite? | Duração e horários | agenda_query |
| 65 | Agenda | Mostre os horários dos eventos de hoje. | Duração e horários | agenda_query |
| 66 | Agenda | Qual foi a duração média prevista dos meus eventos criados? | Duração e horários | agenda_query |
| 67 | Agenda | Qual é o horário de início do evento que escolhi? | Duração e horários | agenda_query |
| 68 | Agenda | Qual é o horário de término desse evento? | Duração e horários | agenda_query |
| 69 | Agenda | A média de duração considera todos os eventos? | Duração e horários | agenda_query |
| 70 | Agenda | Mostre a programação com data e horário em tabela. | Duração e horários | agenda_query |
| 71 | Agenda | Em quais dias da semana há mais eventos? | Carga da programação | agenda_query |
| 72 | Agenda | Faça um gráfico de barras dos eventos por dia. | Carga da programação | agenda_query |
| 73 | Agenda | Quantos eventos começam na sexta-feira? | Carga da programação | agenda_query |
| 74 | Agenda | Quais eventos começam na quinta-feira? | Carga da programação | agenda_query |
| 75 | Agenda | Compare a quantidade de eventos por dia da semana. | Carga da programação | agenda_query |
| 76 | Agenda | Faça um gráfico de pizza por dia da semana. | Carga da programação | agenda_query |
| 77 | Agenda | Qual dia do mês concentra mais eventos? | Carga da programação | agenda_query |
| 78 | Agenda | Mostre a distribuição diária dos meus eventos. | Carga da programação | agenda_query |
| 79 | Agenda | Há eventos começando aos domingos? | Carga da programação | agenda_query |
| 80 | Agenda | Como se distribuem os eventos ao longo deste mês? | Carga da programação | agenda_query |
| 81 | Agenda | Quais eventos têm prioridade crítica? | Prioridades e detalhes | agenda_query |
| 82 | Agenda | Quantos eventos de prioridade alta existem neste mês? | Prioridades e detalhes | agenda_query |
| 83 | Agenda | Liste meus eventos de prioridade alta. | Prioridades e detalhes | agenda_query |
| 84 | Agenda | Mostre os detalhes do evento selecionado. | Prioridades e detalhes | agenda_query |
| 85 | Agenda | Quais são os subeventos desse evento? | Prioridades e detalhes | agenda_query |
| 86 | Agenda | Qual é a situação desse subevento? | Prioridades e detalhes | agenda_query |
| 87 | Agenda | Quais eventos contêm reunião no título? | Prioridades e detalhes | agenda_query |
| 88 | Agenda | Mostre os eventos com data definida e sem local. | Prioridades e detalhes | agenda_query |
| 89 | Agenda | Quais compromissos de prioridade baixa estão planejados? | Prioridades e detalhes | agenda_query |
| 90 | Agenda | Como estão os eventos de prioridade média nesta semana? | Prioridades e detalhes | agenda_query |
| 91 | Agenda | Compare a quantidade de eventos deste mês com o anterior. | Comparações e limites de evidência | agenda_query |
| 92 | Agenda | E na semana anterior? | Comparações e limites de evidência | agenda_query |
| 93 | Agenda | Mostre os mesmos dados em gráfico. | Comparações e limites de evidência | agenda_query |
| 94 | Agenda | Agora mostre a mesma consulta em tabela. | Comparações e limites de evidência | agenda_query |
| 95 | Agenda | Compare meus eventos criados e sob minha responsabilidade. | Comparações e limites de evidência | agenda_query |
| 96 | Agenda | Quais eventos pertencem à comissão selecionada? | Comparações e limites de evidência | agenda_query |
| 97 | Agenda | Quantos eventos concluídos tem essa comissão? | Comparações e limites de evidência | agenda_query |
| 98 | Agenda | Eu estive presente em todos esses eventos? | Comparações e limites de evidência | agenda_query |
| 99 | Agenda | Quantas horas eu efetivamente trabalhei nesses eventos? | Comparações e limites de evidência | agenda_query |
| 100 | Agenda | Pode refazer essa consulta com os dados atualizados? | Comparações e limites de evidência | agenda_query |
| 101 | Mapa | Como estão as vendas do mapa comercial? | Valores de vendas | map_sales_overview |
| 102 | Mapa | Qual é o valor das vendas realizadas? | Valores de vendas | map_sales_overview |
| 103 | Mapa | Quanto está em vendas em andamento? | Valores de vendas | map_sales_overview |
| 104 | Mapa | Compare as vendas realizadas com as em andamento. | Valores de vendas | map_sales_overview |
| 105 | Mapa | Mostre os valores das vendas em gráfico de barras. | Valores de vendas | map_sales_overview |
| 106 | Mapa | Quantos pedidos têm itens confirmados? | Pedidos e espaços vendidos | map_sales_overview |
| 107 | Mapa | Quantos espaços foram vendidos com confirmação? | Pedidos e espaços vendidos | map_sales_overview |
| 108 | Mapa | Quantos espaços aguardam confirmação da venda? | Pedidos e espaços vendidos | map_sales_overview |
| 109 | Mapa | Há itens cancelados nas vendas? | Pedidos e espaços vendidos | map_sales_overview |
| 110 | Mapa | Quantos espaços históricos não têm confirmação verificada? | Pedidos e espaços vendidos | map_sales_overview |
| 111 | Mapa | Quantos espaços estão disponíveis no mapa? | Disponibilidade dos espaços | map_inventory_summary |
| 112 | Mapa | Mostre a distribuição dos espaços por situação. | Disponibilidade dos espaços | map_inventory_summary |
| 113 | Mapa | Quais espaços estão reservados? | Disponibilidade dos espaços | map_inventory_summary |
| 114 | Mapa | Quantos espaços estão bloqueados? | Disponibilidade dos espaços | map_inventory_summary |
| 115 | Mapa | Quais espaços estão em negociação? | Disponibilidade dos espaços | map_inventory_summary |
| 116 | Mapa | Qual é a área disponível em metros quadrados? | Áreas comerciais | map_inventory_summary |
| 117 | Mapa | Há espaços disponíveis com mais de 100 m²? | Áreas comerciais | map_inventory_summary |
| 118 | Mapa | Quais espaços têm entre 50 e 100 m²? | Áreas comerciais | map_inventory_summary |
| 119 | Mapa | Qual é a área dos lotes da quadra A? | Áreas comerciais | map_inventory_summary |
| 120 | Mapa | Quantos espaços estão sem área oficial cadastrada? | Áreas comerciais | map_inventory_summary |
| 121 | Mapa | Quantos espaços disponíveis há em cada quadra? | Quadras e localização | map_inventory_summary |
| 122 | Mapa | Mostre os espaços disponíveis da quadra A. | Quadras e localização | map_inventory_summary |
| 123 | Mapa | Faça um gráfico de barras por quadra. | Quadras e localização | map_inventory_summary |
| 124 | Mapa | Compare a disponibilidade das quadras A e B. | Quadras e localização | map_inventory_summary |
| 125 | Mapa | Quais espaços ainda não têm número comercial? | Quadras e localização | map_inventory_summary |
| 126 | Mapa | Quais espaços disponíveis são cobertos? | Infraestrutura dos lotes | map_inventory_summary |
| 127 | Mapa | Há espaços disponíveis com eletricidade? | Infraestrutura dos lotes | map_inventory_summary |
| 128 | Mapa | Quantos espaços possuem ponto de água cadastrado? | Infraestrutura dos lotes | map_inventory_summary |
| 129 | Mapa | Quais espaços disponíveis têm internet cadastrada? | Infraestrutura dos lotes | map_inventory_summary |
| 130 | Mapa | Mostre espaços cobertos com água e energia. | Infraestrutura dos lotes | map_inventory_summary |
| 131 | Mapa | Quais segmentos estão ativos no mapa? | Estruturas e segmentos | map_segments |
| 132 | Mapa | Quais estruturas estão cadastradas nesse projeto? | Estruturas e segmentos | map_segments |
| 133 | Mapa | Quais pavilhões fazem parte do mapa comercial? | Estruturas e segmentos | map_segments |
| 134 | Mapa | Como está o inventário do segmento selecionado? | Estruturas e segmentos | map_segments |
| 135 | Mapa | Quais áreas pertencem a esse segmento? | Estruturas e segmentos | map_segments |
| 136 | Mapa | Qual é o preço do espaço selecionado? | Preços comerciais | map_prices |
| 137 | Mapa | Quais preços estão cadastrados para esse pavilhão? | Preços comerciais | map_prices |
| 138 | Mapa | Quais espaços estão sem preço resolvido? | Preços comerciais | map_prices |
| 139 | Mapa | Qual é o valor de renovação desse espaço? | Preços comerciais | map_prices |
| 140 | Mapa | Compare os preços cadastrados destes dois espaços. | Preços comerciais | map_prices |
| 141 | Mapa | Quais vendas em aberto estão sem contrato anexado? | Pedidos e documentos | list_sale_orders |
| 142 | Mapa | Qual é a situação de assinatura desse pedido? | Pedidos e documentos | list_sale_orders |
| 143 | Mapa | Quantos espaços fazem parte desse pedido? | Pedidos e documentos | list_sale_orders |
| 144 | Mapa | O contrato desse pedido abrange todos os seus espaços? | Pedidos e documentos | list_sale_orders |
| 145 | Mapa | Quais itens desse pedido foram cancelados? | Pedidos e documentos | list_sale_orders |
| 146 | Mapa | Como estão as vendas da Fenasoja 2026? | Edição, comparação e atualização | map_sales_overview |
| 147 | Mapa | Compare as vendas confirmadas deste mês com o anterior. | Edição, comparação e atualização | map_sales_overview |
| 148 | Mapa | Atualize a disponibilidade depois da nova venda. | Edição, comparação e atualização | map_sales_overview |
| 149 | Mapa | Qual projeto comercial estou consultando? | Edição, comparação e atualização | map_sales_overview |
| 150 | Mapa | Quanto dessas vendas já foi recebido? | Edição, comparação e atualização | map_sales_overview |

## Estratégias e limites de evidência

### Minha Agenda (agenda)

Identidade autenticada; distinguir criação, responsabilidade e vínculo. Quantidades usam agregado; listas e filtros usam agenda_query com relationship. Nunca inferir presença.

### Datas e períodos (agenda)

Resolver datas civis em São Paulo, intervalo explícito prevalece. Sobreposição inclui eventos atravessando o período. Sem período para lista: pedir ou usar período solicitado, nunca trocar mês por edição.

### Andamento dos eventos (agenda)

Status explícito fechado; cancelados apenas se pedidos. Concluído é estado cadastrado, data passada não comprova realização. Pizza somente partição completa.

### Pessoas e vínculos (agenda)

Eventos distintos por identidade persistida e RLS. Ranking agregado completo antes do top. Pessoa nominal exige resolução de identidade sem escolher homônimo; indisponível pedir identificador autorizado.

### Locais da programação (agenda)

Filtrar local persistido, agrupamento location. Contar cada evento uma vez; localização não implica reserva ou ausência de conflitos.

### Categorias da Agenda (agenda)

Usar categoria persistida e busca de título quando apropriado. Não inventar equivalência entre categoria e tipo. Agregar antes de limitar.

### Duração e horários (agenda)

Duração prevista apenas com início e fim válidos, intervalo completo e cobertura declarada. Não calcular presença, horas trabalhadas ou execução real.

### Carga da programação (agenda)

Agrupar por dia ou dia da semana do início. Filtro weekday é civil; não duplicar multidias. Pizza completa; barras para ranking/evolução.

### Prioridades e detalhes (agenda)

Prioridade persistida, detalhes só campos operacionais permitidos. Subeventos por get_event/list_subevents; não somar subevento ao total de pais.

### Comparações e limites de evidência (agenda)

Comparar duas consultas completas com mesmos filtros e unidades. Comissões e pessoas precisam de UUID persistido resolvido por fonte autorizada. Presença não existe no vínculo. Pedido fora de catálogo continua por ferramentas, sem resposta memorizada.

### Valores de vendas (mapa)

Somar itens confirmados e em andamento separadamente na edição comercial persistida. Centavos para moeda. Confirmação não significa recebimento.

### Pedidos e espaços vendidos (mapa)

Pedido e lote são unidades diferentes; pedido parcial pode aparecer em ambas as categorias, nunca somá-las como pedidos distintos. Cancelados/históricos separados.

### Disponibilidade dos espaços (mapa)

Situação atual dos lotes ativos e autorizados. Aggregação completa antes da amostra. Disponível não é reservado; bloqueado não é vendido.

### Áreas comerciais (mapa)

Área oficial em m²; nunca área calculada ou inferida de geometria. Informar cobertura de registros sem metragem.

### Quadras e localização (mapa)

Quadra e número persistidos; nunca decodificar ID técnico. Comparações exigem mesmo projeto e filtro.

### Infraestrutura dos lotes (mapa)

Usar indicadores persistidos de cobertura/eletricidade/água/internet. Não inferir de foto, nome do segmento ou localização.

### Estruturas e segmentos (mapa)

Descobrir segmento/entidade no projeto autorizado. Estrutura é entidade persistida; consulta auxiliar só vira resposta se o pedido for por estruturas.

### Preços comerciais (mapa)

Usar regra/preço persistido e edição comprovada. Ausência de preço é pendência; não estimar. Preço de oferta não é receita nem valor de venda.

### Pedidos e documentos (mapa)

Revalidar permissão de contratos para presença de documento. Documento anexado não comprova assinatura. Detalhe exige pedido resolvido; não expor arquivos privados.

### Edição, comparação e atualização (mapa)

Edição explícita prevalece; projeto via configuração persistida. Período não é posição histórica do mapa. Recebimentos pertencem ao Financeiro e não são inferidos da venda.

## Escopos e dependências

As RPCs incrementais são propostas para implantação autorizada, não aplicadas em produção por este trabalho. Contextos ambíguos exigem escolha de edição/projeto/identidade. Presença e horas efetivamente trabalhadas não existem como fatos nos vínculos da Agenda; pagamentos recebidos não são deduzidos de vendas. Perguntas por pessoa nominal, comissão, pedido ou espaço dependem de resolução inequívoca de IDs autorizados. Ausência de preço, documento ou área permanece explícita.

A igualdade literal entre a pergunta e este catálogo nunca habilita uma ferramenta nem amplia acesso. Campos, operações, filtros e formatos continuam validados por Zod e SQL.
