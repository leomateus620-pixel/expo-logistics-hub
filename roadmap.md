# Roadmap

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
