

## Filtrar dropdown de Motorista (Transportes) apenas para comissão LOGÍSTICA

### Diagnóstico
Em `src/pages/TransportsPage.tsx` linha 953, o `<Select>` de filtro "Motorista" lista **todos** os membros da organização:

```tsx
{members.map((m: any) => <SelectItem ... >{m.nome_exibicao}</SelectItem>)}
```

Como motoristas de transporte são restritos à comissão **LOGÍSTICA** (ver memória `transport-airport-driver-selection`), o dropdown deve refletir essa regra — mostrando apenas membros dessa comissão (mais o item "Todos" e, por segurança, qualquer motorista que já apareça em transportes existentes mas tenha sido desvinculado da comissão, para o filtro continuar útil em registros antigos).

### Mudança

**Arquivo:** `src/pages/TransportsPage.tsx`

1. Logo após o cálculo de `commissions` (já disponível via `useCommissions()`), derivar via `useMemo` a lista de motoristas elegíveis:

```ts
const logisticaCommissionId = useMemo(
  () => commissions.find((c: any) => 
    (c.nome || '').toUpperCase().includes('LOGÍSTICA') ||
    (c.nome || '').toUpperCase().includes('LOGISTICA')
  )?.id,
  [commissions]
);

const driverMembers = useMemo(() => {
  if (!logisticaCommissionId) return [];
  return members
    .filter((m: any) => m.commission_id === logisticaCommissionId)
    .sort((a: any, b: any) => (a.nome_exibicao || '').localeCompare(b.nome_exibicao || ''));
}, [members, logisticaCommissionId]);
```

2. Trocar a linha 953 para usar `driverMembers` em vez de `members`:

```tsx
{driverMembers.map((m: any) => (
  <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>
))}
```

### Critério de aceite
1. O dropdown "MOTORISTA" exibe apenas integrantes da comissão LOGÍSTICA + "Todos"
2. Lista vem ordenada alfabeticamente (consistente com a UX da equipe)
3. Filtragem funcional preservada — selecionar um motorista LOGÍSTICA continua filtrando a lista corretamente
4. Nenhum impacto em outros menus, formulários, banco ou RLS

### Compatibilidade
- Apenas mudança visual no filtro
- Zero alteração em hooks, schema, RLS ou Edge Functions
- Cards, criação e edição de transportes continuam intactos

