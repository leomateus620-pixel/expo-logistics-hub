# Roadmap

## Identificação oficial dos espaços comerciais
- [x] Resolver número/quadra/segmento/pavilhão a partir do cadastro oficial sem deduzir metragem ou renumeração do código técnico.
- [x] Aplicar identificação no mapa, seleção, carrinho, revisão, painel, mini mapa, consulta pública e detalhe de venda sem mudar snapshots.
- [x] Conferir Q-R-20/21/22 e validar 53 testes focais e compilação.
- [ ] Conferir visualmente os rótulos em desktop/celular com sessão autorizada — prévia automatizada permaneceu na abertura, sem canvas.
- Não publicar (pedido do usuário)

## Sidebar comercial por estado do lote
- [x] Destacar venda confirmada com comprador, data/hora, etapa e responsável
- [x] Diferenciar as composições de lotes vendidos e disponíveis
- [x] Marcar a etapa oficial efetivamente usada na venda
- [x] Tornar contrato compacto e remover ações técnicas da lateral
- [x] Validar atualização automática, histórico, testes e build
- [ ] Validar visualmente desktop/celular — bloqueada pelo renderer WebGL automatizado, que permaneceu em 55% sem abrir a lateral
- Não publicar (pedido permanente do usuário)

## Comprador em lotes vendidos no Mapa Comercial
- [x] Exibir o comprador no tooltip compartilhado somente para lotes `SOLD`
- [x] Liberar somente o nome do comprador nos links públicos autorizados por token
- [x] Atualizar automaticamente links públicos após venda ou reversão
- [x] Validar privacidade, desktop, toque móvel e regressões automatizadas
- Não publicar (pedido permanente do usuário)

## Logística 2028, acesso do presidente e login institucional
- [x] Auditar cadastro e permissões do presidente Eduardo
- [x] Separar estruturalmente os dados operacionais em ciclos 2026 e 2028, preservando a base existente em 2026
- [x] Conectar todos os menus e fluxos operacionais ao ciclo ativo, com 2028 como padrão vazio
- [x] Adicionar troca de ciclo nas Configurações e identificação do ano ativo
- [x] Atualizar e validar o acesso de Eduardo com segurança
- [x] Aplicar e validar o novo login institucional da Logística em desktop e celular
- Não publicar (pedido do usuário)

## Seleção sistêmica de módulos irregulares + B1-M141 oficial
- [x] Centralizar a seleção visual de regulares e irregulares pela seleção persistente de Vendas
- [x] Atualizar o footprint do B1-M141 para 18,00 m² e o total modular do B1 para 586,50 m²
- [x] Reconciliar área e geometria persistidas do mesmo B1-M141, preservando identidade e estado comercial
- [x] Validar seleção individual/múltipla, remoção, limpeza, preço derivado e regressões automatizadas
- [ ] Validar visualmente desktop/mobile — sujeito à disponibilidade do renderer WebGL automatizado
- Não publicar (pedido do usuário)

## Pavilhão 5 / B8 — planta interativa com apoios protegidos
- [x] Preservar orientação 0/0, projeção identity, 81 módulos, áreas, corredores, acessos, apoios e discrepância do módulo 28
- [x] Ativar perfil compartilhado de PAN, zoom, lotes planos, numeração prioritária e fit official-content
- [x] Validar regressões automatizadas e TypeScript (124 testes)
- [ ] Validar navegação visual desktop/mobile e capturar evidências — bloqueada pelo renderer WebGL automatizado: desktop e mobile permaneceram no carregamento, com DOM vazio e nenhum canvas após 90 segundos
- Não publicar (pedido do usuário)

## Pavilhão 1 / B1 — planta interativa com quarter-turn
- [x] Preservar quarter-turn, orientação Math.PI/2 e Math.PI, 189 módulos, áreas, acessos e módulo irregular 141
- [x] Ativar perfil compartilhado de PAN, zoom, lotes planos e numeração prioritária somente no plano derivado
- [x] Validar regressões automatizadas e TypeScript (119 testes)
- [ ] Validar navegação visual desktop/mobile e capturar evidências — bloqueada pelo renderer WebGL automatizado: o DOM ficou vazio e a captura excedeu 30 segundos antes de abrir o interior
- Não publicar (pedido do usuário)

## Pavilhão 14 / B2 — planta interativa com quarter-turn
- [x] Preservar quarter-turn, orientação Math.PI/2 e -Math.PI/2, 186 módulos, áreas e acessos
- [x] Ativar perfil compartilhado de PAN, zoom, lotes planos e numeração prioritária no plano derivado
- [x] Validar regressões automatizadas e TypeScript (81 testes)
- [ ] Validar navegação visual desktop/mobile e capturar evidências — bloqueada pelo renderer WebGL automatizado, que deixou a prévia sem resposta antes da leitura da tela
- Não publicar (pedido do usuário)

## Pavilhão 12 / B3 — planta interativa horizontal
- [x] Preservar orientação canônica de 180°, 257 módulos, áreas, corredores e acessos invertidos
- [x] Ativar perfil compartilhado de PAN, zoom, lotes planos e numeração prioritária no plano derivado
- [x] Validar regressões automatizadas e TypeScript (66 testes)
- [ ] Validar navegação visual desktop/mobile e capturar evidências — bloqueada pelo renderer WebGL automatizado, que permaneceu em 85% após 90 segundos nos dois viewports
- Não publicar (pedido do usuário)

