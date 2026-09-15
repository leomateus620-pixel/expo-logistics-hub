# Quadra G — remover a via interna e cadastrar os lotes 03 e 04

## Estado verificado agora

- A faixa escura no centro da Quadra G é a via `RUA-INTERNA-QUADRA-G`, ativa no cadastro (entidade de circulação criada em etapa anterior de malha viária).
- `Q-G-03` e `Q-G-04` não existem no cadastro; a Quadra G tem hoje 6 lotes.
- `B40` (Emater/Ascar) continua arquivado e não volta.
- Na referência do código, a Quadra G está marcada com conflito cartográfico pendente exatamente por causa dessa via.

## Decisão aplicada

A via interna não existe na planta oficial: ela sai, e a coluna central volta a ser ocupada pelos dois lotes documentais, com 168,00 m² cada.

## O que será feito

1. **Remover a via interna da Quadra G** — na referência do código e no cadastro (arquivamento com registro de motivo e da revisão, preservando histórico e permitindo reversão). Nenhuma outra rua é tocada; o restante da malha viária continua conectado, pois esse trecho era um corredor interno isolado da quadra.
2. **Criar `Q-G-03` e `Q-G-04`** na coluna central liberada, usando a mesma transformação cartográfica das demais colunas de G: área oficial 168,00 m² cada, conferida, sem comprador, sem preço e bloqueados para comercialização, exatamente como os lotes vizinhos recém-validados.
3. **Encerrar o conflito documentado** na Quadra G: a nota passa a registrar o histórico (B40 arquivado, via interna removida) em vez de pendência aberta, e a quadra volta a ter oito lotes.
4. **Fechar a base documental**: 169 lotes e 33.733,77 m² de área oficial; subtotal da Quadra G em 1.344,00 m².
5. **Exibição normal**: os dois lotes aparecem no mapa 3D, na busca, no explorador e nos painéis com a metragem em pt-BR, sem qualquer alteração visual nos demais lotes ou quadras.

## Detalhes técnicos

- `src/features/commercial-map/data/officialReference2026.ts`: retirada da entrada `RUA-INTERNA-QUADRA-G` de `roadInputs`; metadados de `QUADRA-G` trocam `pendingCartographicConflict` por `historicalSuppression` resolvida; `gColumns` recebe a coluna de índice 1 e `expectedLotCounts.G` passa a 8.
- Migration idempotente: arquiva a entidade da via com metadados de motivo/revisão, confere ausência de ocupação ativa remanescente no vão, cria as duas entidades `SELLABLE_LOT` + geometria corrente + registros comerciais bloqueados com `official_area_sqm` 168,00 e validação cadastral, e reexecuta o recálculo de segmentos. Rodar de novo não duplica nem zera áreas.
- Baselines de inventário de segmentos ajustados ao novo total (uma via a menos, dois lotes a mais).
- Testes atualizados: inventário 2026 (G com 8 lotes, totais), segmentos, áreas externas (total 33.733,77 m², G-03/G-04 presentes) e infraestrutura viária (a via interna de G deixa de constar).
- Validação: contagem antes/depois, conferência de que Exporural (95 registros) e pavilhões não mudam, evidência de persistência após recarga e captura da Quadra G no mapa em desktop e mobile. Nada é publicado.
