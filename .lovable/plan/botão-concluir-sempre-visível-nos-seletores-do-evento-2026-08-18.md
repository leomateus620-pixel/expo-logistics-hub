# Botão "Concluir" sempre visível nos seletores do evento

## Problema confirmado

Nos seletores "Comissão ou Assessoria responsável" e "Responsáveis do evento" (Agenda Fenasoja → novo evento), o rodapé com o botão "Concluir" é cortado no desktop.

Causa verificada no CSS (`src/styles/cronograma-registration-interactions.css`):

- `.cronograma-relation-popover` tem `max-height` e `overflow: hidden`, mas **não** é um container flex em coluna. Painel e rodapé são empilhados como blocos comuns.
- A lista de resultados usa uma altura calculada por estimativa (`calc(altura disponível - 7.5rem)`), que não corresponde à altura real do cabeçalho + busca + resumo + aviso de limite de resultados.
- Quando esses blocos ocupam mais que a reserva estimada, o conteúdo ultrapassa o `max-height` e o rodapé (com "Concluir") é simplesmente recortado. Em zooms menores a estimativa passa a caber, e por isso o botão "reaparece" — exatamente o comportamento relatado.

## O que será feito

1. Transformar o popover do desktop em layout de coluna real: cabeçalho/busca fixos, lista de resultados como única área que rola, e rodapé com "Concluir" ancorado ao final, sempre visível.
2. Substituir a altura estimada da lista por altura flexível real (a lista ocupa o espaço que sobra), eliminando a dependência de zoom, fonte ou quantidade de blocos informativos.
3. Limitar a altura do popover à altura realmente disponível na tela, para que ele nunca cresça além do que cabe.
4. No mobile, garantir o mesmo comportamento: o rodapé "Concluir seleção" permanece fixo acima da área segura do aparelho e não é encoberto quando o teclado abre.
5. Aplicar o ajuste aos dois seletores (comissões/assessorias e responsáveis), já que ambos usam o mesmo componente.

## Detalhes técnicos

- Arquivo principal: `src/styles/cronograma-registration-interactions.css`.
  - `.cronograma-relation-popover`: `display: flex; flex-direction: column; min-height: 0;` e `max-height: min(34rem, var(--radix-popover-content-available-height))`.
  - `.cronograma-relation-panel`: manter `flex: 1; min-height: 0`.
  - `.cronograma-relation-results`: trocar `max-height` fixo por `flex: 1; min-height: 0` (mantendo um piso mínimo para não colapsar).
  - `.cronograma-relation-popover__footer`: `flex: 0 0 auto`, com separador e fundo próprios (já existentes).
  - Sheet mobile: `max-height` com `100dvh` e rodapé `flex: 0 0 auto` com `env(safe-area-inset-bottom)`.
- Sem alteração de lógica em `RelationalMultiSelect.tsx` (apenas CSS); se o Radix exigir, será adicionada apenas uma classe utilitária de altura no `PopoverContent`.
- Validação com Playwright abrindo o formulário de novo evento em 1280x800 e em viewport mobile, confirmando o botão "Concluir" visível em ambos os seletores, com e sem busca ativa.
