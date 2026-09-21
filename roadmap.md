# Roadmap

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

## Pavilhão 13 / B5 — planta interativa
- [x] Preservar orientação canônica, 103 módulos, áreas e geometrias irregulares
- [x] Ativar perfil compartilhado de PAN, zoom, lotes planos e numeração prioritária
- [x] Validar regressões automatizadas (53 testes + TypeScript)
- [ ] Validar navegação visual desktop/mobile — bloqueada pelo renderer WebGL automatizado, que permaneceu carregando por mais de 7 minutos
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
