# Validação de banco do pacote Stallonne

As duas migrações foram executadas sobre o fixture sintético de Gastronomia em PostgreSQL embarcado em memória. O fixture reproduz as definições versionadas do cadastro, checkout, contratos, políticas de armazenamento e projeção financeira. A conferência usou dados e um objeto PDF fictícios.

| Cenário | Resultado observado |
|---|---|
| Cadastro inicial | Um lote de valor fixo sobre a geometria de J. IDs, entidades e posições dos três pontos preservados. Preço de R$ 252.280,00 nas duas etapas. |
| Checkout | Um pedido, um item, um plano de 17 parcelas manuais sintéticas e três componentes persistidos. Os vencimentos e valores sobreviveram à releitura linha por linha. A mesma chave recuperou o pedido e a repetição retornou o mesmo ID. |
| Limites | Venda, reserva e negociação avulsas recusadas. Alteração de preço, taxa adicional e carrinho misto recusados. Venda independente do Balão concluída pelo checkout. |
| Contrato | Uma versão privada com quatro vínculos explícitos. Repetição da anexação recuperou a mesma versão. A assinatura exigiu PDF e a segunda confirmação ignorou o item já assinado. A política autorizou a leitura do objeto ao perfil de contratos e negou ao perfil de vendas sem essa permissão. |
| API pública | A disponibilidade dos pontos acompanhou a do parque. Comprador e preços dos quatro elementos ficaram redigidos. Token inválido foi recusado. |
| Financeiro | Uma unidade classificada em Gastronomia. O cenário confirmado refletiu R$ 252.280,00 após a assinatura, com R$ 0,00 em recebimentos. O guard impediu o cancelamento após vincular um recebível. |
| Pedido anterior sintético | Uma unidade já cadastrada foi reaproveitada e ficou bloqueada para conciliação. O pedido antigo assinado de R$ 52.280,00 permaneceu no cenário confirmado. Nova venda, anexo avulso, mudança no cronograma e novo recebível avulso foram recusados. A atualização de liquidação no plano preexistente foi permitida. |

O cenário em memória verifica a lógica das migrações e as permissões no PostgreSQL. A homologação hospedada, a leitura do PDF original via aplicativo e a conciliação do cadastro real dependem do ambiente autorizado.

## Reprodução no fixture local descartável

Use a instância PostgreSQL de QA descrita no [guia de Gastronomia](../../commercial-map-gastronomia.md). A preparação recria somente o banco local `gastronomy_qa`. Rode uma preparação nova para cada cenário.

```sh
node scripts/gastronomy/setup-database.mjs --site-points --via-expressa-chopp --stallonne-fixture
node scripts/gastronomy/stallonne-database-qa.mjs
```

```sh
node scripts/gastronomy/setup-database.mjs --site-points --via-expressa-chopp --stallonne-fixture
node scripts/gastronomy/stallonne-database-qa.mjs --history
```
