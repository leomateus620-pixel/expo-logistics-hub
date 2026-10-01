# Corrigir a revisão da venda e definir 17 parcelas como padrão

## Resultado esperado
- A revisão mantém as informações do expositor, dos espaços, dos valores e do pagamento alinhadas e legíveis, mesmo com razão social, CPF/CNPJ ou e-mail longos.
- Ao avançar de **Expositor** para **Pagamento**, a opção inicial será **Boleto parcelado**, com **17 parcelas já calculadas** sobre o total atualizado (espaços + taxas), sem precisar clicar em “Aplicar parcelas”. O usuário ainda poderá escolher PIX, boleto à vista ou mudar quantidade, datas e valores antes de confirmar.

## Implementação
- Corrigir os estilos conflitantes da revisão: a regra geral `.sales-review dl` hoje sobrepõe as regras específicas dos grupos de dados e totais, produzindo colunas espremidas como no primeiro anexo. Restringir os estilos aos grupos certos e estabelecer larguras mínimas, quebra de texto e alinhamento estável para desktop e celular.
- Inicializar o pagamento parcelado com 17 vencimentos mensais no dia 5 a partir de 05/12/2026, usando a distribuição exata em centavos já existente; recalcular automaticamente quando o total mudar, preservando ajustes manuais e escolhas explícitas do usuário.
- Acrescentar testes para o padrão de 17 parcelas, soma correta com taxas e alternância de forma de pagamento. Verificar a revisão em tamanhos de tela próximos aos dois anexos e em celular, sem registrar venda real.

## Limites
- Não alterar preços de lotes, vendas existentes, cálculos financeiros do servidor, permissões ou rotas; não publicar.
