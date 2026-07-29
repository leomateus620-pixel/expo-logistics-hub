# Substituição do logo circular oficial

## Escopo
O visual mostrado no primeiro anexo (círculo azul/laranja/verde no header, sidebar, portais, login etc.) vem do SVG inline dentro de `src/components/brand/FenasojaBrand.tsx`. Esse componente é usado em todo o sistema (Sidebar, LoginPage, CommissionPortalPage, VenueModuleShell, CronogramaModuleShell, CreateOrgPage, AdminFrame, RouteState, CountdownExperience, CronogramaLoginHero, CommissionSidebar). Substituir a arte lá troca a marca em todos os pontos de uma só vez.

Fora do escopo: `fenasoja-logo-horizontal.png`, `fenasoja-golden-soybean.png`, `logofeira26.webp` e backgrounds/splashes — são artes distintas (horizontal, soja dourada, feira), não o "círculo" mostrado no anexo. Se quiser trocar essas também, avise.

## Passos
1. Fazer upload de `user-uploads://9CE480F7-6A7E-40D0-AB32-890EAC3562EE.png` como asset CDN em `src/assets/fenasoja-logo-oficial.png.asset.json` via `lovable-assets create` (mantém a resolução 4K original).
2. Em `FenasojaBrand.tsx`:
   - Remover o `<svg>` inline (linhas ~47–58) e trocar por `<img src={fenasojaLogoOficial.url} alt="" />` importando o pointer.
   - Preservar o wrapper `.fenasoja-brand__mark` e todas as classes de tamanho (`compact`, `display`, standard), só ajustando o fundo/borda para não competir com o logo (fundo transparente ou branco suave conforme já usado no display).
   - Manter `object-contain` e as dimensões `h-7 w-7 / h-9 w-9 / h-12 w-12 sm:h-14 sm:w-14` para paridade visual.
3. Verificação visual rápida (Playwright) em Sidebar, LoginPage e VenueModuleShell para confirmar que o novo logo renderiza nítido e alinhado nos três tamanhos.

## Detalhes técnicos
- Nenhuma mudança em rotas, dados ou lógica — só o mark visual e o import do asset.
- O `showEdition` (badge "2028") e o wordmark "FENASOJA" continuam intocados.
- Testes existentes de `FenasojaBrand`/tokens não asseguram o SVG específico, então a troca não deve quebrá-los; rodo `vitest` nos arquivos de brand caso relevante.
