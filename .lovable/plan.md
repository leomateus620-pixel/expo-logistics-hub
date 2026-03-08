

## Plano: Reformulação do DateTimePicker — Compacto, Mobile-First, Liquid Glass

### Problemas atuais
- No mobile, o Popover com Calendar ocupa espaço excessivo e fica posicionado de forma desconfortável
- Seletor de hora com dois Select separados é lento e pouco intuitivo
- Sem atalhos rápidos (Agora, Hoje, Amanhã)
- Sem sugestão automática de horário final
- Sem validação de fim > início
- Visual genérico, sem identidade Liquid Glass

### Solução

Reescrever `src/components/ui/date-time-picker.tsx` com duas experiências adaptativas:

**Mobile**: abre como **Drawer** (bottom sheet via vaul, já instalado) — compacto, natural, premium
**Desktop**: mantém **Popover** — posicionado, elegante, rápido

### Estrutura do novo componente

```text
┌─────────────────────────────┐
│ Trigger: Botão outline      │
│ "10 mar 2026 • 08:00"       │
└─────────────────────────────┘
         ↓ (click)
┌─────────────────────────────┐
│ ── Atalhos rápidos ──       │
│ [Hoje] [Amanhã] [Agora]    │
├─────────────────────────────┤
│ Calendar compacto (ptBR)    │
│  < março 2026 >             │
│  D S T Q Q S S              │
│  ...                        │
├─────────────────────────────┤
│ 🕐 Hora: [08]h : [00]min   │
│    grid de horários rápidos │
│    [08:00][09:00][10:00]... │
└─────────────────────────────┘
```

### Detalhes da implementação

**1. Trigger** — Botão outline com ícone CalendarIcon, mostra data formatada em ptBR + hora. Visual Liquid Glass.

**2. Atalhos rápidos** — Chips no topo: "Hoje", "Amanhã", "Agora" (datetime mode). Aplicação imediata.

**3. Calendário** — `Calendar` shadcn compacto, `pointer-events-auto`, ptBR. Mesmo componente atual.

**4. Seletor de hora** — Grid de chips com horários comuns (06:00 a 23:00, intervalos de 1h) + seletores Select de hora/minuto para precisão. Mais rápido que o modelo atual.

**5. Mobile (Drawer)** — Usa `useIsMobile()` para renderizar `Drawer` (vaul) no mobile em vez de `Popover`. Bottom sheet com handle, altura controlada (`max-h-[70vh]`), scroll interno.

**6. Desktop (Popover)** — Popover compacto com `w-auto`, alinhado ao campo.

**7. Visual Liquid Glass** — `bg-card/95 backdrop-blur-xl border-border` no container. Chips de atalho com `bg-white/10 hover:bg-white/20`. Chip selecionado com `bg-primary`.

### Props (sem breaking changes)
```typescript
interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  mode?: "datetime" | "date";
  placeholder?: string;
  className?: string;
}
```

A interface permanece idêntica — todas as 9 páginas que já usam o componente funcionam sem alteração.

### Arquivo modificado
- `src/components/ui/date-time-picker.tsx` — Reescrita completa (mesma interface, nova UX)

Nenhuma alteração nas páginas consumidoras — o componente é drop-in replacement.

