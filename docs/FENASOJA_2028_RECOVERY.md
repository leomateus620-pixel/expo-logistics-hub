# Recuperação de regressões — Fenasoja 2028

## Defeito crítico em Cronograma e Eventos

O artefato publicado `CronogramaEventosPage-B4GFowpA.js` executava
`getTodayKey()`, `getTimelineSnapshot()` e `getCountdownLabel()` como
identificadores globais livres. O navegador lançava `ReferenceError:
getTodayKey is not defined` durante a montagem da rota. Como a rota lazy não
possuía um boundary próprio, a raiz React era desmontada e o fundo navy do
documento permanecia sozinho.

O histórico confirmou a origem: a resolução de merge do countdown importou
`FenasojaCountdownHero`, mas preservou o corpo antigo do cabeçalho sem os seus
imports. A correção restaura a delegação correta ao hero e concentra os helpers
em `buildCronogramaCommandSummary()`, uma fronteira de módulo tipada. A rota
agora também possui loading, acesso negado e recuperação de erro visíveis, com
diagnóstico sanitizado que não registra dados do evento ou do usuário. Assim,
uma futura falha de chunk ou renderização deixa de produzir uma tela silenciosa.

## Mapa de regressões

| Contexto | Antes da migração | Regressão encontrada | Recuperação Fenasoja 2028 |
| --- | --- | --- | --- |
| Sistema visual | Elevação, vidro seletivo e transições físicas | Overrides globais removiam blur, transformações e animações | Tokens semânticos de elevação 0–4, vidro, movimento e interação |
| Login | Painel elevado e feedback de interação | Cartão e controles visualmente planos | Atmosfera em camadas, painel de vidro controlado, foco e CTA físico |
| Portal | Continuidade entre hero, módulos e navegação | Superfícies opacas e cartões estáticos | Header, métricas e cards com profundidade, estado e movimento localizado |
| Navegação logística | Sidebar conectada ao conteúdo | Seleção apenas cromática e header plano | Indicador ativo, sombras de contato, header translúcido e transição estrutural |
| Agenda | Timeline e cartões com hierarquia | Datas, horários e eventos pouco separados | Chips, blocos de hora, cartões e diálogo com elevação coerente |
| Escala | Calendário operacional | Filtros e chips extensos, varredura repetida de assignments | Superfícies agrupadas, chips roláveis e índice O(n) por turno |
| Cronograma | Timeline e workspace relacionado | Tela em branco; mobile ainda herdava verde estrutural | Boundary, estados resilientes, navy/indigo estrutural e workspace conectado lazy |
| Countdown | Contagem oficial 2028 | Merge incompleto, verde estrutural e partículas contínuas | Hero recomposto em navy/indigo, segundos funcionais e atmosfera estática |

## Arquitetura visual

- Elevação `0–4`: combina sombra de contato, ambiente e highlight interno.
- Vidro semântico: superfície tingida, borda perimetral, blur e saturação com
  fallback opaco para contraste aumentado, transparência reduzida e navegadores
  sem `backdrop-filter`.
- Movimento: durações de 90–420 ms, easing padrão/deceleração/spring,
  `press-scale` e `hover-lift`; movimentos contínuos decorativos permanecem
  desativados.
- Cor: navy/indigo para estrutura, laranja para ação, ouro para marcos, verde
  apenas para sucesso/agricultura e vermelho destrutivo dedicado.
- Mobile: blur reduzido, sem hover transform, alvos primários de 44 px e
  respeito a `prefers-reduced-motion`.

## Performance

- Workspace relacional carregado por import dinâmico, com CSS e JavaScript em
  chunks próprios (`30,39 kB` CSS / `5,54 kB` gzip e `21,36 kB` JS / `6,41 kB`
  gzip no build de validação).
- Cronograma principal: `214,85 kB` / `55,39 kB` gzip, com o CSS do countdown
  separado (`18,77 kB` / `3,88 kB` gzip) e sem carregar o workspace antes de
  sua abertura.
- Escala indexa assignments uma vez por turno e memoiza nomes e escalas ativas,
  removendo filtros repetidos por célula do calendário.
- Blur fica restrito a navegação, painéis flutuantes, diálogos e superfícies de
  comando; em mobile os raios caem para 10/14 px.
- Animações usam `transform` e `opacity`, sem loops decorativos permanentes.
- O countdown mantém atualização funcional de segundos, mas remove a chuva de
  partículas, o pulse infinito e a remontagem animada de números.

## Segurança de dados

O fallback consolidado continua somente leitura e identifica explicitamente o
modo protegido. Escritas relacionais permanecem bloqueadas até a sincronização
online responder. A migration incluída endurece a relação entre evento e
subevento; nenhum dado real foi substituído por mocks durante a recuperação.

## Validação

- Vitest: 17 arquivos, 144 testes aprovados.
- TypeScript: `tsc --noEmit` aprovado.
- Build de produção: 4.647 módulos transformados e build aprovado.
- Viewports inspecionados: 390×844, 430×932, 768×1024, 1366×768 e 1920×1080.
- Fluxos inspecionados: Login, Portal, Agenda, detalhe de transporte, Escala,
  criação de escala sem envio, sidebar expandida/recolhida, timeline, calendário,
  detalhe de evento, edição sem gravação e workspace relacionado.
- Console do build final: nenhuma exceção da aplicação nas rotas válidas.
- Contraste calculado nos pares centrais: 6,19:1 a 16,97:1.
