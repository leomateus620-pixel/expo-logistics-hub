

# Fix: Links usando domínio errado (preview ao invés de público)

## Problema
A função `getPublicOrigin()` em `MobilityLinksPanel.tsx` só detecta previews com prefixo `id-preview--`. Quando você acessa pelo domínio `lovableproject.com`, ele usa `window.location.origin` diretamente — gerando links com o domínio de preview que exige login no workspace do Lovable.

A tela "Access denied" não é do seu app, é da plataforma Lovable bloqueando acesso ao preview para não-membros.

## Correção

### 1. Fixar `getPublicOrigin()` para sempre usar o domínio público
Alterar para retornar sempre `https://fenasojalog.lovable.app` (ou o domínio customizado) quando não estiver no domínio público real:

```typescript
const getPublicOrigin = () => {
  const PUBLIC_DOMAIN = 'https://fenasojalog.lovable.app';
  if (typeof window === 'undefined') return PUBLIC_DOMAIN;
  const host = window.location.hostname;
  // Se está no domínio público real, usa ele
  if (host === 'fenasojalog.lovable.app' || host === 'fenasojalog.com' || host === 'www.fenasojalog.com') {
    return window.location.origin;
  }
  // Qualquer outro domínio (preview, lovableproject, localhost) → domínio público
  return PUBLIC_DOMAIN;
};
```

### 2. Atualizar tokens no banco para os 29 links
Os tokens nos links que você colou já estão salvos no banco. Apenas o domínio precisa mudar. Após a correção no código, basta usar "Copiar Todos" novamente para obter os links corretos com o domínio público.

## Resultado
Todos os 29 links passarão a usar `https://fenasojalog.lovable.app/f/mobilidade/TOKEN` — acessível por qualquer pessoa sem login.

## Arquivo
- `src/components/mobility/MobilityLinksPanel.tsx` — apenas a função `getPublicOrigin()`

