# Trazer a PR 141 (refino mobile da Agenda Restaurante e Arena) para o projeto

## Situação atual (verificada agora)

- O último trabalho registrado aqui é "Adicionou requerente ao cadastro" (a alteração que fizemos na Agenda Restaurante e Arena).
- Não há nenhum registro da PR 141 no projeto: o conteúdo dela não chegou.
- O projeto está trabalhando em um ramo de edição próprio, e não diretamente na `main` do GitHub.

Ou seja: o merge foi feito no GitHub, mas ele ainda não desceu para cá.

## Por que isso acontece

A sincronização com o GitHub é automática e sempre nos dois sentidos, mas ela liga o projeto a **um ramo específico**. Quando o projeto não está apontando para a `main`, ou quando a conexão do repositório foi interrompida, os merges feitos no GitHub não aparecem aqui. Eu não consigo forçar essa puxada pelo chat — ela é feita pela própria conexão do projeto.

## O que você faz (leva 1 minuto)

1. No editor, abra o menu **+** (canto inferior esquerdo do chat) → **GitHub**.
2. Verifique se o projeto está conectado ao repositório certo e se o ramo selecionado é **main**.
3. Se estiver em outro ramo, troque para **main**. Se aparecer opção de reconectar/sincronizar, use-a.
4. Aguarde alguns segundos e recarregue a prévia.

## O que eu faço depois

1. Confiro se o conteúdo da PR 141 chegou (novos ajustes mobile nos estilos e componentes da Agenda Restaurante e Arena).
2. Verifico se ele conflita com a alteração de requerente/tipo livre e filtro de mês que acabamos de fazer — se houver sobreposição nos mesmos cartões, eu reconcilio mantendo as duas melhorias.
3. Testo na prévia em 320, 375, 390 e 430px e no desktop, nas abas Agenda e Todos os eventos, para Restaurante e Arena.
4. Reporto o que mudou e o que precisa da sua conferência. Nada é publicado em produção.

## Alternativa, se a conexão não voltar

Se o ramo não puder ser trocado, me diga e eu reaplico aqui o refino mobile descrito na PR 141 (Agenda + Eventos, Restaurante + Arena, somente em telas pequenas, preservando o desktop), a partir do resumo da PR e das telas de referência.
