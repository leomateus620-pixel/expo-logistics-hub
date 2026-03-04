

# Corrigir erro "km_rodados can only be updated to DEFAULT"

## Diagnóstico

A coluna `km_rodados` na tabela `vehicle_usage` é uma **coluna gerada automaticamente** (`GENERATED ALWAYS AS (CASE WHEN km_chegada IS NOT NULL THEN km_chegada - km_saida ELSE NULL END)`). O código em `useVehicleUsage.ts` tenta calcular e definir `km_rodados` manualmente no update, o que o banco rejeita.

## Correção

### 1. `src/hooks/useVehicleUsage.ts` — Remover atribuição manual de `km_rodados`

Na mutation `updateUsage`, remover o bloco que calcula e atribui `updates.km_rodados`. O banco já calcula automaticamente quando `km_chegada` é preenchido. Basta enviar `km_chegada` e `devolucao_em` no update.

### 2. Garantir que o botão "Registrar Devolução" funcione

O fluxo em `VehiclesPage.tsx` já está correto: envia `km_chegada` e `devolucao_em`. O problema é exclusivamente no hook que adiciona `km_rodados` ao payload do update.

## Arquivo alterado
- `src/hooks/useVehicleUsage.ts` — remover linhas 72-77 (cálculo manual de `km_rodados`)

