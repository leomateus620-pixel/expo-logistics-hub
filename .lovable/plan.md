
# Adicionar Scroll ao Dialog de Criar/Editar Transporte

## Problema
O formulário "Novo Transporte" tem conteúdo extenso (accordions de dados, hóspedes, motorista, voo, retorno) que ultrapassa a viewport, ficando cortado sem scroll.

## Solução
Envolver o `TransportForm` dentro do `DialogContent` com um `ScrollArea` limitado a `max-h-[70vh]`, permitindo scroll suave dentro do modal.

## Implementação

**`src/pages/TransportsPage.tsx`** — 2 alterações:

1. Importar `ScrollArea` de `@/components/ui/scroll-area`
2. No dialog de criação (linha ~741) e no dialog de edição (linha ~831), envolver `<TransportForm .../>` com:
```tsx
<ScrollArea className="max-h-[70vh] overflow-y-auto pr-1">
  <TransportForm ... />
</ScrollArea>
```

O `pr-1` evita que a scrollbar sobreponha o conteúdo. Nenhuma outra alteração necessária.
