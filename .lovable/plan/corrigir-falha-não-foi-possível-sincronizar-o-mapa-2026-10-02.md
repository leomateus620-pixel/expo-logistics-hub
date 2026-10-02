# Corrigir falha "Não foi possível sincronizar o mapa"

## Causa (confirmada)
A seção "Vendas e contratos" criou a ligação de um contrato com vários espaços. Com isso, o banco passou a enxergar dois caminhos entre lote e contrato. A consulta que carrega o mapa pede os contratos de cada lote e agora recebe o erro "relação ambígua" (PGRST201). Por isso o mapa não carrega, tanto no app publicado quanto na prévia. Nenhum dado foi perdido.

## Correção
1. **Banco (resolve na hora, inclusive no site publicado, sem publicar):** retirar a chave estrangeira `lot_contract_lots.lot_id → commercial_lots` e substituí-la por um gatilho de validação equivalente: lote precisa existir e pertencer ao pedido do contrato. Assim o banco volta a ver um só caminho, e a consulta antiga do mapa funciona. Também roda o `NOTIFY pgrst, 'reload schema'`.
2. **App (proteção extra):** as consultas do mapa passam a indicar explicitamente o caminho `lot_contracts!lot_contracts_lot_id_fkey(...)` em `commercialMapService.ts` (linhas 89 e 523) e onde mais houver um embed igual.
3. **Verificação:** repetir a consulta pública que falhava e confirmar que não aparece mais o erro PGRST201. Confirmar que os vínculos de contrato existentes continuam no banco. Rodar os testes do mapa e da seção de vendas.

Não muda vendas, preços, lotes, contratos nem permissões. Não publica.
