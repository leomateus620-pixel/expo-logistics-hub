# BOT FENASOJA: correções de consultas e uso mobile

Base: `origin/main` em `1c18ea00`, incluindo PRs #206/#207 e commits posteriores de aplicação/publicação. Alterações isoladas na branch `codex/bot-fenasoja-reliability`. O checkout original e seu `package-lock.json` preexistente foram preservados.

## Diagnóstico e estágio das falhas

| Cenário | Etapa e causa confirmada | Correção |
| --- | --- | --- |
| Pessoa com mais eventos em outubro | Consulta: as funções versionadas referenciavam `cronograma_eventos.responsible_user_id`. Projeção de zero linhas no banco ativo confirmou `42703`, coluna ausente. A fixture antiga criava artificialmente esse campo e escondia a divergência. | Funções incrementais usam responsáveis de eventos/subeventos e contagem distinta evento/pessoa. Fixture sem a coluna reproduz o erro antes da correção. |
| Comissão com mais eventos | Interpretação: expressão genérica de “mais eventos” selecionava pessoas antes de verificar a entidade. | Intenções/ferramentas separadas; comissões agregadas por vínculos oficiais e UUID. |
| Fabiano Souza em outubro | Interpretação/resolução: não havia caminho nominal determinístico; consultas pessoais podiam usar a conta autenticada. | Resolve identidades autorizadas e consulta UUID específico; homônimos recebem escolha objetiva revalidada. |
| Continuidade depois de falha | Interpretação/histórico: período vinha apenas de documento de resposta bem-sucedida. | Mantém perguntas de turnos falhos e reconstrói o período explícito; a entidade atual prevalece sobre especialista/histórico. |
| Homônimos no ranking | Validação: nomes repetidos eram rejeitados apesar dos UUIDs distintos. | Validação de unicidade por ID; rótulos de apresentação distinguem identidades sem mostrar UUIDs. |
| Contratos firmados | Métrica/fonte: promoção implícita para vendas podia trocar agrupamentos assinados por valores, lotes ou pedidos com algum item assinado. | Usa `list_commercial_sale_orders` com os mesmos filtros `null`, `PENDING`, `SIGNED` da Dashboard e seus `.total`. |
| Falha com “Calculando…” | Interface: `finally` não limpava progresso, resposta genérica e banner repetiam a mesma falha. | Estado único por tentativa, carregamento encerrado, mensagens por causa, repetição manual apenas quando adequada. |
| Teclado iPhone | Interface: contêiner externo em `100dvh` e filho compensando `visualViewport` concorriam; copilot tinha outra altura independente. Os anexos comprovam o sintoma físico. | Um único proprietário externo de altura/offset; mensagens flexíveis dentro dele; foco sem scroll; campos16px. A correção ainda exige teste em iPhone real. |
| Navegação lateral | Interface: conteúdo sem contenção horizontal suficiente e larguras mínimas de filhos. Os anexos estáticos não comprovam mecanismo de arraste. | X contido, filhos `min-width:0`, rolagem vertical, Sheet acessível e retorno de foco; hover/toque sem deslocar itens. |
| Escolha após reabrir | Persistência: UUID dentro de texto de opção podia ser alterado pelo redator de telefones SQL. | `clarification.choices` guarda ID tipado separadamente do nome exibido; opções antigas permanecem legíveis. |

## Semântica reaproveitada

A Agenda usa `cronograma_evento_responsaveis` e `cronograma_subevento_responsaveis`, reunindo vínculos no evento principal. Criação é apurada separadamente e nunca presume participação. Subeventos cancelados e eventos cancelados ficam fora do ranking; múltiplos vínculos não duplicam eventos. Não existe alegação de presença comprovada.

Comissões usam os relacionamentos oficiais de eventos/subeventos, o slug principal e os slugs persistidos de `linked_commissions`, conforme os filtros da Agenda. IDs são resolvidos dentro da organização; `origin_commission_id` é proveniência, não participação. Um evento pode contar para várias comissões. Não se exige que a soma do ranking seja o total distinto. Agregação ocorre antes do limite visual e listas parciais avisam sobre possíveis empates além do recorte exibido.

`PersonAvatar`/`personPhotos` e `OrgUnitIdentityBadge`/registro oficial de ícones são reutilizados. Fotos de pessoas usam UUID; nome sozinho não escolhe a foto de um homônimo. Ausência/falha de imagem mantém a contagem. O contrato usa chaves visuais e IDs, sem URLs arbitrárias de imagens.

