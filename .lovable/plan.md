

# Plano: Corrigir exclusão de transportes

## Problema
A exclusão falha silenciosamente por duas razões:

1. **Foreign key constraint**: As tabelas `transport_guests` e `transport_locations` referenciam `transport_id`. O `handleDelete` na edge function tenta deletar o transporte sem antes remover os registros dependentes, causando erro de FK violation.

2. **Sem feedback de erro**: A mutation `remove` no hook `useTransports` não tem `onError`, então o erro é engolido sem mostrar nada ao usuário.

## Mudanças

### 1. Edge Function — deletar dependências antes do transporte
**Arquivo:** `supabase/functions/transport-lifecycle/index.ts`

Na função `handleDelete`, antes de deletar o transporte (linha 358), adicionar:
- `DELETE FROM transport_guests WHERE transport_id = id`
- `DELETE FROM transport_locations WHERE transport_id = id`

### 2. Hook — adicionar tratamento de erro
**Arquivo:** `src/hooks/useTransports.ts`

Na mutation `remove`, adicionar `onError` com toast de erro amigável para o usuário.

## Arquivos a editar
1. `supabase/functions/transport-lifecycle/index.ts`
2. `src/hooks/useTransports.ts`

