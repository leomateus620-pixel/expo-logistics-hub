# Mapa Comercial Fenasoja 2026 — arquitetura e implantação

## Objetivo e fontes de verdade

O módulo mantém a navegação, os fluxos comerciais, a edição geométrica e a
arquitetura do mapa 3D existente, substituindo a digitalização preliminar de
2024 pela planta oficial Fenasoja 2026.

As fontes primárias desta revisão são:

- `Mapa do Parque 300x200.pdf`, criado em 29/04/2026;
- a renderização oficial JPEG de `14902 × 11949` pixels;
- a legenda de infraestrutura localizada abaixo da planta.

A lista lateral de expositores/compradores não faz parte do domínio
cartográfico. Nenhum nome, ocupação, contrato ou disponibilidade foi importado
dessa lista.

## Manifesto cartográfico reproduzível

`src/features/commercial-map/data/officialReference2026.ts` registra o tamanho
da página, o hash SHA-256 do JPEG analisado, o recorte em coordenadas PDF e a
versão `2026.1` da referência.

O raster de runtime é `public/maps/fenasoja-oficial-2026-park.webp` (`3000 ×
2264`). Ele contém somente a área do parque, incluindo o acesso sul, e exclui a
lista lateral de compradores e as tabelas externas à planta. A conversão de
PDF para coordenadas locais é determinística:

```text
x_local = ((x_pdf - 600) / 5500) × 120 - 60
y_local = ((y_pdf - 900) / 4150) × 90,545455 - 45,2727275
```

Essas coordenadas são uma digitalização visual oficial, não um levantamento
topográfico. Área cartográfica, área calculada por calibração e área oficial
validada permanecem conceitos separados.

## Inventário 2026

A base contém:

- 21 quadras oficiais: A, B, C, D, E, F, G, I, J, L, M, N, O, P, Q, R, S, T,
  U, V e X;
- 262 lotes com numeração impressa na planta;
- a rede de ruas internas, alamedas, avenidas e acessos externos;
- portões A1 a A11;
- pavilhões e infraestrutura B1 a B42;
- estruturas C1 a C8, D1 a D6, sanitários E, Arena F, Árvore Lunar G e Parque
  de Diversões J;
- estacionamentos, Pista Campeira, Pavilhão 09, área de motorhome, test drive,
  etnias e Pórtico das Nações.

Lotes usam identificadores únicos compostos (`Q-S-36`, por exemplo), enquanto
a interface mostra somente o número correto e o contexto da quadra. Todos os
lotes derivados da planta entram em `BLOCKED`, sem preço, comprador, contrato,
área oficial ou disponibilidade inferida.

## Correções críticas de 2024 para 2026

- o antigo `LAGO / Lago central` foi removido;
- a área é oficialmente a **Arena Sicredi - Icatu**, classificada como
  `EVENT_VENUE`;
- não existe entidade `WATER` na referência 2026;
- `Restaurante do lago`, `Banheiros químicos — lago`, `Área PRCT` e `Pista de
  remates` foram removidos por não existirem na planta 2026;
- S e R deixaram de ser blocos genéricos e passaram a conter suas subdivisões
  oficiais;
- quadras V, U, T e X e os novos portões/apoios foram incorporados;
- nomes e códigos de pavilhões, segurança, emergência, etnias e alimentação
  foram reconciliados com a legenda inferior.

## Ambiguidades mantidas como pendência

O sistema não completa lacunas por inferência:

- a coluna regular onde B40 está localizado corresponderia geometricamente a
  G03/G04, mas esses números não estão impressos; portanto, não foram criados;
- B23 Ambulatório e o marcador J Parque de Diversões aparecem na planta, mas
  não na legenda inferior; ambos permanecem `NEEDS_REVIEW` com a divergência
  registrada em metadados;
- as faixas ocres ao norte não possuem código ou nome oficial e não viraram
  lotes nem estacionamentos;
- medidas, testadas, profundidades e áreas oficiais continuam pendentes de
  documentação/calibração.

## Modelo e renderização

