

# Plano: Fase 2 — Estabilidade

## 1. Migrar `guest_id` legado para `transport_guests` e deprecar coluna

**Problema**: O sistema usa dois mecanismos para vincular guests a transportes: coluna `transports.guest_id` (legado) e tabela `transport_guests` (junction table). Há fallbacks para o campo legado espalhados em 4 arquivos.

**Ação — Migration SQL**:
- Criar migration que copia dados de `transports.guest_id` para `transport_guests` (onde ainda não existam)
- Setar `transports.guest_id = NULL` em todos os registros migrados
- **Não** dropar a coluna ainda (para evitar quebra, apenas deprecar)

**Ação — Código (3 arquivos)**:
- `src/pages/TransportsPage.tsx`: Remover `guest_id` de todos os payloads de `create.mutateAsync` e `update.mutateAsync` (linhas 393, 438, 499). Remover fallbacks `t.guest_id` nas linhas 474, 562, 600
- `src/pages/AgendaPage.tsx`: Remover fallback `legacyGuest` (linhas 159-160)
- `src/pages/GuestsPage.tsx`: Remover `|| t.guest_id === g.id` (linha 126)

## 2. Sincronizar exclusão/cancelamento de transporte com agenda

**Problema**: Ao deletar ou cancelar transporte, o evento correspondente na agenda permanece visível.

**Ação — `src/hooks/useTransports.ts`**:
- No `remove` mutation: antes de deletar o transporte, buscar e deletar eventos na tabela `events` que contenham `Transporte #${id.slice(0,8)}` na `descricao`
- No `update` mutation: quando `status` muda para `cancelado`, marcar o evento correspondente (mesma busca por `descricao`) deletando-o ou atualizando o título com "[CANCELADO]"
- Invalidar queries de `events` no `onSuccess` de `update` e `remove`

## 3. Corrigir timezone — já resolvido na Fase 1

O `getSPOffset()` em `src/lib/utils.ts` já usa `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'` e calcula o offset dinamicamente. **Nenhuma ação adicional necessária.**

Apenas uma revisão: a linha 580 em `TransportsPage.tsx` (`new Date().toISOString()` para `inicio_real_em`) deve usar `nowSP()` em vez de UTC.

## 4. Persistir `trackingTransportId` para manter tracking após refresh

**Problema**: Se o motorista recarregar a página durante uma viagem ativa, o tracking de localização para.

**Ação — `src/pages/TransportsPage.tsx`**:
- Ao setar `trackingTransportId`, salvar em `localStorage` com chave `fenasoja_tracking_transport`
- No `useState` inicial, ler de `localStorage`
- Ao limpar (stop tracking), remover do `localStorage`
- Criar wrapper `setTrackingTransportIdPersisted` que faz ambos (setState + localStorage)

---

## Resumo de Arquivos Alterados

| Arquivo | Mudanças |
|---------|----------|
| Migration SQL | Migrar dados `guest_id` → `transport_guests` |
| `src/hooks/useTransports.ts` | Sync delete/cancel com eventos; invalidar queries de events |
| `src/pages/TransportsPage.tsx` | Remover `guest_id` dos payloads; persistir tracking em localStorage; usar `nowSP()` no `inicio_real_em` |
| `src/pages/AgendaPage.tsx` | Remover fallback legacyGuest |
| `src/pages/GuestsPage.tsx` | Remover fallback `t.guest_id` |

