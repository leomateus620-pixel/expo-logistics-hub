# Tela de "código" vista pelo Fabiano: diagnóstico e correção

## O que realmente aconteceu

O print não é um erro do sistema. É o **código-fonte da página** exibido pelo navegador (tela de "ver código-fonte", com a caixa "Quebra de linha" no topo). O conteúdo mostrado é exatamente o HTML inicial do sistema (título "Fenasoja 2028 | Gestão Operacional", tela de carregamento e aviso de JavaScript). Como ao recarregar o sistema abriu normalmente no Chrome do notebook, não houve falha de login, de banco nem de permissão — foi um acesso ao código-fonte da página, não uma quebra da aplicação.

## Problema real encontrado durante a verificação

Ao inspecionar esse mesmo HTML, apareceu uma inconsistência legítima: a página abre uma conexão antecipada (`preconnect` / `dns-prefetch`) para um **endereço de backend antigo, que não é o backend atual do projeto**. Isso não derruba o sistema, mas:

- gera uma resolução de DNS e uma conexão inútil a cada carregamento;
- atrasa levemente o primeiro acesso, em vez de acelerá-lo (que é o objetivo do preconnect);
- é um resíduo de configuração que pode confundir diagnósticos futuros.

## Correção proposta

1. Apontar o `preconnect`/`dns-prefetch` para o endereço do backend realmente usado pelo sistema, tirando o host antigo — assim o ganho de performance passa a existir de fato no primeiro carregamento.
2. Fazer uma verificação rápida no navegador (carregar a página e conferir as requisições de rede) para confirmar que só o backend correto é contatado e que a tela de carregamento dá lugar ao portal normalmente.

Nada de layout, telas, permissões, dados ou fluxo de login será alterado.

## Detalhes técnicos

- `index.html`: substituir as tags `<link rel="preconnect">` e `<link rel="dns-prefetch">` que apontam para `fidagsspejekripwkczr.supabase.co` pelo host do backend ativo do projeto.
- Sem mudanças em `src/`, sem migração de banco, sem alteração de RLS ou de Edge Functions.
- Validação: carregar `/` e inspecionar a aba de rede para confirmar ausência de chamadas ao host antigo.

## Orientação ao usuário

Se a tela de código voltar a aparecer, é sinal de que o atalho de "ver código-fonte" foi acionado (Ctrl+U) ou de que o endereço foi aberto com `view-source:` na frente. Basta remover esse prefixo ou abrir novamente `fenasojagestao.com`.
