

# Correção Global Definitiva: Modais Invisíveis

## Causa raiz identificada

A classe `.grain-texture::before` em `src/index.css` (linha 232-242) cria um pseudo-elemento com:
- `position: fixed`
- `top: 0; left: 0; right: 0; bottom: 0`
- **`z-index: 9999`**
- `pointer-events: none`

Este pseudo-elemento cobre toda a viewport com z-index 9999. Os dialogs usam `z-50` (= 50 no Tailwind). Embora `pointer-events: none` deveria permitir cliques, o problema é que **o grain overlay visualmente cobre o conteúdo do modal**, e em certos contextos de stacking (backdrop-filter no dialog, etc.), o browser pode renderizar o grain POR CIMA do modal, tornando-o invisível ou quase invisível.

A combinação de `backdrop-blur-2xl` no DialogContent com o grain overlay em z-9999 cria conflitos de compositing que tornam o conteúdo do modal não-renderizado corretamente em alguns browsers/viewports.

## Correção

### 1. `src/index.css` — Corrigir z-index do grain texture
- Alterar `.grain-texture::before` de `z-index: 9999` para `z-index: 0`
- Isso mantém o efeito visual de textura no fundo sem interferir com overlays, modais, ou qualquer elemento de UI interativo
- Adicionar escala de z-index documentada como comentário

### 2. `src/components/ui/dialog.tsx` — Elevar z-index dos modais
- Overlay: manter `z-50` (suficiente com grain em z-0)
- Content: manter `z-50` (Radix já garante stacking correto)
- Nenhuma outra alteração necessária — o dialog.tsx atual está correto estruturalmente

### 3. Validação
- Todos os modais do sistema (Novo Hóspede, Nova Tarefa, Novo Transporte, Adicionar Veículo, detalhe de veículo) passam a renderizar corretamente
- A textura grain permanece visível como efeito decorativo sutil no fundo
- Zero regressão visual

## Arquivos a editar
1. `src/index.css` — linha 238: `z-index: 9999` → `z-index: 0`

Correção cirúrgica de 1 linha que resolve o problema global.

