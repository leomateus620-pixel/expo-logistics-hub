## Problema identificado

No card "Transportes" do Dashboard, a legenda "X pendentes" usa `upcomingTransports.length`, mas essa lista está truncada com `.slice(0, 5)` (linha 242 de `src/pages/Dashboard.tsx`). Resultado: o número exibido nunca passa de 5 e fica desalinhado com a realidade.

Print do usuário confirma: card mostra valor `0` (transportes em andamento) com "5 pendentes" — exatamente o teto da slice.

## Correção proposta

**Arquivo:** `src/pages/Dashboard.tsx`

1. Criar um memo separado `pendingTransportsCount` que conta **todos** os transportes com `status === 'pendente'` (sem slice).
2. Manter `upcomingTransports` com `.slice(0, 5)` apenas para a listagem visual da seção Agenda.
3. Trocar `trend={`${upcomingTransports.length} pendentes`}` por `trend={`${pendingTransportsCount} pendentes`}` no `StatCard` de Transportes.

### Snippet

```tsx
const pendingTransportsCount = useMemo(
  () => transports.filter((t: any) => t.status === 'pendente').length,
  [transports]
);

// ...
<StatCard
  label="Transportes"
  value={activeTransports}
  trend={`${pendingTransportsCount} pendentes`}
  // ...
/>
```

## Validação
- Card passa a refletir o total real de pendentes da organização.
- Demais seções (Agenda, lista limitada a 5) permanecem inalteradas.
