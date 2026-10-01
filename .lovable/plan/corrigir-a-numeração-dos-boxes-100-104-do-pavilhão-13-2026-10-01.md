# Corrigir a numeração dos boxes 100–104 do Pavilhão 13

## Resultado esperado
Os cinco boxes aparecem como 100, 101, 102, 103 e 104 no cadastro, no mapa comercial e nas consultas públicas, em vez de aparecerem como “10”.

## Etapas
1. Conferir novamente os cinco registros e seus vínculos antes da atualização, garantindo que cada código técnico corresponde ao número oficial esperado.
2. Atualizar apenas os nomes e números exibidos desses cinco boxes, tanto no cadastro do lote como no cadastro da entidade do mapa, em uma operação transacional autorizada. Conferir a contagem antes de gravar e interromper a operação se os registros não corresponderem exatamente aos cinco esperados.
3. Consultar os cinco registros após a atualização e verificar que nenhuma outra identidade foi modificada. Validar a exibição no mapa e no link público quando a visualização carregar.
4. Ajustar apenas eventuais verificações automatizadas diretamente relacionadas à numeração e executar os testes focados.

## Detalhes técnicos e limites
- A consulta atual confirmou que `B5-M100` a `B5-M104` mantêm a identidade técnica e `moduleNumber` corretos, mas `commercial_lots.lot_number`/`display_name` e `map_entities.name`/`metadata.lotNumber` estão truncados como “10”. A migração anterior usou `lpad(n::text, 2, '0')`, que truncou números de três dígitos.
- Por ser correção de dados existentes, usar somente a operação autorizada de atualização de dados, não uma migração de esquema nem alteração de permissões. Se a ferramenta de escrita continuar bloqueada, não contornar o bloqueio: informar que a atualização ficou pendente.
- Preservar IDs, áreas, posições, preços, status, histórico, vendas e demais pavilhões. Não criar vendas de teste nem publicar.
