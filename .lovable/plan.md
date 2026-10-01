# Digitação simples dos valores de taxas na venda

## Resultado esperado
- Nos campos **Taxa administrativa**, **PPCI** e **Limpeza ou licença**, digitar `45` representa **R$ 45,00**, sem exigir `45,00`.
- Valores com centavos continuam aceitos: `45,50` representa R$ 45,50; `1.234,56` representa R$ 1.234,56.
- O subtotal das taxas, o total da venda e as 17 parcelas automáticas se atualizam com o valor correto enquanto o usuário preenche.

## Detalhes técnicos
- Os três campos hoje reutilizam o mesmo controle dos valores individuais das parcelas; esse controle extrai todos os dígitos como centavos, portanto `45` vira R$ 0,45. Criar um modo de digitação em reais **só para os campos de taxas**, mantendo o modo de parcelas existente.
- Manter o texto digitado estável durante a edição e formatar como dinheiro ao sair do campo; preservar valores com vírgula, separador de milhar, zero e limpeza do campo.
- Testar entrada por teclado/colagem e conferir a soma em centavos, o recálculo das parcelas e a revisão, sem registrar venda real nem modificar regras financeiras no servidor.

## Limites
- Não alterar preços de lotes, vendas registradas, formas de pagamento, rotas ou permissões; não publicar.
