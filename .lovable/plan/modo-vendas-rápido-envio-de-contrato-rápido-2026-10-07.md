# Modo Vendas rápido + envio de contrato rápido

## O que foi encontrado
- **Seleção de lotes lenta:** a cada lote clicado, o carrinho pede de novo ao servidor os preços de *todos* os lotes selecionados (a lista inteira vira uma busca nova). A tabela de preços 2028 é uma consulta pesada, então cada clique espera de 5 a 10 segundos ou mais. Nesse intervalo o carrinho mostra "sem valor oficial definido" e "Calculando valores…", mesmo quando o lote tem preço.
- **Lista do carrinho quebrada (prints 1 a 3):** durante o carregamento, o texto "Lote 02 Quadra E" aparece uma letra por linha. O layout da linha some quando ainda não há valor.
- **"Atualização não confirmada":** a verificação de versão do mapa roda junto e disputa o mesmo servidor ocupado. Ela estoura o tempo e mostra o aviso, mesmo sem nenhuma falha real.
- **Contrato lento:** o envio sobe o arquivo e depois registra no banco, um passo depois do outro, sem progresso visível. A causa exata vai ser medida antes da correção (ver passo 1).

## O que muda
1. **Medir antes de mexer:** cronometrar a leitura de preços, a verificação de versão e o envio de contrato (upload e registro, separados) com uma conta real, sem gravar dados.
2. **Preços instantâneos no Modo Vendas:**
   - Ao entrar no modo, todos os preços do mapa são carregados uma única vez, numa só busca por projeto, e guardados por lote. O próprio mapa já busca esses preços ao abrir, então a maior parte já vem pronta.
   - Selecionar ou remover um lote passa a só ler o que já está guardado, sem esperar o servidor. Área, valor e total aparecem na hora.
   - Se algum lote ainda não estiver guardado, só esse lote é buscado. Os outros continuam aparecendo normalmente.
   - O aviso "sem valor oficial" só aparece quando o preço realmente não existe, nunca durante o carregamento.
3. **Carrinho estável:** a linha de cada lote fica sempre na horizontal, com espaço reservado para o valor (aparência de carregando só no valor, não na linha toda).
4. **Sem aviso falso de atualização:** enquanto o Modo Vendas estiver aberto, a verificação de versão do mapa fica em espera. Um tempo esgotado isolado não mostra mais "Atualização não confirmada". O aviso só aparece depois de falhas repetidas.
5. **Contrato rápido:**
   - Progresso visível: "Enviando 45%" e depois "Registrando".
   - O botão é liberado assim que o banco confirma, e as listas se atualizam em segundo plano, sem prender a janela.
   - Se a medição mostrar que o registro no banco é o gargalo, ele recebe um ajuste pontual. Se o gargalo for o upload, o arquivo vai direto para o armazenamento privado, sem passos extras.
6. **Testar e aprovar:**
   - Testes automáticos para o carrinho (preço guardado, lote faltante, troca de etapa) e para o aviso de atualização.
   - Teste no navegador: selecionar 1, 3 e 6 lotes, com meta de valores em menos de 300 ms depois do primeiro carregamento.
   - Envio de contrato medido de ponta a ponta, só até a tela de envio: nenhum contrato real é anexado.

## Seguranças
- Nenhuma mudança em preços, vendas, permissões ou regras de checkout.
- O valor final continua sendo conferido pelo servidor ao registrar a venda, então valores antigos guardados não geram venda errada.
- Nada é publicado sem seu pedido.

## Detalhes técnicos
- `useSalesCart`: trocar a chave `['sales-pricing', lotIds]` por um índice do projeto (`['commercial-map','sales-pricing-project',projectId]`, staleTime de 5 min). O índice é semeado pelos preços que `commercialMapService` já carrega. Os campos que faltam (preço por m², área, regra) vêm em uma busca por projeto, com fallback `.in()` só para os ids ausentes. Usar `placeholderData` e um `loading` por linha.
- `summarizeCart`/`SalesCart`: estado `pending` por linha, separado de `unpriced`. CSS da linha com `min-width:0`, `flex-direction:row` e texto com reticências.
- `useCommercialMapRevision`: pausar enquanto `salesModeActive` estiver ativo. Exigir 2 falhas consecutivas antes do aviso.
- `attachOrderContract`: usar o progresso de upload (XHR ou upload com acompanhamento), e invalidações sem `await` no `onSuccess`. Rodar EXPLAIN em `attach_order_contract` e na view `commercial_lot_pricing_2028`. Criar índice aditivo só se a medição justificar.
