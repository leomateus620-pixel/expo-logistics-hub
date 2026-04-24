## Corrigir horário de Retorno em transportes Aeroporto

### Diagnóstico confirmado
Não há resíduo de UTC: 07:40 UTC → 04:40 SP está correto. O problema é **lógica de negócio**: hoje, para qualquer transporte (inclusive Aeroporto), o sistema calcula:

```ts
retorno = inicio_em + (duracao_estimada_min || preset[titulo] || 60)
```

Para Aeroporto o preset é **120min ida-e-volta**, então uma saída às 04:40 vira retorno às 06:40 — **antes do voo de desembarque às 09:10 sequer ter pousado**. Inconsistência clara.

### Correção
Ancorar o retorno no **evento de voo**, não na hora de saída do motorista, quando o transporte é do tipo Aeroporto:

- **Desembarque** (`voo_chegada` preenchido): `retorno = voo_chegada + 30min (buffer de pouso/bagagem) + 60min (volta)` → no exemplo: 09:10 + 0:30 + 1:00 = **10:40 SP**
- **Embarque** (`voo_checkin` preenchido, sem chegada): `retorno = voo_checkin + 60min (volta)` → motorista deixa passageiro no check-in e volta
- **Sem dados de voo**: mantém regra atual (saída + 120min)
- **Outros tipos** (Hotel, Parque, etc.): mantém regra atual sem mudanças
- Quando `fim_em` ou `duracao_estimada_min` estão preenchidos, eles continuam tendo prioridade

A duração só-ida = `round((duracao_estimada_min || 120) / 2) || 60`, então respeita transportes que tenham duração customizada salva.

### Arquivos

| Arquivo | Mudança |
|---|---|
| `src/components/transport/TransportCard.tsx` | Atualizar `estimateReturnTime()` com a lógica acima. Afeta: card de transporte, conflito de horário (TransportsPage usa o re-export) e Agenda (via `computeAgendaTimes` que usa o mesmo preset). |
| `src/pages/TransportsPage.tsx` | Atualizar a cópia local de `estimateReturnTime()` (mesma função, usada na detecção de conflitos) com a mesma lógica. |
| `src/pages/AgendaPage.tsx` | Atualizar `computeAgendaTimes` para aplicar a mesma regra ao calcular `fimIso` quando o título é Aeroporto e `fim_em` está vazio. |

### Critério de aceite
1. Transporte do exemplo (desembarque 09:10, saída 04:40, sem `fim_em`) passa a mostrar **Retorno ≈ 10:40** em ambos `/transportes` e `/agenda`
2. Transporte de embarque (check-in às 14:00, saída às 11:00) mostra **Retorno ≈ 15:00**
3. Transportes não-aeroporto continuam exatamente como hoje
4. Transportes com `fim_em` preenchido continuam usando esse valor (override manual)
5. Detecção de conflitos de veículo continua funcionando com o novo retorno mais realista

### Compatibilidade
- Apenas lógica de cálculo no front; zero mudança em banco, RLS, hooks ou Edge Functions
- Sem migrações
