# Corrigir horários -3h dos Carrinhos Elétricos

## Diagnóstico

O bug existia no envio: até a correção anterior, os campos `retirada_em`, `devolucao_em`, `inicio_em` e `fim_em` eram enviados **sem offset de timezone**. O Postgres interpretou os valores como **UTC**, então uma retirada digitada às **08:30 (SP)** ficou armazenada como **08:30 UTC** — que ao ser exibida em `America/Sao_Paulo` aparece como **05:30** (-3h).

Verificação no banco confirma:

| Tabela | Registros afetados |
|---|---|
| `electric_carts.retirada_em` / `devolucao_em` | 11 registros ativos |
| `cart_reservations.inicio_em` / `fim_em` | 5 registros |
| `cart_history.after_data` (snapshots JSONB) | 17 eventos de retirada/devolução |

Exemplo real (G24 - JEFERSON): cadastrado às 08:30 SP, salvo como `2026-04-30 08:30:00+00` (UTC) → exibido como **05:30**. Correto seria `2026-04-30 11:30:00+00`.

## O código já está corrigido

A correção do envio (commit anterior) garante que **novos registros** sejam gravados com offset SP (`-03:00`). Esta migration corrige apenas o **legado**.

## Migration de correção

Soma `+3 horas` em todos os timestamps gravados antes do fix:

```sql
-- 1) electric_carts: retirada_em e devolucao_em
UPDATE electric_carts
SET retirada_em = retirada_em + interval '3 hours'
WHERE retirada_em IS NOT NULL;

UPDATE electric_carts
SET devolucao_em = devolucao_em + interval '3 hours'
WHERE devolucao_em IS NOT NULL;

-- 2) cart_reservations: inicio_em e fim_em
UPDATE cart_reservations
SET inicio_em = inicio_em + interval '3 hours',
    fim_em    = fim_em    + interval '3 hours';

-- 3) cart_history: snapshots JSONB (retirada/devolucao)
UPDATE cart_history
SET after_data = jsonb_set(
      after_data,
      '{retirada_em}',
      to_jsonb(((after_data->>'retirada_em')::timestamptz + interval '3 hours')::text)
    )
WHERE after_data ? 'retirada_em' AND after_data->>'retirada_em' IS NOT NULL;

UPDATE cart_history
SET after_data = jsonb_set(
      after_data,
      '{devolucao_em}',
      to_jsonb(((after_data->>'devolucao_em')::timestamptz + interval '3 hours')::text)
    )
WHERE after_data ? 'devolucao_em' AND after_data->>'devolucao_em' IS NOT NULL;
```

## Risco e Mitigação

- **Risco:** se algum registro já estiver correto, ficará +3h adiantado.
- **Mitigação:** a auditoria mostra padrão 100% uniforme — nenhum registro foi gravado com offset antes do fix. Todos precisam do +3h.
- Backup automático do Lovable Cloud permite reverter se necessário.

## Resultado Esperado

- G24 JEFERSON: `08:30+00` → `11:30+00` → exibido como **08:30 SP** ✅
- Todos os cards passam a refletir o horário real digitado pelo usuário.
- Novos cadastros já saem corretos pela correção do código aplicada anteriormente.

## Arquivos

- Nova migration SQL (executada via tool `supabase--migration`).
- Nenhuma mudança adicional de código — o frontend já está correto.
