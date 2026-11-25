# Corrigir o aviso permanente de recuperação de venda

## Diagnóstico confirmado
- Uma falha de conexão mantém a tentativa no armazenamento local, corretamente, pois o resultado da venda é incerto.
- Em `SalesCheckoutDialog`, voltar ao carrinho ou fechar limpa apenas o estado `uncertain`. Uma confirmação posterior cria outra chave, deixando a tentativa anterior pendente.
- Em `SaleAttemptCheck`, uma consulta sem pedido oferece reenvio somente quando existe `onRetry`. A recuperação no mapa não fornece essa opção nem permite remover o aviso.

## Correção proposta
1. **Permitir dispensar tentativas sem pedido encontrado.** Após uma consulta bem-sucedida que não encontre pedido, oferecer “Remover aviso” com confirmação. Informar que isso remove apenas a pendência deste navegador: não cancela uma venda nem altera contratos ou lotes. Reconsultar antes de remover; se um pedido aparecer, oferecer sua abertura em vez de dispensar o aviso.
2. **Não confundir falha de consulta com ausência de pedido.** Sem conexão, com sessão expirada, resposta inválida ou consulta em andamento, manter a tentativa e bloquear sua remoção. Não apagar pendências automaticamente por idade, nova venda ou coincidência de lotes.
3. **Preservar a tentativa incerta ao fechar o checkout.** Ao reabrir, manter a verificação e o reenvio da mesma tentativa, com a mesma chave e os mesmos dados originais. Não registrar uma nova tentativa silenciosamente. Após dispensa confirmada, permitir voltar ao formulário e registrar um novo envio com chave própria.
4. **Atualizar o mapa imediatamente.** Remover somente a tentativa selecionada, atualizar a contagem e ocultar o botão quando não restar nenhuma. Preservar as tentativas de outros operadores, projetos e vendas; fechar o diálogo ao remover a última.

## Validação
- Adicionar e executar testes de regressão para: falha antes de chegar ao servidor; fechar e reabrir o checkout; reenvio com chave original; dispensa após ausência confirmada; pedido encontrado na segunda consulta; falha de consulta sem remoção; múltiplas tentativas e isolamento por operador/projeto.
- Verificar no navegador o fluxo de falha simulada, retorno ao carrinho, reabertura, verificação e remoção, confirmando que o aviso desaparece e não retorna após recarregar.
- Exercitar o caminho autenticado quando houver sessão disponível, sem criar ou cancelar vendas reais. Relatar qualquer validação que não puder ser executada.

## Detalhes técnicos e limites
- Alterações concentradas em `SalesCheckoutDialog.tsx`, `SaleAttemptRecovery.tsx`, testes e, se necessário, utilitários de `saleAttemptStore.ts`.
- Usar os controles e a confirmação existentes no projeto; manter a consulta autorizada `get_commercial_sale_attempt` e o isolamento local por projeto e operador.
- Uma consulta sem pedido não comprova que um envio anterior nunca será concluído. A ação deve ser apresentada como remoção do aviso local, nunca como cancelamento ou prova de inexistência da venda.
- Sem SQL, migrações, implantação de funções, alteração de permissões ou publicação do frontend. A recuperação da Gastronomia 2028 permanece fora deste escopo.