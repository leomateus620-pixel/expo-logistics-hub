# Menu "Mapa Comercial" na comissão Espaço do Automóvel

## Causa
A comissão "Espaço do Automóvel" (página com Visão geral, Agenda, Documentos, Equipe, Tarefas) não está ligada ao portal do mapa do segmento automóvel. A Exporural e a Indústria têm essa ligação no cadastro oficial das comissões; o Espaço do Automóvel ficou sem ela, por isso o menu não aparece. As permissões do Elton já estão configuradas.

## O que muda
- No menu lateral da comissão Espaço do Automóvel aparece o item **Mapa Comercial**, depois de "Tarefas".
- Ao tocar, abre o mapa do Espaço do Automóvel com as regras atuais: apenas os lotes do segmento podem ser selecionados, e o restante do parque aparece bloqueado no modo visita.
- Agenda, Documentos, Equipe e Tarefas continuam iguais.
- O item só aparece para quem tem acesso ao mapa desse segmento. Quem não tem acesso não o vê.
- A tela do mapa terá um caminho de volta para a comissão.

## Detalhes técnicos
- `officialCommissionCatalog.ts`: ligar `espaco-do-automovel` ao portal `espaco-automovel` com um campo novo `mapPortalSlug`, sem mudar `moduleSlug`. Assim a página de trabalho da comissão continua existindo.
- `CommissionWorkspacePage.tsx`: quando a unidade tiver `mapPortalSlug` e o usuário tiver a capability do portal (`useCapabilities`), acrescentar aos `sidebarItems` um item com link absoluto para `portal.mapPath` e o ícone `MapPinned`.
- `CommissionLayout`: aceitar item com caminho absoluto (link externo à base da comissão) sem quebrar os itens atuais.
- Teste: a comissão Espaço do Automóvel mostra o menu com a capability e não mostra sem ela. Os testes atuais dos portais continuam passando.
- Não haverá mudanças no banco, nas permissões, nas rotas existentes nem nas outras comissões. Nada será publicado.
