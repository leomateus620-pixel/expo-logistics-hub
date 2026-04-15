

# Correção: Copiar Todos os Links (29 Comissões)

## Diagnóstico
Os dados mostram 29 comissões e 29 links no banco. As requisições PATCH retornam 204 (sucesso). O problema provável é que o loop sequencial de 29 requisições pode falhar parcialmente ou ter timeout, e qualquer falha aborta tudo sem feedback claro.

## Correção

### 1. Paralelizar regeneração de tokens (`usePublicFormLinks.ts`)
- Substituir o loop `for` sequencial por `Promise.all` para executar as 29 atualizações em paralelo
- Reduz o tempo total de ~10s para ~1s
- Mantém tratamento de erro individual

### 2. Melhorar feedback no "Copiar Todos" (`MobilityLinksPanel.tsx`)
- Mostrar progresso durante a geração ("Gerando links... 15/29")
- Se algum link falhar, copiar os que funcionaram e avisar quantos falharam
- Garantir que o texto copiado inclua todas as 29 comissões

### 3. Formato do texto copiado (já correto, manter)
```
📋 Links de Mobilidade — Fenasoja 2026

📌 AGRICULTURA, SOJA E DERIVADOS
Presidente: Vanessa Matraszek Gnoatto
Link: https://fenasojalog.lovable.app/f/mobilidade/TOKEN

... (todas as 29)

---
Total: 29 comissões
```

## Arquivos a modificar
- `src/hooks/usePublicFormLinks.ts` — paralelizar `regenerateAllTokens`
- `src/components/mobility/MobilityLinksPanel.tsx` — feedback de progresso

