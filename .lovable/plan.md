## Corrigir cálculo de horas dos carrinhos elétricos no PDF

### Problema identificado

O PDF atual usa `cart_reservations` (reservas agendadas) para somar horas, retornando apenas **21,6h**. Esse não é o uso real — é só a soma das reservas planejadas.

A tela "Uso de Carrinhos Elétricos" (`/electric-carts/report`), que o usuário toma como fonte de verdade (~585h), calcula a partir de `cart_history`, pareando cada `retirada` com a `devolucao` seguinte do mesmo carrinho.

### Validação no banco

Aplicando o **mesmo algoritmo da tela** (pareamento retirada→devolução em `cart_history`):

- Últimos 7 dias (filtro padrão da tela): **578,5h** ≈ os 585h informados ✅
- Período 28/04 → 07/05 (período do relatório): **854,2h** (sessões fechadas dentro da janela)
- Histórico completo: 1.094,9h

A diferença ocorre porque várias sessões iniciam num dia e terminam em outro, e o filtro por `created_at` da tela considera só eventos cuja retirada caiu na janela.

### Correção no script `/tmp/relatorio/gen.py`

Substituir o bloco "CARRINHOS ELÉTRICOS" (linhas 107-112) para:

1. Ler `cart_history` no período `2026-04-28` → `2026-05-08` (mesmo recorte do PDF).
2. Parear `retirada` com a próxima `devolucao` por `cart_id` (mesma lógica de `useCartUsageReport.ts`).
3. Somar as durações em horas → novo `horas_carrinhos`.
4. `qtd_reservas` passa a representar o **número de sessões de uso** (mais coerente com a métrica de horas) — ajustar rótulo na seção/tabela para "Sessões de uso".
5. `hist_retiradas` continua igual.

### Texto do PDF

- Manter o cartão "Horas de uso acumuladas" mas com o valor recalculado.
- Atualizar a frase "X horas de utilização acumulada" para refletir o novo número.
- Adicionar nota de rodapé na seção: "Cálculo idêntico ao da tela Uso de Carrinhos Elétricos (pareamento retirada→devolução)."

### Decisão pendente

Qual período você quer fixar para essa métrica no PDF?

- **(A) Período do relatório (28/04 → 07/05)** → resultado **854h** (mais coerente com o resto do PDF, que é todo desse recorte).
- **(B) Últimos 7 dias** → resultado **~579h** (≈ os 585h que você vê na tela hoje, pois a tela está em "Últimos 7 dias").
- **(C) Histórico completo** → 1.095h.

Confirmando essa escolha eu rodo o script, faço QA visual página a página e entrego o PDF v2.

### Execução

1. Editar `/tmp/relatorio/gen.py` com o novo cálculo + texto.
2. Rodar `python /tmp/relatorio/gen.py` → `/mnt/documents/Resumo_Operacional_Logistica_Fenasoja_2026_28abr-07mai_v2.pdf`.
3. QA com `pdftoppm` em todas as páginas (overflow, sobreposição, cortes).
4. Entregar via `<lov-artifact>`.

Sem mudanças no código do projeto — apenas re-execução do script.