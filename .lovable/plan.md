

# Padronizar header da Agenda com os demais menus

## Problema
O header da Agenda usa um container glass especial (`backdrop-blur-xl bg-white/[0.04] border border-white/10 rounded-2xl`) com título em gradiente dourado, enquanto todos os outros menus usam um layout simples sem container decorativo — apenas `h1` com `text-xl sm:text-2xl font-bold tracking-tight` e `p` com `text-sm text-muted-foreground`.

## Mudança

### `src/pages/AgendaPage.tsx` (linhas 284-288)

Remover o container glass e o gradiente dourado do título. Aplicar o mesmo padrão dos outros menus:

**De:**
```html
<div class="backdrop-blur-xl bg-white/[0.04] border border-white/10 rounded-2xl p-4 shadow-...">
  <h1 class="bg-gradient-to-r from-gold to-gold/70 bg-clip-text text-transparent">Agenda de Transportes</h1>
  <p class="text-xs sm:text-sm text-muted-foreground/80 mt-0.5">...</p>
</div>
```

**Para:**
```html
<div class="flex items-center justify-between gap-3">
  <div>
    <h1 class="text-xl sm:text-2xl font-bold tracking-tight">Agenda de Transportes</h1>
    <p class="text-sm text-muted-foreground mt-1">Gestão dos deslocamentos e recepção de convidados</p>
  </div>
  <!-- botões PDF e Novo Evento mantidos iguais -->
</div>
```

Isso alinha com o padrão de Hóspedes, Equipe, Checklist, Escala, Veículos, etc.

| Arquivo | Ação |
|---|---|
| `src/pages/AgendaPage.tsx` | Simplificar header para padrão dos outros menus |

