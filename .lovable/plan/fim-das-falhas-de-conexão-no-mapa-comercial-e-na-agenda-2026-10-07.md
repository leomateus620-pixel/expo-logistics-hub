# Fim das falhas de conexão no Mapa Comercial e na Agenda

## O que a análise mostrou
- **O servidor está de pé, mas fica sobrecarregado em alguns momentos.** Agora ele está saudável (memória em 54%, 6 de 60 conexões em uso, nenhum reinício). Mesmo assim, às 13:17 de hoje o próprio login não conseguiu falar com o banco ("tempo esgotado ao conectar") por cerca de 20 segundos. Nesse intervalo, todas as telas falham juntas. É exatamente o "Tentar novamente" do Mapa e da Agenda.
- **O site publicado já tem as correções anteriores**, incluindo a reconexão automática. Ou seja, o problema não está mais na tela: está no tempo de resposta do banco.
- **A causa principal está nas regras de acesso do banco, não no volume de dados.** O mapa tem poucos dados: 1.637 lotes, 1.804 entidades e 1.805 geometrias. Mesmo assim, as leituras levam de 1 a 3 segundos em média e até 7,7 segundos nos picos, e a lista de entidades sozinha já foi pedida 7.941 vezes. Sem as regras de acesso, a mesma leitura leva cerca de 0,1 segundo. O motivo está na forma como as regras checam quem pode ver o quê:
  - A regra das entidades roda uma checagem completa de permissão para cada uma das 1.804 linhas.
  - As tabelas ligadas aos lotes (preços, vendas, reservas, negociações e contratos) checam a permissão consultando os lotes e as entidades. Essas duas tabelas também têm regras, então as checagens se encadeiam e multiplicam o custo.
  - A abertura do mapa pede 5 dessas tabelas juntas com os lotes, então o custo se multiplica de novo.
- **Com vários usuários abrindo o mapa ao mesmo tempo**, essas leituras ocupam o servidor inteiro. Quando uma falha, as novas tentativas automáticas somam ainda mais carga. Nesse momento a Agenda, que divide o mesmo banco, também fica lenta: a leitura dos eventos chegou a 7 segundos.
- **A Agenda bloqueia a tela inteira por uma única falha.** Quando a checagem de "a qual organização este usuário pertence" falha 3 vezes seguidas, a tela fica presa em "A conexão com o servidor falhou", mesmo para quem acabou de usar o sistema.
- O banco já desfez 143 mil operações desde que foi ligado, o que indica muitas consultas canceladas por tempo esgotado. Isso será conferido junto com a medição (passo 1).

## O que vou fazer
1. **Medir com usuários reais**, só lendo e sem gravar nada: um administrador e o Felipe (só consulta). Cronometrar as leituras do mapa e da Agenda antes e depois de cada mudança.
2. **Deixar as regras de acesso leves, sem mudar quem vê o quê:**
   - A permissão passa a ser calculada uma vez por consulta, e não uma vez por linha.
   - As tabelas ligadas aos lotes deixam de encadear checagens: cada uma consulta uma lista pronta de lotes visíveis para aquele usuário.
   - As regras atuais ficam guardadas, para voltar atrás na hora se for preciso.
   - Conferência ponto a ponto, antes e depois, de que cada perfil vê exatamente os mesmos lotes, preços e vendas: administrador, comissão, Felipe e visitante sem login.
3. **Abertura do mapa em uma única leitura no servidor:** uma função que confere a permissão uma vez e devolve lotes, estado comercial e preços prontos. Ela substitui a leitura de lotes com 5 tabelas juntas e a leitura separada de preços. Nomes de compradores continuam saindo sem documento, contato ou pagamento.
4. **Menos novas tentativas em cascata:** quando o servidor responde "ocupado", as novas tentativas esperam mais e não se acumulam entre abas e telas abertas. Leituras secundárias (logos, compradores, verificação de versão) param enquanto o servidor estiver ocupado.
5. **Agenda resistente a falhas rápidas:**
   - Quem já entrou nesta sessão continua usando a tela durante uma falha passageira, com um aviso discreto de "Reconectando…". Os dados continuam protegidos pelo servidor, que ainda confere a permissão em cada leitura.
   - O bloqueio total só acontece em falha prolongada ou quando o servidor confirma que não há acesso.
   - A leitura de eventos da Agenda também recebe o mesmo ajuste de regras do passo 2.
6. **Teste de carga e aprovação:**
   - Abrir o mapa e a Agenda várias vezes ao mesmo tempo (por exemplo, 10 aberturas simultâneas) e conferir que nenhuma cai em "Tentar novamente".
   - Meta: dados do mapa em menos de 2 segundos e Agenda em menos de 1 segundo.
   - Testes automáticos para as permissões e para o comportamento durante falhas.
7. **Só se ainda faltar capacidade depois disso:** recomendar aumentar o tamanho do servidor do Lovable Cloud, mostrando os números medidos.

## Seguranças
- Nenhuma venda, preço, lote, evento ou permissão é alterado. Só muda a forma como o banco confere o acesso.
- Toda mudança no banco fica registrada e pode ser revertida.
- Nada é publicado sem seu pedido. Como o problema está no banco, as mudanças dos passos 2 e 3 passam a valer na hora para todos, inclusive no site publicado.

## Detalhes técnicos
- Medição: `lovable auth-session --json --user <uuid>` mais chamadas REST cronometradas (curl ou Playwright) com o token do admin e do Felipe. Comparar com a mesma consulta em `EXPLAIN ANALYZE` como superusuário.
- Novas funções `STABLE SECURITY DEFINER` com `search_path` fixo, que devolvem conjuntos: `map_viewable_project_ids()`, `map_visible_segment_ids()` e `map_visible_lot_ids()`.
- Políticas reescritas no formato `project_id IN (SELECT ...)` e `lot_id IN (SELECT map_visible_lot_ids())`, que viram InitPlan calculado uma vez por consulta. Isso troca a chamada `map_can_access_segment(segment_id)` por linha e os `EXISTS` que entram em tabelas que também têm RLS. Usar `(select auth.uid())` em `cronograma_eventos_select`.
- Snapshot das políticas antigas em `map_rls_policy_snapshots`, com migration de rollback.
- RPC `commercial_map_lots_snapshot(p_project_id, p_scope)`, SECURITY DEFINER, que revalida `map.view` ou o segmento da comissão uma única vez. `commercialMapService` passa a usá-la no lugar de `COMMERCIAL_LOT_BASE_SELECT` com embeds mais `PRICING_2028_COLUMNS`. O fallback antigo fica atrás de flag.
- `commercialMapRetryPolicy`: piso maior para 429/503/57014, deduplicação entre abas via `BroadcastChannel` e pausa das consultas secundárias quando a principal está em recuperação.
- `useCurrentOrg`/`OrgGuard`: com vínculo já confirmado nesta sessão para o mesmo usuário, a falha transitória não bloqueia. Retry com backoff até cerca de 30 segundos antes da tela de erro.
- Registrar em `AGENTS.md` a regra "políticas RLS do mapa usam conjuntos calculados uma vez por consulta, nunca funções por linha nem EXISTS em tabelas com RLS".
