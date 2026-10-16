# Equipe IA Fenasoja — revisão visual

O relatório anterior do Portal permanece na raiz, sem alteração de conteúdo.

Data: 16/10/2026. Escopo: UI das Fases 0 e 1, somente leitura.

## Resultado e limite da verificação

final result: passed

A interface foi aberta e testada em Chromium, com React, os componentes de produto e o hook `useWorkersChat` reais. A prévia em `http://127.0.0.1:5188` substitui identidades, permissões, histórico e resposta SSE por dados sintéticos locais. Nenhum provedor real de IA, busca externa, RLS publicada ou dado de produção foi exercitado nesta revisão visual.

O roteiro reproduzível é `scripts/workers/visual-qa.mjs`; os resultados quantitativos completos ficam em `visual-qa-results.json`. A prévia precisa ser iniciada com `scripts/workers/preview.vite.config.ts`. Os caminhos de Playwright, Axe e navegador podem ser configurados por variáveis `WORKERS_QA_*` no script. O navegador usa contextos novos e isolados, sem perfil pessoal.

## Verificação final após isolamento do CSS

Executada em 16/10/2026 às 03:56 (America/Sao_Paulo), após retirar utilities da assinatura da equipe, preservar o espaçamento em CSS local, ajustar a margem equivalente no aviso administrativo e usar a atualização funcional do tema. Nenhum código de produto foi alterado durante esta rodada de QA.

| Verificação | Resultado |
| --- | --- |
| Capturas principais | 56, em 390×844 e 1280×800, claro/escuro |
| Axe WCAG A/AA | 56/56 estados sem violações |
| Overflow | 66 verificações, incluindo 360px, sem falhas |
| Terminologia | Nenhum “worker” ou “workers” em texto visível ou rótulos acessíveis |
| Interações | 8/8 passaram |
| Console e página | Nenhum erro registrado |
| Mascotes com CPU 4× | 12 ativos; 60.1086 FPS; p95 16.7000ms |
| Streaming sintético | CLS 0; deslocamento bruto com interação recente 0.07038082 |

Os valores completos e os limites da fixture permanecem em `visual-qa-results.json`.

## Referências e normalização

As imagens fornecidas são inspiração de interação, não uma solicitação de copiar produtos ou fluxos de terceiros. As referências primárias de UI são:

- Desktop: `/Users/leonardo/Downloads/WhatsApp Image 2026-10-16 at 01.30.22 (2).jpeg` — 1125×683px, incluindo faixa de captura, sidebar, cluster e composer.
- Mobile: `/Users/leonardo/Downloads/WhatsApp Image 2026-10-16 at 01.30.21 (1).jpeg` — 591×1280px, incluindo a interface de sistema do telefone.
- Personalização: `/Users/leonardo/Downloads/WhatsApp Image 2026-10-16 at 01.30.22.jpeg` — referência de sheet, não funcionalidade liberada nesta fase.
- Briefing e adendos: paleta Fenasoja, oito especialidades, SVG + Motion por instrução explícita, leitura com fontes, ausência de marketplace e limitações por fase.

As referências e implementações foram colocadas no mesmo arquivo de comparação em `/tmp/workers-mobile-comparison.png` e `/tmp/workers-desktop-comparison.png`, inspecionados visualmente. As referências foram redimensionadas preservando a proporção e com letterbox; as capturas do produto usam `deviceScaleFactor=1`, viewport/CSS de 390×844 ou 1280×800 e não desenham a interface de sistema do telefone. A comparação avalia composição, hierarquia e interação; não atribui ao produto diferenças de chrome, densidade, cópia ou identidade de outros serviços.

As fotos de referência permanecem fora do repositório. A implementação usa a marca da Fenasoja, cores e formas definidas no briefing, e textos próprios sobre os processos da feira.

## Evidências da implementação

Há 56 capturas principais cobrindo os dois tamanhos, nos temas claro e escuro:

- A equipe e os oito perfis completos.
- Chat vazio e chat com uma resposta SSE sintética, fontes e chips navegáveis.
- Revisão administrativa de mascotes e demonstração de rotina/chips.
- Sheet de novo bot, identificado como prévia da Fase 4.

Exemplos: `captures/390x844-light-chat-vazio.png`, `1280x800-light-chat-vazio.png`, `1280x800-light-equipe-viewport.png`, `390x844-light-perfil-agenda.png` e `390x844-dark-novo-worker-previa.png`. Os nomes técnicos de arquivos preservam `worker`; a denominação visível aprovada é “bot”.

A revisão de regiões incluiu o hero, a saudação/lista mobile, o composer, os controles e labels do sheet, os estados de confirmação demonstrativos e os links/chips da resposta. Essas regiões foram abertas em capturas próprias e nas páginas completas; a altura das páginas de perfil não foi usada para julgar texto ilegível em uma miniatura reduzida.

## Histórico de achados e correções

