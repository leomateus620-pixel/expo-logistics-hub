# Pavilhão 13 — números 100–104 e alinhamento das ilhas

## O que será corrigido
1. **Boxes 100 a 104 mostrando "10"**: os números de três dígitos passam a aparecer completos ("100", "101" … "104") em todas as vistas da planta interna (mapa normal, modo Vendas e link público).
2. **Alinhamento da ilha central**: a ilha dupla (boxes 27–78) fica alinhada às fileiras laterais — mesmo início e fim no sentido do comprimento e corredores com a mesma largura dos dois lados, conforme o PDF `Ajuste_Pav13_1`.

## O que não muda
Áreas, números oficiais, preços, estados de venda, vendas, IDs técnicos (B5-M001–104) e rotas.

## Detalhes técnicos
- Causa provável do "10": em `CommercialPavilionModuleLayer.tsx` o ajuste do tamanho da fonte à largura da célula só ocorre quando `screenAlignedLabels` está ativo; nas demais vistas o texto de 3 dígitos excede a célula e é cortado. Ajustar o redimensionamento para sempre caber (largura útil × ~0,8), para qualquer rotação. Primeiro passo: confirmar com teste que o rótulo resolvido é "100"–"104" (e não truncado nos dados).
- Ilha: hoje em `pavilion13CommercialReference.ts` a ilha ocupa z=6–32 e x=6,9–12,9, enquanto as laterais oeste vão de z=6–15 e 22,8–37,8. Recalcular a ilha (bounds e `internalPlanRuns` na revisão persistida via nova migração idempotente `2028.2-p13.6`) para ficar centrada no eixo x entre as fileiras laterais e com extremos em z coincidindo com as fileiras laterais, mantendo os 52 boxes e suas áreas.
- Atualizar `commercialMapPavilion13Official2028.test.ts` (rótulos de 3 dígitos, corredores simétricos, extremos alinhados) e rodar os testes focais e o build.
- Validação visual via navegador pode seguir limitada pelo carregamento do mapa 3D; isso será informado se acontecer.
- Mudanças aparecem no link público após publicar.
