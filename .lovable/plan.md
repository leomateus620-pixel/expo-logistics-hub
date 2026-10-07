# Lentidão e falhas intermitentes — Mapa Comercial, Vendas e Agenda Fenasoja

## O que já foi confirmado (leituras desta rodada)

| Ponto | Situação real |
|---|---|
| Índices por `lot_id` e de paginação | Aplicados no banco em uso; o plano usa o índice (consulta de lotes 252 ms → 17 ms, como dono, sem as regras de acesso). |
| `commercial_map_revision` | Existe; com a conta de Felipe respondeu entre 0,5 s e 23 s, às vezes com erro 500. Falhas são ignoradas em silêncio e a recarga de segurança é de 30 min. |
| Versão publicada | Não verificada: o site real pode ainda servir o app anterior. A conferência é o primeiro passo. |
| Logos | `commercialMapService` espera a função de logos **antes** de devolver os lotes, no mapa completo e no da comissão. |
| Compradores | Uma falha de leitura vira "sem comprador" (mapa vazio), sem estado próprio. |
| Servidor | Instância "Tiny"; tempos muito variáveis mesmo com o banco ocioso. Hipótese: CPU limitada — depende de medição. |
| Organização | `useCurrentOrg` inclui `isError` em `isLoading`; `OrgGuard` mostra spinner infinito em vez de erro com recuperação. |
| Agenda — erros | `cronograma-rpc.ts` só reconhece `CODIGO: detalhe`; o código sozinho vira "erro desconhecido, tente novamente". |
| Agenda — trava | `agenda_private.cronograma_begin_save` trava **a organização inteira** em todo salvamento, com a mesma chave das operações do Restaurante/Arena (`venue_*`, `sync_restaurant_source`) e de `cronograma_begin_delete`. Eventos sem relação com o Restaurante ficam em fila. |
| Venda — cadastro | `useExhibitorAutosave` espera a gravação anterior e depois grava de novo os mesmos dados; `SalesCheckoutDialog` aguarda essa gravação para avançar. |
| Venda — tentativa | A chave da venda existe só na memória da tela (`useState`); não sobrevive a recarregar a página e não há verificação do resultado de uma tentativa incerta. |
| Reservas | `expire_commercial_reservations` roda antes do inventário a cada carga; hoje há 0 reservas ativas, então o custo é a chamada em si — será medido. |

Os registros de diagnóstico antigos do repositório são evidência histórica, não medição nova.

## Etapas

### 0. Conferir o ambiente e medir o "antes"
- Identificar a versão servida no site real e comparar migrations, funções, índices e regras de acesso aplicadas com o código.
- Medição leve por operação (ID de operação, sem dados pessoais) em quatro caminhos: abrir o mapa, selecionar um lote, avançar o cadastro da venda e salvar um evento.
- Etapas separadas: sessão, organização, permissões, manutenção de reservas, inventário, preços, compradores, logos, transformação local e resposta da gravação.
- Planos de consulta medidos com perfis representativos: administrador, Felipe (só `map.view`) e um membro de comissão.

### 1. Organização: erro ≠ carregando ≠ sem acesso
- `useCurrentOrg` passa a devolver os três estados separados.
- `OrgGuard` mostra "Não foi possível verificar seu acesso", com "Tentar novamente" (nova consulta, sem recarregar a página) e "Sair".
- A permissão antiga em cache não libera operações. Rascunhos locais da mesma sessão e organização são mantidos durante a falha.

### 2. Mapa: o essencial primeiro
- O inventário volta assim que lotes, preços e geometria chegam.
- Logos viram consulta própria (cache, cancelamento, sem imagem quando falha).
- Compradores viram consulta própria com estado "indisponível". Uma falha mostra "identificação indisponível", nunca "sem comprador".
- Leituras ganham limite de espera e cancelamento propagado até a consulta.
- Os erros passam a ser classificados como rede, tempo esgotado, autorização, validação ou conflito.
- O diagnóstico separa espera de rede de transformação local.
- Avaliar trazer só o registro atual de preço/reserva/negociação/contrato por lote, mantendo o histórico onde ele é exibido. Isso só entra se a medição mostrar ganho.

### 3. Atualização depois de salvar (revisão + agrupamento)
- A revisão passa a ser lida junto com a carga do inventário. A tela só adota uma revisão como referência quando ela corresponde aos dados carregados, nunca uma revisão nova sobre dados antigos.
- Se algo for salvo durante uma carga em andamento, fica marcada **uma** atualização pendente, executada ao final dela, sem cancelar a carga.
- Falhas seguidas da verificação passam a ser contadas, junto com o tempo desde a última verificação bem-sucedida. Depois de um limite definido (ex.: 3 falhas ou 5 min):
  - aparece o aviso "Atualização não confirmada desde hh:mm";
  - roda uma única recarga de recuperação, com intervalo mínimo entre tentativas;
  - o aviso some ao recuperar.
- O mapa inteiro nunca volta a ser recarregado a cada minuto.

