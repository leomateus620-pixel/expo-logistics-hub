

# Compactar o DateTimePicker dentro dos diálogos de Hóspedes

## Problema

O calendário do `DateTimePicker` usa células de 36px (`w-9 h-9`) e padding generoso, ocupando espaço excessivo dentro do diálogo de hóspedes — especialmente quando há dois pickers (check-in e check-out). No desktop, o popover fica grande demais; no mobile, o drawer consome quase toda a tela.

## Solução

Criar uma variante compacta do calendário e do picker, reduzindo tamanho das células e espaçamento sem alterar o componente `Calendar` global (que é usado em outros lugares).

## Alterações

### `src/components/ui/date-time-picker.tsx`

1. **Passar `classNames` customizados ao `Calendar`** para reduzir tamanho das células:
   - Células de `w-9 h-9` → `w-7 h-7` (28px)
   - Dias com `h-7 w-7 text-xs`
   - Caption label `text-xs`
   - Nav buttons `h-6 w-6`
   - Padding do calendário `p-1` (já está)

2. **Compactar a seção de horários**:
   - Chips de hora com `text-[10px] px-1 py-0.5`
   - Select triggers `h-7 w-[60px] text-[11px]`

3. **Compactar os shortcuts**:
   - Padding mais apertado `px-1.5 pt-1.5 pb-0.5`
   - Ícone Zap `h-3 w-3`

4. **PopoverContent (desktop)**: limitar largura com `w-[260px]`

5. **DrawerContent (mobile)**: manter `max-h-[50vh]` no conteúdo scrollável para não dominar a tela

### `src/pages/GuestsPage.tsx`

- Nenhuma alteração necessária — o componente `DateTimePicker` já é usado inline e a compactação será automática.

## Resultado

- Calendário ~30% menor em ambas as plataformas
- Não afeta outros usos do componente `Calendar` (agenda, etc.)
- Header e botão do diálogo de hóspedes permanecem sempre visíveis
- Picker continua funcional com todos os atalhos e seleção de horário