Contratos representam agrupamentos comerciais. `SIGNED` e `PENDING` vêm da API oficial, incluindo parciais, cancelamentos e histórico. Pagamento, lotes, documentos e versões são métricas separadas. `document_count`, IDs contratuais, vínculos de lotes e versões são preservados nas consultas autorizadas por contrato. A API oficial filtra datas de criação dos registros; não se apresenta esse período como data da assinatura. Ela não filtra edição: pedido explícito por edição exige esclarecimento em vez de rotular totais do projeto inteiro como edição.

## Comparação com módulos oficiais

| Evidência | Resultado | Limite |
| --- | --- | --- |
| Consulta nominal e agregados SQL em PostgreSQL WASM | Contagem igual à seleção direta dos mesmos vínculos e período da fixture; creator-only, homônimos, duplicação, subeventos e comissão múltipla cobertos. | Dados sintéticos e políticas representativas, sem comprovar RLS remota autenticada. |
| Adapter comercial | Reutiliza a mesma API/filtros da Dashboard; fixture valida124 totais/60 pendentes/64 assinados e resposta “64 contratos com assinatura confirmada.” | Referência de homologação, não contagem observada em produção nesta sessão. |
| Banco ativo | Ausência da coluna, existência das relações, assinaturas reconhecidas/guardadas e RLS habilitada por sondagens de leitura. | Definições SQL/ACLs completas e conteúdo/hash do Edge publicado não acessíveis com a credencial disponível. |
| Função publicada | Requisição inválida recebe erro estruturado do orquestrador, comprovando endpoint ativo. | Não comprova código publicado igual ao checkout nem consultas autenticadas. |

Veja [provas remotas de leitura](../live-readonly-preflight.json) e [SQL da Agenda, fontes e recuperação](agenda-database.md).

## Banco incremental e publicação

As migrations anteriores10000–40000 já aplicadas não devem ser repetidas. Esta PR propõe somente:

1. `20261017050000_workers_agenda_relationships.sql`: substitui leitores incompatíveis sem adicionar coluna antiga, mantém assinaturas existentes e acrescenta resolvedor nominal/ranking de comissões.
2. `20261017060000_workers_identity_responses.sql`: atualiza apenas helpers de sanitização para ranking/choices tipados; preserva versão1 e conversas antigas.

Ambas são transacionais; nenhuma altera dados comerciais, eventos, políticas ou tabelas. Os novos leitores exigem escopo workers e usam SECURITY INVOKER. Antes de aplicar, um operador com acesso de gestão deve comparar as definições e ACLs efetivas com o preflight; o acesso disponível nesta sessão não permitiu essa parte. Aplicar somente estas correções, publicar o orquestrador com registro gerado e frontend compatível. Nenhuma migration ou implantação em produção foi feita neste trabalho.

Recuperação: interromper o uso dos novos caminhos e restaurar o consumidor/Edge compatível previamente publicado, preservando dados, funções corretivas e conversas. Não restaurar a referência à coluna inexistente. Se for indispensável voltar ao sanitizador anterior, primeiro desativar emissão de blocos novos; restaurar os dois helpers da migration30000 em transação, mantendo as mensagens salvas. Não apagar históricos nem estruturas para reverter apresentação.

## Diagnóstico de falhas

O frontend recebe código público, mensagem curta, possibilidade de repetição e requestId. Logs restritos guardam apenas correlação, código, etapa e código técnico permitido; não incluem SQL, stack, token, argumentos ou texto da pergunta. Falha técnica não vira recusa de segurança. Limite de execução e cancelamento impedem resposta tardia; a tentativa permanece associada à pergunta.

## Limites funcionais explícitos

Filtros de ranking/pessoa ainda não suportados pela RPC não são descartados silenciosamente: o bot orienta o recorte no módulo. Documentos/versões exigem pedido identificado; total global de anexos não é inferido de contratos assinados. Recebimentos comerciais sem fonte financeira vinculada recebem orientação para Financeiro. O catálogo de150 perguntas continua apenas uma referência, sem limitar o vocabulário aceito.

## Validação

Resultados finais e capturas em [validation.md](validation.md):366 testes,44 verificações SQL, typecheck, Deno check e build aprovados. A prévia usa componentes e contrato reais, com autenticação/transporte/dados sintéticos identificados. Emulação estreita e eventos simulados de visualViewport não comprovam teclado, zoom de foco ou gestos de Safari/iPhone físico.
