## Diagnóstico

Investiguei o build atual e identifiquei 3 causas principais de lentidão no acesso pelo PC em `fenasojalog.com`:

### 1. Bundle JavaScript gigante (sem code splitting)
O `src/App.tsx` importa **todas as 19 páginas estaticamente** no topo do arquivo. Isso significa que ao abrir o site, o navegador baixa de uma vez:
- Todas as páginas (Dashboard, Vehicles, Transports, Agenda, Expenses, etc.)
- **maplibre-gl** (~800KB gzipped)
- **leaflet** (~150KB)
- **html5-qrcode** (~200KB)
- **jspdf + jspdf-autotable** (~300KB)
- **recharts** (~400KB)

Resultado: o usuário no PC baixa ~3–4MB de JS antes da primeira tela aparecer, mesmo se for só ver o Dashboard.

### 2. Imagens de fundo enormes (~8,5MB total)
- `fenasoja-bg-2026.png`: **2,8MB**
- `fenasoja-bg-mobile.png`: **2,8MB**
- `fenasoja-splash-2026.png`: **2,9MB**

Em PNG, sem compressão WebP. O `LoginPage` carrega 2,8MB só para mostrar o fundo, e ainda faz preload da splash de 2,9MB.

### 3. Falta de chunking dos vendors
Sem `manualChunks` no `vite.config.ts`, o Vite agrupa tudo em poucos arquivos grandes. Sem cache eficiente entre deploys: qualquer mudança invalida o bundle inteiro.

## Plano de otimizações

### A. Code splitting por rota (impacto: alto)
Converter todos os imports de páginas em `React.lazy()` + `<Suspense>` no `src/App.tsx`. Cada rota vira um chunk separado carregado sob demanda.

```tsx
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TransportsPage = lazy(() => import('./pages/TransportsPage'));
// ...
<Suspense fallback={<LoadingSpinner />}>
  <Routes>...</Routes>
</Suspense>
```

Ganho esperado: bundle inicial cai de ~3MB para ~600–800KB.

### B. Vendor chunks no `vite.config.ts` (impacto: médio)
Configurar `build.rollupOptions.output.manualChunks` para separar:
- `react-vendor`: react, react-dom, react-router
- `ui-vendor`: todos os @radix-ui
- `maps`: maplibre-gl + leaflet (carregados só nas páginas de mapa)
- `pdf`: jspdf + jspdf-autotable
- `charts`: recharts
- `qr`: html5-qrcode

Vantagem: ao publicar uma atualização, só o chunk modificado é re-baixado; os vendors ficam em cache.

### C. Lazy load de bibliotecas pesadas dentro das páginas (impacto: alto)
- `NavigationMap3D.tsx` → dynamic import do `maplibre-gl` só quando o mapa renderiza
- `QrScannerDialog.tsx` → dynamic import do `html5-qrcode` só ao abrir
- Geradores de PDF (`generateCartUsagePdf`, `generateKmPdf`, `generateSystemReportPdf`) → já são chamados sob demanda, garantir que `jspdf` não vaza pro bundle inicial

### D. Conversão de imagens PNG → WebP (impacto: alto no Login)
Converter os 3 fundos PNG (2,8–2,9MB cada) para WebP otimizado. Estimativa: **~250–400KB cada** (redução de ~90%).
- `fenasoja-bg-2026.png` → `.webp`
- `fenasoja-bg-mobile.png` → `.webp`
- `fenasoja-splash-2026.png` → `.webp`

Atualizar imports em `LoginPage.tsx` e onde a splash é usada. **Nenhum impacto visual** — WebP mantém a qualidade.

### E. Pré-conexão e prefetch (impacto: pequeno mas grátis)
Adicionar no `index.html`:
```html
<link rel="preconnect" href="https://fidagsspejekripwkczr.supabase.co">
<link rel="dns-prefetch" href="https://fidagsspejekripwkczr.supabase.co">
```
Reduz handshake DNS/TLS na primeira chamada do Supabase.

### F. Service Worker — pré-cachear chunks lazy (sem alteração)
O `public/sw.js` atual já faz cache-first nos assets com hash do Vite, então as chunks lazy serão cacheadas automaticamente após o primeiro acesso. Sem mudança necessária.

## Resumo dos arquivos que serão alterados

| Arquivo | Mudança |
|---|---|
| `src/App.tsx` | Converter imports de páginas para `lazy()` + `Suspense` |
| `vite.config.ts` | Adicionar `manualChunks` para vendors |
| `src/components/transport/NavigationMap3D.tsx` | Dynamic import do maplibre-gl |
| `src/components/expenses/QrScannerDialog.tsx` | Dynamic import do html5-qrcode |
| `src/assets/fenasoja-bg-2026.webp` | **Novo** (gerado a partir do PNG) |
| `src/assets/fenasoja-bg-mobile.webp` | **Novo** |
| `src/assets/fenasoja-splash-2026.webp` | **Novo** |
| `src/pages/LoginPage.tsx` | Trocar imports PNG → WebP |
| Outros consumidores da splash | Trocar import PNG → WebP |
| `index.html` | Adicionar `preconnect`/`dns-prefetch` Supabase |

## Garantias de integridade

- **Nenhuma mudança de regra de negócio, schema, RLS, ou edge function.**
- **Nenhuma alteração visual** — WebP preserva qualidade idêntica ao PNG.
- Os PNGs originais permanecem no repositório como fallback inicial e podem ser removidos depois de validar.
- Code splitting é transparente: o `Suspense fallback` mostra um spinner idêntico ao `AuthGuard` por ~100–300ms na primeira navegação a cada rota.

## Estimativa de ganho

- **Tempo até interativo (PC, conexão típica)**: de ~4–6s para ~1,5–2s na primeira visita.
- **Re-visitas**: praticamente instantâneo (cache do SW + chunks vendor estáveis).
- **Login screen**: de ~2,8MB de imagem para ~300KB.