## Pavilhão 8 / B4 — planta interativa
- [x] Preservar orientação, 114 módulos, módulo 90, áreas de apoio e acessos
- [x] Ativar perfil compartilhado de PAN, zoom, lotes planos e numeração prioritária
- [x] Validar regressões automatizadas (65 testes + TypeScript)
- [ ] Validar navegação visual desktop/mobile — bloqueada pelo renderer WebGL automatizado, que permaneceu em 85% após 110 segundos
- Não publicar (pedido do usuário)

## Pavilhão 8 / B4 — planta oficial Fenasoja 2028
- [x] Reconciliar o frame métrico em 21,70 × 35,00 m e os gaps superior/inferior em 3,00 m
- [x] Preservar 114 módulos, 438,50 m², 760,20 m², corredores laterais e módulo 90 em L
- [x] Atualizar nome, fonte documental e revisão exclusivamente do B4
- [x] Reconciliar geometrias persistidas preservando IDs, status, preços e histórico
- [x] Validar hit-test, rota pública e regressões automatizadas (77 testes + TypeScript)
- [ ] Validar navegação visual desktop/mobile — bloqueada pelo renderer WebGL automatizado, que permaneceu em 85% até o limite da captura
- Não publicar (pedido do usuário)

## Pavilhão 13 / B5 — planta interativa
- [x] Preservar orientação canônica, 103 módulos, áreas e geometrias irregulares
- [x] Ativar perfil compartilhado de PAN, zoom, lotes planos e numeração prioritária
- [x] Validar regressões automatizadas (53 testes + TypeScript)
- [ ] Validar navegação visual desktop/mobile — bloqueada pelo renderer WebGL automatizado, que permaneceu carregando por mais de 7 minutos
- Não publicar (pedido do usuário)

## Pavilhão 13 / B5 — planta oficial Fenasoja 2028
- [ ] Reconstruir frame métrico e corredores pelas cotas 3,90 / 3,25 / 4,55
- [ ] Tornar B5-M025/026/078/079 simétricos, diagonais e com 13,50 m²
- [ ] Atualizar totais, fonte e revisão exclusiva do B5, preservando ordem e câmera
- [ ] Reconciliar geometria e áreas persistidas sem alterar IDs, status, preços ou histórico
- [ ] Validar hit-test, rota pública, desktop/mobile, soma 351 e regressões
- Não publicar (pedido do usuário)

## Avisos no celular (push / FCM)
- [x] Tabelas `push_devices` e `push_send_log` com RLS por usuário
- [x] Edge function `send-push-notification` via conector FCM (gateway)
- [x] Lembretes de evento no canal `push` (mesmos destinatários do e-mail)
- [x] Service worker (`push` / `notificationclick`) + `firebase-messaging-sw.js`
- [x] Hook `usePushRegistration` + seção "Avisos no celular" nas Configurações
- [x] Conector Firebase Cloud Messaging conectado e vinculado ao projeto
- [x] Ícone/branding Fenasoja na notificação
- [x] Testes do conteúdo do aviso
- Não publicar (pedido do usuário)

## Pavilhão 3 / B6 — planta oficial Fenasoja 2028
- [ ] Corrigir a numeração/âncoras das quatro colunas centrais conforme a planta oficial
- [ ] Modelar B6-M036 como lote único em L de 24,00 m²
- [ ] Atualizar totais, fonte documental e revisão somente do B6
- [ ] Reconciliar geometrias e áreas persistidas preservando IDs, status, preços e histórico
- [ ] Validar renderização, hit-test, rota pública, desktop/mobile e testes
- Não publicar (pedido do usuário)

## Edição manual de valores 2028
- [x] Override por lote/etapa na fonte oficial, RPCs com permissão, histórico, edição inline na lateral e nos módulos.
- [x] Corrigir contenção responsiva do editor e remover “Vendido por” dos cards de preço.
- [ ] Revisar 9 testes antigos de `commercialMapPavilionModuleCard.test.tsx` (expectativas desatualizadas desde o redesign da lateral/áreas; não relacionados aos preços).

## Exporural 2028 — preflight e áreas oficiais (relatório Codex 25/09/2026)
- [x] Preflight somente-leitura do banco vivo contra a proposta (projeto, revisão, inventário, vínculos, colisões, vias, calibrações, snapshots)
- [x] Cruzar crosswalk/manifesto com inventário vivo: 13 preservações candidatas já têm área oficial idêntica — nenhuma escrita necessária
- [x] Confirmar ausência de vínculos comerciais nos 95 lotes R/S e ausência de colisões de identificadores
- [x] Etapa 1: pacote reextraído (24 arquivos, SHA256 conferidos); cópia de segurança cbe3e0e7-7102-45e7-b0fe-46c4e1061334 (111 entidades, 95 lotes, 111 geometrias)
- [x] Etapa 2: planta aprovada; B37/B38 arquivados; Q-S-36 arquivado; 568,78 m² = via
- [x] Etapa 3: aplicada (snapshot c74019df-476c-4943-8a20-c9a6c3173cd9): 44 lotes preservados, 51 arquivados, 56 criados, 3 vias novas
- [x] Etapa 4: 65 R (29.564,26 m²) + 35 S (16.203,53 m²), R-56 = 249,03 m², transversal ativa
- [ ] 56 lotes novos BLOCKED — aguardando decisão do usuário sobre precificação/liberação para venda
- Não publicar (pedido permanente do usuário)

- [ ] Logo opcional da venda: tratamento, vínculo privado, mapa interno/público e teste sem venda real.
