# Avisos no celular dentro da Agenda Fenasoja

Hoje a opção de ativar os avisos no celular só existe na tela de Configurações do sistema. A ideia é colocá-la também dentro do módulo Eventos Fenasoja, com um ícone próprio na barra superior.

## O que muda

- Um novo ícone de sininho aparece na barra superior da Agenda Fenasoja, ao lado do status do Google Agenda.
- Quando os avisos já estão ligados naquele aparelho, o ícone mostra um ponto dourado indicando "ativo".
- Ao tocar no ícone abre um painel curto com:
  - explicação de que o aviso chega 1 hora antes do evento e quando a pessoa é vinculada a um evento;
  - botão "Ativar avisos" (ou "Reativar neste aparelho");
  - botão "Desativar" quando já está ativo;
  - mensagem clara quando o navegador não suporta, quando a permissão foi bloqueada ou quando o serviço não está configurado.
- No celular o mesmo ícone fica visível na barra, sem depender do menu lateral.
- A seção existente em Configurações continua como está — as duas telas usam o mesmo controle e refletem o mesmo estado.

## Detalhes técnicos

- Novo componente `src/components/cronograma-eventos/CronogramaPushStatusButton.tsx`, no mesmo padrão visual do `CronogramaGoogleStatusButton` (botão compacto + Popover), consumindo `usePushRegistration` (`status`, `busy`, `hasDevice`, `enable`, `disable`, `configured`) e usando `toast` para o retorno.
- Montagem em `CronogramaModuleShell.tsx`, dentro de `cronograma-command-layer__right`, imediatamente antes/depois de `cronograma-command-layer__google`, sem alterar o comportamento não-sticky da `.cronograma-module-bar`.
- Estilos reaproveitados de `@/styles/cronograma-command-layer.css`; nenhuma cor fora dos tokens (verde/dourado já existentes).
- Nenhuma mudança em backend, edge functions, tabelas `push_devices` / `push_send_log` ou regras de quem recebe o quê.