1. **[P1] A home mobile começava rolada para baixo.** A primeira captura escondia a saudação e os primeiros bots. O efeito de auto-scroll foi limitado a conversas com mensagens. Evidência anterior: `390x844-light-chat-vazio-before-scroll-fix.png`. A captura atual mostra “Olá, Leonardo.” e o início da lista. Foi adicionado um teste de regressão.
2. **[P1] Mascotes decorativos apareciam na navegação de foco.** O gesto `whileTap` do Motion adicionava foco a elementos `aria-hidden`. Foi definido `tabIndex=-1` nos mascotes; as ações continuam nos links e botões com nome acessível. O Axe não encontra mais `aria-hidden-focus`.
3. **[P2] Dois contrastes insuficientes.** O contador lateral tinha opacidade reduzida e o badge de ação usava azul escuro sobre superfície escura. O contador passou a usar a tinta integral e o badge escuro usa azul claro. A rodada final não apresenta violações de contraste AA.
4. **[P2] Acabamento do sheet.** O fechar herdava ícone claro sobre fundo claro no tema escuro; recebeu tinta/fundo locais e alvo de 44px. O campo de nome passou a preservar capitalização e a grade mobile foi ajustada para não partir “Paralelogramo” dentro da palavra.

5. **[P2] Contraste da nova assinatura da equipe.** Após a integração do ícone próprio solicitado pelo usuário, a opacidade do subtítulo “Equipe IA” produzia contraste de 2,74:1 no claro e 3,81:1 no escuro. A assinatura passou a usar a tinta semântica local sem redução de opacidade, preservando dimensões e layout. As telas foram recapturadas e auditadas novamente.

O relatório bruto da primeira rodada está em `visual-qa-initial-results.json`. Os erros intermitentes de navegação durante reinício do servidor foram corrigidos no roteiro, usando esperas de estado e páginas isoladas. Não foram tratados como falhas do produto.

## Superfícies de fidelidade avaliadas

| Superfície | Resultado |
| --- | --- |
| Tipografia | Inter, hierarquia de títulos e corpo coerente com o sistema existente. Legendas operacionais usam 13/18; display se adapta a 32/40 no mobile. Não há truncamento que esconda ações essenciais. |
| Ritmo e layout | Frame suave, sidebar no desktop, lista no mobile, composer persistente, seções e cards com espaço consistente. Nenhuma rolagem horizontal em 360, 390 ou 1280px. |
| Cores e tokens | Navy/indigo como base, laranja/dourado como acento; tintas de bot separadas das cores decorativas. Claro e escuro testados com Axe AA. Nenhum token global foi alterado para esta UI. |
| Imagens e mascotes | Formas SVG nítidas, luz e sombra de contato, oito identidades distintas. SVG e animação são uma exigência explícita do briefing, prevalecendo sobre a preferência genérica do skill por imagens raster. |
| Cópia e conteúdo | Exclusiva da Fenasoja, denominação “bots”, sem marketplace ou serviços médicos. Rotinas, configuração e ações futuras têm indicação clara de fase. Números visíveis no chat de teste vêm da fixture identificada. |

## Interações e acessibilidade

Passaram a seleção por @menção com identificação do bot efetivo, envio SSE, fontes/chips com URLs permitidas, consentimento antes da voz, Ctrl/Cmd+K, Tab, acesso ao perfil sem permissão do módulo, recusa da rota administrativa para leitura, abertura/fechamento do copiloto e a prévia local de nome/cor/forma. A permissão testada aqui é sintética; a auditoria de servidor é documentada separadamente.

O Axe foi executado com regras WCAG 2 A/AA e 2.1 A/AA nas 56 telas/estados. O relatório final registra zero violações. Foram verificados erros de página e console. Isso não substitui uma avaliação manual completa com leitor de tela.

## Desempenho e movimento

A medição usa um desktop com Chromium e CPU limitada a 4×, não um celular físico. A cena de teste garante 12 mascotes ativos e relata FPS e p95 bruto no JSON. Na rodada final foram observados 60.1086 FPS e p95 de 16.7000ms; os valores brutos são preservados no JSON, inclusive o jitter entre 16,7 e 16,8ms observado nas rodadas anteriores.

O CLS da resposta curta de teste foi 0, abaixo de 0,05. O relatório também apresenta o deslocamento bruto que inclui a troca inicial após o envio; essa métrica é distinta do CLS, que exclui interações recentes. A fixture curta não reproduz latência ou tamanho de respostas reais do provedor.

O limite de 12 animações, a pausa fora da tela/em aba oculta e os timers semeados têm testes unitários. Reduced-motion foi deliberadamente ignorado somente nos bots, seguindo a instrução direta mais recente; as regras globais existentes foram preservadas.

## Limitações e próximos testes

- As telas autenticadas anteriores de Dashboard, Agenda, Mapa e Arena não foram comparadas visualmente com dados reais nesta prévia isolada. Portanto, não há declaração de pixel diff idêntico dessas telas.
- O botão de copiloto é uma adição intencional de navegação nas telas permitidas. O funcionamento dos módulos existentes e a ausência de mudanças em seus arquivos são verificados fora deste relatório.
- O serviço real de voz depende do navegador. A revisão automatizada testa o consentimento, sem gravar áudio.
- Rotinas e cards que alteram registros permanecem demonstrações administrativas ou indicações de fases posteriores.
- Testes em um dispositivo móvel físico e medições com respostas longas do provedor continuam como validação adicional de desempenho.

Não há achados visuais P0/P1/P2 pendentes nesta UI de leitura, dentro dos limites descritos.
