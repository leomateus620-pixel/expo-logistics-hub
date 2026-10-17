# BOT FENASOJA — implementação e evidências

> Correções posteriores às PRs #206/#207: [diagnóstico, banco incremental e homologação](reliability/README.md). A seção de implantação abaixo registra o estado daquela implementação; não é instrução para reaplicar migrations já executadas.

Diagnóstico iniciado na branch `main`, commit `725f57342b0fdbc1344b5590121af6543afff3f2`. Implementação na branch `codex/bot-fenasoja`. Lidos os AGENTS da raiz e de workers antes das alterações. A alteração preexistente de `package-lock.json` e os worktrees locais não fazem parte da entrega.

## Causas confirmadas

1. `renderToolEvidence` montava uma seção para cada ferramenta, incluindo descoberta de projeto. A nova composição recebe intenção e proveniência, escolhe evidências pertinentes e mantém descoberta fora da resposta.
2. O fallback convertia nomes de campos desconhecidos em cabeçalhos e exibia estados técnicos. O compositor usa campos permitidos e traduções explícitas por domínio.
3. Gráficos eram calculados sobre os registros retornados, mesmo com `total` superior ao limite. Consultas analíticas próprias agregam o conjunto autorizado no banco; um resultado parcial não admite gráfico de total.
4. `chronological` ordenava papéis em empates; depois `threadEntries` reordenava por data e UUID, anulando a primeira correção. Turnos agora usam `request_id` e sequência persistida; ações e eventos são intercalados sem dividir pergunta e resposta.
5. Células estreitas herdavam quebra de palavras e cores `hsl(var(...))` incompatíveis com tokens OKLCH. Tabelas têm largura mínima e rolagem própria; tabelas simples ficam verticais no celular.
6. Nome e símbolo antigos estavam no launcher, cabeçalho, navegação e estado inicial. A entrada usa BOT FENASOJA e o mascote personalizado em `mascot-open.webp`/`mascot-blink.webp`, derivado da referência oficial conforme o último pedido explícito do usuário. A personalização fica restrita ao bot; a marca institucional permanece preservada. O restante da interface respeita a preferência de movimento reduzido. Somente o mascote tem exceção explicitamente solicitada, com pausa manual, por visibilidade e em aba oculta.
7. A redação de dados pessoais incidia sobre JSON inteiro, podendo corromper números e fontes. O novo caminho valida o documento e preserva fatos tipados; a persistência sanitiza campos de texto individualmente.

## Fluxo final

Pergunta → intenção especializada e continuidade → contexto explícito/autorizado → ferramenta de leitura → cálculo no banco → composição determinística → Zod → persistência → apresentação no lugar reservado abaixo da pergunta.

O modelo planeja consultas para os demais pedidos. Não fornece métricas nem componentes executáveis. Os exemplos analíticos centrais têm seleção determinística de ferramentas. Referência explícita de edição prevalece; ambiguidade gera esclarecimento. Histórico do planejador usa a mesma leitura ordenada da interface.

## Contratos e consultas

- `workers_map_sales_overview`: edição comercial persistida, valores de itens confirmados e em andamento, pedidos distintos, espaços distintos, cancelados, históricos e valores não verificáveis separados. Taxas e recebimentos não são presumidos.
- `workers_agenda_personal_summary`: identidade autenticada, criação/responsabilidade/vínculos persistidos, eventos distintos, cancelados excluídos, subeventos associados ao evento principal, sobreposição de períodos e duração prevista válida.
- `workers_agenda_people_ranking`: agregação completa antes do limite visual, identidades distintas e desempate estável; nomes homônimos continuam distinguíveis.
- `workers_map_inventory_summary`: situação, quadra, área oficial e infraestrutura sobre os espaços ativos autorizados, com agrupamento completo antes da amostra; recortes não suportados não são presumidos.
- `workers_agenda_query`: listas e análises por período, vínculo, situação, local, categoria, prioridade, dia e comissão persistida; horários ausentes e eventos que atravessam o período têm filtros explícitos. Agrupa todo o conjunto autorizado antes de limitar os detalhes.
- `ai_workers_read_history`: sequência de admissão e paginação por turnos inteiros. O cursor usa `message_seq`, incluindo estados pendentes/falhos para manter o lugar da resposta.
- `fenasoja-response`, versão 1: resumo, indicadores, barras, pizza, tabelas, comparação, perfil, fontes, vazio e esclarecimento. Valida rótulos, valores finitos, unidades, células, quantidade e completude; pizza exige partição completa. Comparações carregam rótulos de cada recorte. Adaptadores mantêm `fenasoja-table` e `fenasoja-chart` antigos.
- `question-bank.ts`: 150 referências internas de perguntas, sendo 50 do Mapa e 100 da Agenda, agrupadas por estratégia e ferramenta. São orientações de interpretação, sem respostas fixas nem exigência de frase exata; os dados são consultados a cada pedido. Agenda e Mapa não transformam o catálogo em botões na abertura.

Detalhes: [métricas e SQL](verified-analytics.md), [interface](interface.md), [respostas e segurança](responses.md).

## Segurança e publicação

Continuam vigentes elegibilidade `ai_workers_can_access`, reconfirmação de senha, JWT, organização ativa, capabilities e RLS. Agregações usam `SECURITY INVOKER`; nenhuma política foi ampliada. Consulta não confirma venda, contrato, pagamento ou ação. Idempotência, auditoria, cancelamento e os fluxos separados de revisão foram preservados.

Aplicar as quatro migrations incrementais na ordem abaixo, depois dos workers existentes e de `drizzle/migrations/0009_migration.sql`, que define a elegibilidade:

1. `20261017010000_workers_message_order.sql`: sequência e histórico por turnos.
2. `20261017020000_workers_verified_analytics.sql`: agregados de vendas, Agenda pessoal e ranking.
3. `20261017030000_workers_response_persistence.sql`: persistência e sanitização do documento tipado.
4. `20261017040000_workers_question_analytics.sql`: consultas agregadas de inventário e Agenda com filtros e agrupamentos.

Publicar `workers-orchestrator` com os módulos compartilhados e o registro gerado sincronizado. Não foi aplicada migration nem publicado backend em produção durante esta implementação.

Recuperação: primeiro restaurar a versão anterior do frontend/orquestrador; preservar conversas e colunas adicionadas. Para reverter apenas o sanitizador, restaurar `ai_workers_finish_turn` da migration original antes de remover seus helpers. A sequência e as agregações são aditivas e podem permanecer sem uso. Nunca apagar conversas ou registros comerciais.

## Limites das evidências

Os relatórios SQL usam PostgreSQL WASM descartável, identidades e registros sintéticos. Eles executam as migrations reais; políticas de negócio existentes são representadas por fixtures. A prévia visual usa componentes, hook, interpretador, compositor e contrato reais, com transporte e autenticação sintéticos explicitamente identificados. Isso não comprova RLS remota, dados de produção, provedor de IA publicado ou dispositivo físico.

A sessão autenticada do portal publicado permitiu inspecionar a versão anterior. A nova versão requer migrations e backend compatíveis antes da homologação autenticada com dados reais. Fontes institucionais são consultadas em URLs revisadas, sem enviar registros internos à web; a referência da presidência preserva edição, publicação e verificação e não presume biografia ou identificação em foto de grupo.

Resultados finais de verificações e capturas estão em [validação](validation.md).
