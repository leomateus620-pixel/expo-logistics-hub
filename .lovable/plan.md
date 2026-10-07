# Abertura confiável do Mapa Comercial (admin e Comissão Central)

## Causas confirmadas no código atual
- `measureCommercialMapOperation` grava `essential-data:end` também quando a carga falha (só acrescenta `failed: true`). O carregador trata a existência desse marcador como "Dados comerciais concluído" e mostra 23% mesmo sem dados. Por isso aparecem as duas telas: "Não foi possível preparar o mapa" (23%) e, logo depois, "Não foi possível sincronizar o mapa". As duas vêm da mesma falha de consulta.
- A consulta do mapa usa `retry: 1` sem distinguir o tipo de erro: uma lentidão passageira vira falha terminal depois de uma única nova tentativa.
- `commercial_map_revision` está no mesmo `Promise.all` que lotes e preços, sem limite de tempo próprio. Uma revisão lenta (já medida entre 0,5 e 23 s) prende o inventário inteiro.
- O monitor de revisão só recebe `projectId` depois que `mapQuery.data` existe, então não ajuda na primeira abertura. Isso está correto: a primeira abertura deve ser recuperada pela própria consulta, não pelo monitor.
- Ainda falta confirmar, como primeiro passo, o custo atual de `expire_commercial_reservations` e do inventário completo medido com perfis reais (admin e Comissão Central).

## O que será feito

### 1. Etapas do carregador fiéis ao estado real
- Separar o fim da medição do sucesso da operação: novo marcador `essential-data:ok` só depois de um resultado válido. O `:end`, com duração e `failed`, continua registrado para diagnóstico.
- Associar cada marcador ao número da tentativa. Um sucesso posterior limpa o erro daquela etapa sem apagar falhas da cena. Um cancelamento (navegação ou consulta substituída) é registrado como `aborted` e não conta como sucesso nem como falha.
- O carregador passa a ter quatro estados: carregando, recuperando ("Reconectando…", com o progresso parado onde estava), pronto e falha terminal. A falha terminal só aparece quando o React Query encerra as tentativas.

### 2. Recuperação automática num único responsável (React Query)
- Um classificador de erros novo: rede, timeout/57014, 408/429/5xx, cancelamento, sessão expirada, acesso negado (MAP_PERMISSION_DENIED/42501/403), estrutura ausente (42P01/42703/PGRST20x) e dados inválidos.
- `retry` e `retryDelay` da consulta do mapa passam a seguir a classe do erro:
  - falhas transitórias: até 4 tentativas, espera crescente de 1, 2, 4 e 8 s com ±20% de variação, respeitando `Retry-After`, num orçamento total de cerca de 45 s;
  - sessão expirada: uma única renovação da sessão já existente e mais uma tentativa;
  - acesso negado, estrutura ausente ou dados inválidos: nenhuma repetição.
- Sem conexão, as tentativas ficam pausadas (`networkMode` online) e voltam uma vez quando a conexão retorna. Retornar ao foco da janela não recarrega o mapa.
- O monitor periódico continua cuidando apenas de um mapa já carregado; não haverá polling novo.

### 3. Dependências secundárias fora da abertura
- A revisão sai do `Promise.all` essencial. Ela passa a ter limite de 8 s e cancelamento próprios. Se não chegar a tempo, o mapa abre com a revisão "não verificada" e o monitor a busca depois. Ela não é tratada como prova de que tudo veio de um mesmo instante.
- Logos e compradores continuam carregando separados, como já estão.
- A manutenção de reservas (`expire_commercial_reservations`) não bloqueia a leitura caso ultrapasse o limite. Ela continua rodando no servidor; só deixa de prender a tela.

### 4. Consultas lentas na origem (banco)
- Medir com `EXPLAIN (ANALYZE, BUFFERS)`, como usuário autenticado (admin e Comissão Central), o inventário, os preços por `lot_id` (paginação mantida), as geometrias atuais, a expiração de reservas e a revisão.
- Corrigir na origem o que aparecer caro:
  - o histórico de status sai da abertura, que precisa só do estado atual;
  - índices que faltarem;
  - simplificação da revisão: agregados por tabela em vez de hash de todas as linhas, se a medição confirmar que esse é o custo.
- O tempo-limite do servidor não será aumentado.
- Isso exige migration aditiva (índices e/ou redefinição de função), aplicada com o mesmo cuidado das anteriores. Nada de dados comerciais será alterado.

### 5. Perfis: admin e Comissão Central
- Percorrer, com os vínculos já gravados, todo o caminho: portal, rota, sessão, organização, permissões, projeto e inventário. Comparar o que o acesso completo e o acesso restrito por comissão pedem.
- Nenhuma permissão será concedida. Uma falha de consulta continua aparecendo como indisponibilidade, nunca como "sem acesso".

### 6. Preservar o que já carregou
- Uma atualização que falhar mantém o mapa válido do mesmo usuário, organização e escopo na tela (já garantido pela chave da consulta). A cena, a câmera e a seleção não são recriadas a cada tentativa.
- A atualização depois de uma gravação aguarda só o inventário do escopo atual, com uma única atualização pendente (já existe `scheduleCommercialMapRefresh`; vou checar que não espera consultas complementares).
- Falha ao carregar um arquivo do app depois de uma publicação: recarregar a página uma única vez, com proteção na sessão contra repetição.
- "Tentar novamente" refaz a consulta (`refetch`) e só recarrega a página como último recurso.

### 7. Verificação
Testes automatizados para:
- primeira consulta falhando e a seguinte funcionando (sem 23% falso e sem tela terminal intermediária);
- consulta cancelada;
- revisão travada (o mapa abre e a revisão fica "não verificada");
- logos lentos;
- conexão perdida e retomada;
- 403 permanente sem repetição;
- sessão expirada com uma única renovação;
- cache válido ao voltar ao mapa;
- gravação durante uma consulta em andamento, que gera uma atualização posterior.

No navegador, conferir a abertura local com sessão de admin e medir tempo e quantidade de chamadas antes e depois. A conta da Comissão Central será verificada pelo acesso que já tem, se a sessão puder ser emitida; caso contrário, fica como pendência declarada. Nenhuma venda e nenhuma permissão serão criadas.

## Detalhes técnicos (arquivos)
- `utils/commercialMapOperation.ts`, `utils/performanceDiagnostics.ts`: marcadores `:ok`/`:aborted` e número da tentativa.
- `components/CommercialMapBootLoader.tsx` (+ css): estados de recuperação e de falha terminal.
- Novo `queries/commercialMapRetryPolicy.ts`: classificador, `retry`, `retryDelay`, `Retry-After` e renovação única da sessão.
- `queries/commercialMapQuery.ts`, `hooks/useCommercialMap.ts`: aplicam a política e o modo online.
- `services/commercialMapService.ts`: revisão e manutenção de reservas fora do caminho crítico, com limite próprio.
- `CommercialMapPage.tsx`: aviso discreto de recuperação; "Tentar novamente" usa `refetch`.
- Recuperação de arquivo após publicação: no carregador preguiçoso da cena.
- Migration aditiva, se as medições confirmarem necessidade.
- Testes novos em `src/test/`.

## Fora do escopo / entrega
- Sem publicação. Vou informar separadamente o que entrou no código, o que foi aplicado no banco e o que depende de publicação.