O modelo existente continua baseado em `MapProject`, calibrações versionadas,
camadas, `MapEntity`, GeoJSON Polygon e `CommercialLot`. Foram adicionadas as
classificações `QUADRA` e `EVENT_VENUE`.

Quadras são pais hierárquicos e renderizadas somente como contorno, sem cobrir
ou capturar o clique dos lotes. Ruas permanecem visíveis durante busca e
filtros; lotes não correspondentes são atenuados, preservando a orientação.

No desktop, os números dos lotes, nomes de quadras, vias e estruturas
prioritárias têm rótulos de nível de detalhe. No celular ou em modo gráfico
reduzido, rótulos persistentes são reduzidos e seleção/hover continuam
disponíveis. A câmera calcula o enquadramento pela extensão real da geometria,
limita o alvo ao parque e preserva transições suaves entre vista geral,
superior, isométrica e foco de seleção.

## Sincronização segura com o banco

A migration `20260711010000_upgrade_commercial_map_2026.sql` é aditiva. Ela:

- adiciona `map_projects.reference_revision`;
- permite `QUADRA` e `EVENT_VENUE` no domínio SQL;
- expõe `sync_commercial_map_reference_2026` somente para usuários
  autenticados com `map.admin`;
- cria ou atualiza apenas entidades marcadas como seed oficial;
- rejeita conflitos com identificadores mantidos manualmente;
- preserva lotes com área, preço, reserva, negociação, venda, contrato ou
  histórico comercial;
- valida sobreposição entre lotes vendáveis;
- versiona geometrias substituídas e mantém a calibração validada em uma
  repetição sem alterações;
- arquiva entidades oficiais obsoletas sem vínculo comercial;
- mantém novos lotes bloqueados e sem dados de comprador;
- registra a sincronização somente quando houve mudança real.

A rota não executa essa sincronização automaticamente. Se detectar uma base
2024 sem lotes comerciais, exibe a referência 2026 em modo seguro de leitura e
oferece a ação explícita de administrador. Projetos com dados comerciais reais
nunca são substituídos silenciosamente.

## Rota, autorização e fluxos preservados

A rota permanece `/mapa-comercial`, protegida por `AuthGuard`, `OrgGuard` e
`CapabilityGuard(map.view)` dentro do layout autenticado. O cliente Supabase,
TanStack Query, Zustand, painéis, editor GeoJSON, calibração, divisão/mesclagem,
reservas, negociações, vendas e contratos privados foram mantidos.

## Validação local executada

A rota real foi aberta em sessão autenticada temporária e revisada nas seguintes
áreas de visualização:

- desktop Full HD: `1920 × 1080`;
- notebook: `1366 × 768`;
- tablet em retrato: `768 × 1024`;
- celular: viewport mobile de `480 × 844`, com `460 × 844` de área útil capturada.

Foram exercitados enquadramento geral, vista superior, vista isométrica, zoom,
movimento da câmera, busca, lista acessível, seleção e foco da Arena Sicredi -
Icatu, painel de detalhes, painel de camadas, filtros e composição responsiva. A
Arena foi confirmada como espaço de eventos não comercial e a camada de água não
é oferecida pela referência 2026.

As evidências visuais finais estão em `docs/screenshots/`:

- `mapa-comercial-2026-desktop-1920x1080.jpg`;
- `mapa-comercial-2026-notebook-1366x768.jpg`;
- `mapa-comercial-2026-tablet-768x1024.jpg`;
- `mapa-comercial-2026-mobile-460x844.jpg`;
- `mapa-comercial-2026-mobile-arena-details-460x844.jpg`.

## Validação obrigatória

Antes da publicação operacional:

1. aplicar as migrations em homologação;
2. executar a sincronização 2026 com uma conta `map.admin`;
3. confirmar RLS e Storage com os papéis reais;
4. calibrar uma distância conhecida e validar as áreas oficiais;
5. revisar as ambiguidades G03/G04, B23 e J contra documentação complementar;
6. validar visualmente as vistas, seleção e responsividade em desktop,
   notebook, tablet e celular;
7. executar TypeScript, testes, lint focado, build e `git diff --check`.