### 4. Cadastro da venda sem gravação repetida
- Para os mesmos dados e contexto, `useExhibitorAutosave` reaproveita a gravação em andamento.
- Depois de esperar uma gravação, confere se o conteúdo atual já foi salvo.
- Respostas que chegam depois de fechar ou reiniciar o formulário são ignoradas.
- O avanço da etapa espera no máximo um tempo curto. A venda leva os dados do expositor como cópia e o cadastro termina em segundo plano.

### 5. Conclusão da venda recuperável
- A chave e o conteúdo da tentativa ficam guardados na sessão do navegador até um resultado confirmado.
- Fechar e reabrir o diálogo, ou recarregar a página, não troca a chave.
- Em tempo esgotado ou rede caída, a tela mostra "Resultado ainda não confirmado" e oferece "Verificar". A verificação reenvia a **mesma** chave, que o servidor já reconhece e responde com a venda original, sem duplicar.
- Nunca mostra "falhou" quando o servidor pode ter gravado.
- Medir elegibilidade, preço e espera por travas dentro do registro, preservando a transação e a ordem estável das travas dos lotes.

### 6. Agenda: erros e recuperação
- `cronograma-rpc.ts` reconhece o código sozinho e o código seguido de `:` e detalhes. Configuração ausente, destino inválido, responsável inválido e título fora das regras mostram a orientação certa, sem sugerir repetir.
- `useCronogramaEventos` distingue "a lista não atualizou" (aviso + "Atualizar") de "a gravação está indisponível". Um erro de leitura deixa de bloquear o cadastro de forma persistente.
- A chave e os dados da tentativa ficam guardados quando o resultado é incerto, com a mesma verificação segura da venda.

### 7. Agenda: trava só quando o Restaurante está envolvido (depende da medição)
- Medir as esperas da trava por organização em `cronograma_begin_save`, `cronograma_begin_delete` e nas operações do Restaurante.
- Se a contenção se confirmar, criar uma migration:
  - eventos que entram, saem ou já estão vinculados ao Restaurante mantêm a trava da organização;
  - os demais usam uma trava por evento;
  - salvar, excluir e mudar situação adquirem as travas na mesma ordem (organização, depois evento).
- Transação atômica, unicidade, versões, recibos e a validação pelo responsável Roque ficam iguais. Google e a atualização da lista continuam em segundo plano e não entram nessa mudança.

### 8. Validação dirigida
- Testes com QueryClient real:
  - falha de organização seguida de recuperação;
  - logos lentos sem bloquear o inventário;
  - avanço durante o autosave com uma única gravação;
  - alteração durante uma carga antiga, com uma única atualização posterior correta;
  - revisão falhando em sequência, com aviso e uma única recuperação.
- Gravações, sem criar vendas ou eventos reais:
  - resposta perdida depois de uma venda gravada: a verificação devolve o pedido original. Usa recibos existentes ou um banco descartável.
  - erros específicos da Agenda;
  - dois eventos independentes salvando ao mesmo tempo, mais um evento vinculado ao Restaurante, no banco descartável.
- Comparar antes e depois nos mesmos caminhos: duração, chamadas repetidas e falhas.

### 9. Entrega
O relatório final separa: causas confirmadas, hipóteses que dependem do ambiente, arquivos alterados e o efeito de cada um, migrations necessárias, o que foi aplicado com autorização e o resultado no site publicado. A publicação e o possível aumento do servidor ficam para confirmação explícita.

## Detalhes técnicos
- Arquivos previstos:
  - `useCurrentOrg.ts`, `OrgGuard.tsx`;
  - `commercialMapService.ts`, `commercialMapQuery.ts`, `useCommercialMap.ts`, `commercialMapOperation.ts`, `performanceDiagnostics.ts`;
  - novo `useSaleLogos`/`useLotBuyers`;
  - `commercialMapRefresh.ts`, `useCommercialMapRevision.ts`, `CommercialMapPage.tsx` (aviso);
  - `useExhibitorAutosave.ts`, `SalesCheckoutDialog.tsx`, `useSalesCheckout.ts`, `salesService.ts`, `salesErrors.ts`, novo `salesAttemptStore` (sessionStorage);
  - `cronograma-rpc.ts`, `useCronogramaEventos.ts`;
  - testes em `src/test/`.
- Revisão vinculada à carga: `fetchCommercialMap` chama `commercial_map_revision` no início da carga e devolve `revision` no resultado. O hook compara com `data.revision`. Se houver `pendingRefresh` durante o `isFetching`, refaz uma vez ao terminar.
- Banco (só se a medição justificar, com migration rastreável): trava condicional em `agenda_private.cronograma_begin_save`/`cronograma_begin_delete`, com `hashtextextended(event_id, …)` para eventos não vinculados e ordem organização→evento. Nenhuma regra de acesso é afrouxada.
- Fora do escopo: WebGL/renderização, regras comerciais, cálculos, identidade de lotes, permissões e integração Google.
