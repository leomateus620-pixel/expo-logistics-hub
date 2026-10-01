# Pavilhão 13 — circulação clara, números completos e cotas limpas

## Resultado
- Substituir o trecho cinza-escuro indicado na imagem por circulação visual contínua, sem mudar módulos, acessos ou áreas.
- Exibir os boxes 100 a 104 como 100, 101, 102, 103 e 104 em todas as fichas, mapas e links públicos.
- Retirar da planta as cotas “6,00 m” sobre o box 78 e “3,25 m” indicadas na imagem, preservando as demais medidas úteis.

## Passos
1. Conferir na renderização do Pavilhão 13 qual faixa está sem cobertura de circulação clara e completar apenas esse espaço, sem criar lote, alterar geometria comercial ou interferir no clique.
2. Corrigir a fonte cadastral: os cinco registros B5-M100–104 estão gravados com `lot_number=10`, `display_name=Módulo 10`, nome da entidade e `metadata.lotNumber=10`, embora `metadata.moduleNumber` e a chave técnica registrem 100–104. Atualizar somente esses cinco cadastros para os números oficiais, por migração idempotente e condicionada à identidade técnica; preservar IDs, status, preços, áreas, contratos e snapshots históricos.
3. Remover somente as duas anotações visuais solicitadas do Pavilhão 13. Não alterar medidas nem cálculos dos boxes.
4. Adicionar testes para os cinco números completos na fonte persistida e na apresentação, ausência das duas cotas e continuidade da circulação sem sobreposição com módulos; executar testes focados e conferir, quando o mapa carregar, as vistas desktop e celular.

## Detalhes técnicos
- Referências visuais: `pavilion13CommercialReference.ts`, `CommercialPavilionModuleLayer.tsx` e as cotas de `pavilionDimensionAnnotations.ts`.
- A numeração no desenho usa a identidade cadastrada quando disponível; ajustar a fonte persistida é necessário além do encaixe tipográfico já feito.
- O mapa interno, modo Vendas e link público devem usar a mesma referência. Não alterar rotas, regras comerciais nem publicar.
