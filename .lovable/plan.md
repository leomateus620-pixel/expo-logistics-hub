# Rotação segura da chave Firebase e reconexão do FCM

## Contexto
A chave privada da conta de serviço Firebase foi exposta no histórico do chat. Por segurança, ela deve ser revogada no Firebase e substituída por uma nova, reconectando o conector Firebase Cloud Messaging sem colar credenciais no chat.

## Passos
1. Verificar o estado atual do conector Firebase Cloud Messaging neste projeto.
2. Abrir o fluxo seguro de reconexão do conector para que você insira a nova chave diretamente na UI do Lovable, sem passar pelo chat.
3. Confirmar que as variáveis de ambiente do conector foram atualizadas no backend.
4. Redeployar as edge functions que dependem do conector (`send-push-notification`, `event-reminders`).
5. Testar o envio de avisos no preview (Configurações → Avisos no celular).

## Não inclui
- Publicação em produção.
- Mudança nas regras de destinatários, RLS ou permissões.
- Criação de novas tabelas ou estrutura de push (já existem).
