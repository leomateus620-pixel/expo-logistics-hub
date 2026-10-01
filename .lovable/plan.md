# Corrigir a numeração dos boxes 100–104 do Pavilhão 13

## Objetivo
Os boxes B5-M100 a B5-M104 aparecem como "10" no mapa, nas vendas e nos links públicos. Eles devem aparecer como 100, 101, 102, 103 e 104.

## Como será feito
A ferramenta de escrita direta continua desligada nas suas configurações, e eu não vou contornar essa proteção. Vou usar o outro caminho oficial: uma atualização do banco que abre um cartão de aprovação. Ela só será aplicada depois que você aprovar esse cartão.

1. Atualizar só os cinco cadastros, ligando cada código técnico ao número certo:
   - B5-M100 → 100
   - B5-M101 → 101
   - B5-M102 → 102
   - B5-M103 → 103
   - B5-M104 → 104
2. Antes de gravar, confirmar que existem exatamente cinco registros. Se houver qualquer diferença, nada será alterado.
3. Depois, consultar o banco para confirmar que os cinco aparecem com o número certo e que o box 99 e os demais continuam iguais.
4. Ajustar o teste antigo que ainda espera a cota "6,00" no lote 78, que você pediu para remover.

## O que não muda
Áreas (3 m²), preços, estado comercial (Disponível), códigos técnicos, vendas, histórico e geometria continuam iguais. Nada será publicado.

## Detalhes técnicos
- Migração de dados idempotente, em um único bloco transacional (`DO $$ ... $$`), com `RAISE EXCEPTION` se a contagem de pares (`map_entities` + `commercial_lots`) com módulo técnico B5-M100–104 for diferente de 5.
- Campos corrigidos: `map_entities.name`, `map_entities.metadata->>'lotNumber'`, `commercial_lots.lot_number`, `commercial_lots.display_name` ("Módulo 100" etc.). O número vem do `moduleNumber` já correto e não é recalculado com `lpad`.
- O `WHERE` só aceita registros que ainda estejam como "10", então rodar a migração de novo não muda nada.
- Fica registrado em `audit_log` / `map_activity_logs`, como nas revisões anteriores do Pavilhão 13.
- Ajustar a expectativa em `src/test/commercialMapPavilionEdgeDimensions.test.ts` e rodar de novo os testes focados do Pavilhão 13.
