# Separação de workspaces: Restaurante e Arena

Reestrutura o módulo "Agenda Restaurante e Arena" em dois ambientes operacionais claramente separados, mantendo um único módulo coeso.

## 1. Seletor de workspace no lugar do hero azul

O bloco azul atual ("Planejamento de ocupação / Agenda / Períodos, espaços...") é substituído por um seletor premium com duas opções:

- **Agenda Restaurante** (ícone de talheres, acento quente/âmbar)
- **Agenda Arena** (ícone de arena/palco, acento frio/azul-elétrico)

Cartões compactos lado a lado, com estado ativo em relevo (borda de acento, brilho sutil, deslocamento de 1px), transição suave e indicação imediata do ambiente ativo. À direita permanecem "Novo evento" e o botão de atualizar. No mobile vira um controle segmentado de largura total, troca com um toque.

Abaixo do seletor, uma linha discreta de contexto: nome do espaço ativo, capacidade e total de eventos no período — substituindo o parágrafo descritivo removido.

## 2. Rotas dedicadas

Novas rotas com segmentos explícitos:

```text
/eventos-restaurante-arena/restaurante/agenda
/eventos-restaurante-arena/restaurante/eventos
/eventos-restaurante-arena/arena/contrapartidas
... (agenda, eventos, contrapartidas, patrocinadores, operacao, historico, relatorios)
```

- `/eventos-restaurante-arena` redireciona para o último ambiente usado (guardado no navegador) ou para Restaurante.
- Links antigos com `?visao=` continuam funcionando via redirecionamento.
- O ambiente ativo é preservado ao navegar entre as seções e sobrevive a recarregar a página (a URL é a fonte da verdade).

## 3. Separação de dados

Os dois espaços já existem no banco (`Restaurante Fenasoja`, `Arena Fenasoja`) e todos os 98 eventos já estão vinculados a um espaço — não é necessário migrar o banco.

A separação é aplicada por espaço ativo em:

- agenda e listas de eventos;
- disponibilidade, bloqueios e janelas operacionais;
- contrapartidas e consumo (filtrados pelo espaço do contrato);
- registros operacionais, histórico e relatórios.

Regras confirmadas:
- **Eventos que usam os dois espaços aparecem nas duas agendas**, com um selo "Compartilhado" para deixar claro que o registro é o mesmo (sem duplicar).
- **Patrocinadores permanecem compartilhados** (base única do módulo); as contrapartidas é que são separadas por ambiente.

## 4. Navegação reorganizada

Removidos: **Visão geral** e **Pendências** (os alertas de pendência passam a aparecer como aviso contextual dentro de Agenda/Operação, sem virar aba).

Grupos finais, iguais nos dois ambientes:

```text
PLANEJAMENTO   Agenda · Eventos
GESTÃO         Contrapartidas · Patrocinadores · Operação
CONTROLE       Histórico · Relatórios
```

Ao remover "Visão geral", a Agenda passa a ser a tela inicial de cada ambiente.

## 5. Refinamento visual da navegação

- Nomes dos menus com mais peso tipográfico e tamanho legível; rótulos de grupo menores, discretos e sem caixa.
- Separação entre grupos por espaçamento e um divisor fino, em vez de várias bordas.
- Estado ativo sólido com o acento do ambiente; hover e foco com resposta clara e acessível.
- Ícones consistentes em tamanho e traço; ritmo horizontal uniforme.
- No mobile a barra vira rolagem horizontal contida por grupo, sem estouro de layout.

## 6. Agenda por ambiente

- Título passa a ser "Agenda do Restaurante" ou "Agenda da Arena".
- A faixa acima da lista mantém apenas período selecionado e quantidade de eventos; o rótulo "Restaurante e Arena" some (o espaço já está no topo).
- Busca, seletor de período e filtros operam somente sobre os dados do ambiente ativo.
- O filtro "Todos os espaços" é substituído por filtro de subáreas do espaço ativo.

## 7. Novo evento

- "Novo evento" abre já com o espaço do ambiente ativo selecionado.
- Trocar o espaço continua possível, mas explícito: ao marcar o outro espaço, um aviso indica que o evento passará a aparecer também na outra agenda.

## 8. Responsivo

- Desktop/notebook: seletor compacto, navegação horizontal em uma linha, mais espaço para a agenda.
- Tablet: grupos em duas linhas sem quebra de hierarquia.
- Mobile: seletor segmentado de largura total, navegação com rolagem por grupo, cartões de evento com área de toque confortável.

## Detalhes técnicos

- Novo `VenueWorkspaceContext` (provider) resolvendo `venue: "restaurante" | "arena"` a partir do segmento da rota, com o `venue_spaces.type` correspondente.
- `src/App.tsx`: rotas aninhadas `/:venue/:view` sob `/eventos-restaurante-arena`, com validação de segmentos e redirecionamento de rotas legadas.
- `VenueWorkspace.tsx` (2.9k linhas) deixa de gerenciar `?visao=`; `view` e `venue` passam a vir da rota. Extração do hero e da navegação para `VenueWorkspaceSwitcher.tsx` e `VenueWorkspaceNav.tsx`.
- `useVenueOperations` ganha filtragem derivada por `space_id` (via `venue_event_spaces`, `venue_space_blocks`, `venue_counterpart_agreements.space_id`), memoizada, sem alterar as consultas ao banco.
- `VenueEventFormDialog` recebe o espaço ativo como padrão e emite o aviso de evento compartilhado.
- Acentos por ambiente via tokens em `venue-events-shell.css` / `venue-events-production.css` (`--venue-accent`), sem cores fixas nos componentes.
- Sem migração de banco.

## Validação

- Contagem de eventos por ambiente conferida contra o banco (Restaurante 97 / Arena 1 hoje).
- Troca de ambiente, navegação entre seções, URLs diretas e recarregamento verificados no navegador.
- Criação de evento a partir de cada ambiente.
- Layout mobile sem estouro horizontal.
