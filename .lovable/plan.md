# Fluxo comercial de quatro fases — Fenasoja 2028

## Objetivo
Implantar uma única leitura comercial em todo o ecossistema:

1. **Disponível** — verde, comercializável.
2. **Venda em aberto** — amarelo forte, pedido e comprador registrados, aguardando confirmação explícita da assinatura.
3. **Vendido** — azul forte, contrato assinado confirmado por usuário autorizado.
4. **Bloqueado** — vermelho, fora da comercialização.

Reserva, negociação e indisponibilidade permanecem como condições operacionais internas, mas não serão renomeadas indevidamente como venda em aberto. Estruturas não comerciais continuam neutras.

## Situação confirmada pela auditoria
- O checkout atual grava o pedido, os itens, as parcelas e muda os lotes diretamente para `SOLD` na mesma transação.
- O caminho alternativo de venda individual também muda o lote diretamente para `SOLD`; anexar contrato é uma ação separada e não comprova assinatura.
- Os 57 lotes hoje vendidos possuem venda registrada, mas nenhum tem número ou arquivo de contrato associado. Eles permanecerão como **Vendido legado**, sem inventar assinatura ou data de confirmação.
- Não existe hoje função operacional completa para cancelar/reverter um pedido de venda.
- O mapa público reduz os estados internos a uma disponibilidade própria e não expõe documentos, contatos ou arquivos.
- O dashboard usa atualmente o valor cadastrado do lote; ele não recebe o valor efetivamente negociado e não pode tratá-lo como receita realizada.

## Implementação

### 1. Persistência, segurança e auditoria
- Adicionar o estado cadastral `SALE_OPEN` aos lotes e aos históricos de situação.
- Adicionar aos itens do pedido um estado contratual inequívoco: aguardando assinatura, assinado, cancelado ou legado sem comprovação; guardar data e usuário da confirmação/cancelamento.
- Manter o estado financeiro do pedido separado do estado do contrato e dos pagamentos.
- Marcar os itens históricos atuais como `LEGACY_UNVERIFIED`, preservando seus lotes em `SOLD`; gerar consulta/visão interna dos casos pendentes de comprovação.
- Substituir as duas funções de registro de venda para criarem **Venda em aberto** em vez de Vendido, preservando preços, taxas, parcelas, snapshots, expositor, imagem, idempotência e bloqueio concorrente.
- Criar funções protegidas para:
  - confirmar assinatura de um item ou de vários itens selecionados do mesmo pedido;
  - cancelar itens ainda abertos, retornando cada lote a **Disponível**, sem apagar pedido, parcelas, comprador ou histórico;
  - recalcular o resumo contratual do pedido após confirmação parcial ou cancelamento.
- Exigir a permissão comercial adequada no servidor, travar pedido/itens/lotes com `FOR UPDATE`, validar pedido ativo e lote em `SALE_OPEN`, e tornar confirmação/cancelamento idempotentes.
- Registrar ator, horário, pedido, itens, estado anterior e novo em histórico e auditoria.
- Impedir revenda de `SALE_OPEN`, `SOLD` ou `BLOCKED` pela elegibilidade canônica.
- Atualizar as consultas de revisão dos links públicos para refletirem imediatamente confirmação e cancelamento.

### 2. Fluxo operacional
- No checkout, alterar o comando final para **Registrar venda em aberto** e explicar na revisão que a assinatura será confirmada depois.
- No painel de um lote em aberto, exibir comprador, identificação oficial, pedido, etapa, valores e parcelas, com ações claras:
  - **Confirmar contrato assinado**;
  - **Cancelar venda em aberto**.
- Permitir confirmar apenas o lote atual ou selecionar outros itens abertos do mesmo pedido; nunca confirmar automaticamente itens não selecionados.
- Tratar duplo clique, resposta perdida e falha de rede sem mudança otimista irreversível; atualizar o mapa somente após resposta válida do servidor.
- Adaptar o formulário individual legado para criar o mesmo pedido/item em aberto, sem atalho direto para `SOLD`.
- Manter upload de contrato como evidência auxiliar privada; o upload não altera o estado sozinho.

### 3. Quatro fases em todas as telas
- Centralizar a paleta e a projeção visual:
  - Disponível: verde;
  - Venda em aberto: amarelo forte;
  - Vendido: azul forte;
  - Bloqueado/indisponível comercial: vermelho;
  - não comercial: neutro.
- Preencher toda a superfície de lotes externos e módulos internos com a cor da fase; segmento passa a ser contexto/contorno, não a cor dominante.
- Manter seleção, carrinho e hover por contorno, elevação e símbolo, evitando confusão com o amarelo de Venda em aberto.
- Exibir cadeado e logo somente em Vendido; Venda em aberto permanece amarela e sem marca de conclusão.
- Atualizar legenda, filtros, busca, tooltip, lista/tabela, fichas, plantas internas, Modo Vendas, mapa normal, minimapas e painéis.
- Preservar números contextuais somente na seleção, conforme a regra já definida para não poluir o mapa.

### 4. Dashboard e valores
- Consolidar indicadores nas quatro fases, sem somar reserva/negociação como venda em aberto.
- Separar quantidade e área de vendas abertas e vendidas.
- Mostrar pedido aberto como carteira em aberto, nunca como receita realizada.
- Calcular o valor vendido a partir do snapshot do item efetivamente assinado; manter preço cadastrado, valor negociado, parcelas e recebimentos como conceitos distintos.
- Manter um indicador interno de **Vendidos legados — comprovação pendente** para os 57 casos atuais, sem alterar sua apresentação azul.

### 5. Links públicos
- Atualizar o contrato público para `AVAILABLE`, `SALE_OPEN`, `SOLD` e `BLOCKED`, com os quatro rótulos e cores.
- Publicar somente fase, identidade permitida, área e preço já autorizados pelo escopo.
- Não expor documento, telefone, e-mail, contrato, arquivo, parcelas nem dados internos do pedido.
- Manter comprador/logo apenas onde já autorizado e somente para Vendido, usando endereços temporários; Venda em aberto não revela dados pessoais.
- Preservar todos os links, chaves, rotas, escopos e atualização automática existentes.

## Validação
- Testes unitários das transições, projeção visual, elegibilidade, totais, cores, filtros e contratos públicos.
- Testes de banco em transação isolada e revertida, sem venda oficial permanente:
  - disponível → venda em aberto → assinatura → vendido;
  - pedido com vários lotes e confirmação parcial;
  - cancelamento para Disponível;
  - tentativa de revenda;
  - lote bloqueado;
  - permissão insuficiente;
  - confirmação repetida e duas confirmações concorrentes;
  - falha/timeout com reconsulta idempotente.
- Conferir persistência após recarga e atualização automática no mapa normal, pavilhão, Modo Vendas, dashboard e link público.
- Comparar visualmente desktop e celular com lotes externos e módulos internos, verificando preenchimento integral, contraste, bordas, números, seleção, logos e ausência de piscadas.
- Executar testes focais, checagem de tipos e compilação; documentar qualquer falha preexistente separadamente.

## Limites
- Não alterar rotas, geometrias, preços, regras financeiras, pagamentos ou funcionalidades alheias.
- Não apagar nem reclassificar em massa as 57 vendas históricas.
- Não criar venda real na base oficial para testar.
- Não publicar a aplicação.
