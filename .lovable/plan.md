

# Melhorias no Formulário de Despesas — Transporte detalhado + Membros da Logística

## Problemas identificados

1. **Select de Transporte** (Anexo 1): Mostra apenas tipo genérico ("Aeroporto", "Centro"), sem detalhes. Com múltiplos transportes do mesmo tipo, é impossível distinguir qual selecionar.

2. **Select de "Quem pagou"** (Anexo 2): Lista TODOS os membros da organização. Deveria mostrar apenas membros da comissão de Logística, seguindo o mesmo padrão já usado em `VerEscalaPage.tsx` e `TransportForm.tsx`.

## Solução

### Arquivo: `src/components/expenses/ExpenseForm.tsx`

**Transporte — Label detalhado:**
- Alterar `getTransportLabel()` para exibir: `Tipo • Origem → Destino • DD/MM HH:MM`
- Exemplo: `Aeroporto • POA → Hotel Fenasoja • 13/04 14:30`
- Se tiver motorista vinculado, incluir nome abreviado
- Remover `.slice(0, 15)` que trunca demais
- Remover `.slice(0, 30)` que limita a 30 transportes

**Membros — Filtro por comissão Logística:**
- Importar `useCommissions` no componente
- Filtrar membros para mostrar apenas os que pertencem à comissão cujo nome contém "LOGÍSTICA"
- Mesmo padrão de `VerEscalaPage.tsx` (linhas 56-63)
- Adicionar indicador visual abaixo do select: "Apenas membros da comissão de Logística"

### Alterações específicas

1. **Importar** `useCommissions` de `@/hooks/useCommissions`
2. **Encontrar** comissão de logística: `commissions.find(c => c.nome?.toUpperCase().includes('LOGÍSTICA'))`
3. **Filtrar** membros: `members.filter(m => m.commission_id === logisticaCommission?.id)`
4. **Melhorar** label do transporte com data, origem→destino completos e tipo
5. **Manter** auto-fill inteligente ao selecionar transporte (vehicle + driver)

### Nenhum outro arquivo precisa ser alterado.

