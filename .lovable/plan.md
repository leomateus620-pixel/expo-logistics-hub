

# Copiar Todas as Comissões + Links

## Problema
Atualmente só é possível copiar links individualmente, e apenas na sessão em que foram gerados. O usuário quer poder copiar todas as comissões com seus links de uma vez, formatado para distribuição.

## Solução

### Abordagem: "Regenerar Todos + Copiar Tudo"
Como os tokens brutos não ficam salvos no banco (apenas o hash), para copiar todos os links é necessário primeiro regenerar os tokens. A solução adiciona:

1. **Botão "Copiar Todos os Links"** no header do card, ao lado de "Gerar links para todas"
2. Ao clicar, regenera tokens de todos os links ativos de uma vez
3. Copia para a área de transferência um texto formatado com todas as comissões e links alinhados:

```text
📋 Links de Mobilidade — Fenasoja 2026

COMISSÃO AGROPECUÁRIA
Presidente: João Silva
Link: https://fenasojalog.lovable.app/f/mobilidade/abc123...

COMISSÃO DE LOGÍSTICA
Presidente: Maria Santos
Link: https://fenasojalog.lovable.app/f/mobilidade/def456...

---
Total: 12 comissões
```

## Arquivo a modificar
- `src/components/mobility/MobilityLinksPanel.tsx` — adicionar botão "Copiar Todos" que regenera e copia formatado
- `src/hooks/usePublicFormLinks.ts` — adicionar mutation `regenerateAll` que regenera tokens de todos os links ativos em batch

