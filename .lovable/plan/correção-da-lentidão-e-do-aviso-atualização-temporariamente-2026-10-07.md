# Correção da lentidão e do aviso "Atualização temporariamente indisponível" no Mapa Comercial

## Diagnóstico (confirmado no banco e no código)

O aviso aparece quando uma atualização do mapa em segundo plano falha. O mapa continua mostrando os dados anteriores, mas não recebe vendas, lotes e valores novos. As falhas vêm de lentidão, não de permissão:

1. **Leitura dos lotes muito pesada.** Cada atualização baixa os ~1.470 lotes junto com preços, vendas, contratos, reservas e negociações. Essas cinco tabelas não têm índice simples por lote. Por isso o banco percorre a tabela inteira para cada lote, e as regras de acesso são reavaliadas em cada linha lida.
   - Preços: 9,7 milhões de varreduras completas e 15 bilhões de linhas lidas desde o último reinício.
   - Vendas, contratos, reservas e negociações: ~9,6 milhões de varreduras completas cada.
   - Consulta de lotes: média de 1,3 a 3 s, pico de 7,2 s. O limite por consulta é 8 s, então com vários usuários ao mesmo tempo ela estoura o limite e a atualização falha.
2. **Atualizações em excesso.** Cada recarga refaz o mapa inteiro (~10 consultas grandes):
   - a cada 30 s com a Dashboard aberta;
   - sempre que a janela volta ao foco e os dados têm mais de 30 s;
   - a cada 10 min;
   - várias vezes seguidas depois de cada venda ou edição. Cada pedido novo cancela a carga em andamento e recomeça do zero.
   Áreas e geometrias somam ~7.600 recargas completas cada.
3. **O site real ainda roda a versão anterior do app.** A consulta antiga, que traz os preços 2028 embutidos em cada lote, é a 2ª mais lenta: média de 3 s. A otimização feita no app só vale depois de publicar.

A saúde do servidor está normal (memória 71%, conexões 15/60). Aumentar o servidor não resolveria a causa.

## O que será feito

### 1. Banco — índices (sem alterar dados)
Uma atualização pequena e rastreável que só adiciona índices:
- `lot_prices(lot_id)`, `lot_sales(lot_id)`, `lot_contracts(lot_id)`, `lot_reservations(lot_id)`, `lot_negotiations(lot_id)`;
- índices de paginação `map_entities(project_id, is_archived, id)` e `map_entity_geometries(project_id, is_current, id)`;
- `ANALYZE` das tabelas afetadas.

Não muda dados, permissões, regras de acesso nem vendas. Para desfazer, basta remover os índices.

### 2. App — atualizar só quando algo mudou
- **Verificação leve de versão do mapa:** uma consulta pequena e protegida que confere `map.view` e a organização. Ela devolve só a data da última alteração de lotes, vendas, pedidos, itens, preços e geometrias do projeto.
  - A Dashboard (a cada 30 s), o foco da janela e o intervalo periódico passam a usar essa verificação.
  - O mapa completo só é recarregado quando a versão muda.
- **Desligar a recarga automática por foco** na consulta do mapa; a verificação leve substitui.
- **Recarga única depois de vendas e edições:** um único ponto de atualização com agrupamento curto (~400 ms) e sem cancelar a carga em andamento. Ele substitui as chamadas espalhadas no checkout, na confirmação, na revisão de lotes, no editor do expositor, nos preços e na Dashboard.
- **Aviso mais justo:** uma falha isolada é repetida em silêncio uma vez antes do aviso aparecer. O aviso passa a mostrar "Última atualização às hh:mm" e o tipo da falha (demora do servidor ou conexão), e mantém "Tentar novamente".

### 3. Medição e validação
- Antes e depois dos índices, medir a leitura do mapa simulando um administrador e a conta de Felipe (só leitura, transação desfeita). Meta: lotes abaixo de 1 s.
- Conferir que os dois continuam vendo os mesmos lotes e vendas, e que as permissões não mudaram.
- Testes automáticos para a verificação de versão, o agrupamento das recargas e o aviso após falhas repetidas. Rodar os testes de sincronização já existentes.
- Conferir no navegador que o mapa carrega, uma venda de teste simulada (sem gravar venda real) atualiza a tela e o aviso não aparece em uso normal.

### 4. Publicação
Os índices passam a valer no site real assim que forem aplicados. As melhorias do app (preços numa consulta só, verificação leve, recarga única) só chegam ao site real depois de publicar. Vou pedir sua confirmação antes de publicar.

## Detalhes técnicos
- Migração: `CREATE INDEX IF NOT EXISTS` (sem `CONCURRENTLY`, que não roda dentro da transação da migração). Tabelas pequenas (<2 mil linhas), bloqueio de escrita de poucos milissegundos.
- RPC nova: `commercial_map_revision(p_project_id uuid) returns timestamptz`, `STABLE SECURITY DEFINER`, `search_path=public`. Revalida `can_view_commercial_map` para `auth.uid()`; `EXECUTE` só para `authenticated`. Não devolve dados comerciais.
- Hook `useCommercialMapRevision`, que chama `refetch({ cancelRefetch: false })` quando a versão muda. `useCommercialDashboardSync` passa a consultar a versão, não o mapa inteiro. A consulta do mapa fica com `refetchOnWindowFocus: false`.
- Utilitário `scheduleCommercialMapRefresh(queryClient)`, com debounce e `invalidateQueries({ queryKey: ['commercial-map'] }, { cancelRefetch: false })`.
- Banner com `failureCount >= 2` ou erro após o retry; mostra `dataUpdatedAt` e classifica `57014`/timeout vs rede.
- Fora do escopo: geometria, regras de venda, RLS, preços e permissões.
