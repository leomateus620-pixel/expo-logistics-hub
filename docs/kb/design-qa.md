# Conferência visual da Equipe Fenasoja

Data: 17/10/2026. Skill aplicada: Product Design, com comparação visual e verificação da implementação no navegador.

## Referência e escopo

As três imagens fornecidas pelo usuário mostram o cabeçalho, a navegação lateral e o painel contextual anteriores. O objetivo é a simplificação solicitada, não uma cópia dessas telas: remover a faixa de contexto, adicionar sugestões, reunir atalhos, destacar a marca e compactar fontes. A orientação posterior substitui os chips extensos por ícones de fonte. O último complemento pede o mascote do bot nas respostas e três pontos durante o processamento.

Comparação local pareada em 390 × 844 CSS px: [abertura anterior](evidence/before-mobile-light.jpg) e [abertura revisada](evidence/mobile-light-welcome.jpg); [navegação anterior](evidence/before-sidebar-mobile.jpg) e [navegação revisada com foco](evidence/mobile-sidebar-focus.jpg). As imagens de cada par foram abertas juntas na mesma inspeção. As referências do usuário contêm o navegador do iPhone; as capturas locais mostram apenas o conteúdo do navegador. Não se mede fidelidade pixel a pixel entre esses enquadramentos diferentes.

## Resultado observado

- A abertura ganhou três perguntas completas em cartões verticais. O cartão do Mapa usa o ícone pertinente; a seleção preenche o campo sem enviar. A descrição rotativa não disputa espaço com a identificação do bot durante a conversa.
- Os cinco atalhos ocupam uma linha. Os oito bots continuam disponíveis; a redução da navegação deixou mais espaço para o histórico. Foco por Tab revela o nome; Escape fecha a dica/painel e retorna o foco ao acionador.
- O painel contextual abre sem a faixa “Consultando com o contexto da tela atual”. O contexto continua no fluxo interno, sem um aviso visual redundante. [Captura](evidence/mobile-copilot.jpg).
- As fontes aparecem em uma linha de pequenos ícones. Cada link tem alvo de aproximadamente 44 × 44 CSS px, nome acessível e detalhe de fonte/data. O rótulo longo quebra dentro da dica sem sair da tela. [Fonte longa com foco](evidence/mobile-source-tooltip.jpg). Links externos mantêm nova aba e `noopener noreferrer`.
- Uma conversa criada na prévia foi fechada e reaberta por Recentes: texto, bot, edição e três fontes foram preservados. [Reabertura](evidence/mobile-reopened.jpg). A prévia usa dados de teste; a persistência SQL é verificada separadamente na matriz de integração.

## Superfícies de apresentação

| Superfície | Conferência |
| --- | --- |
| Tipografia | Família existente Inter/system-ui preservada. Marca em 13 px no cabeçalho móvel, BOT peso 800 e FENASOJA 750; nome azul usa token existente. Texto das perguntas e respostas quebra sem reticências silenciosas. A marca menor dentro da mensagem inicial continua secundária. |
| Espaçamento e composição | Cartões em fluxo normal, campo de mensagem acessível, navegação horizontal e nenhum overflow horizontal observado nos tamanhos conferidos. Fontes não ocupam cartões grandes abaixo da resposta. |
| Cores e tokens | BOT escuro e FENASOJA azul no tema claro; adaptação clara no tema escuro para manter leitura. Cores semânticas dos bots e tokens do projeto preservados. Foco visível no teclado. |
| Imagens | Mascotes existentes mantidos, sem substituição por imagens geradas. Capturas JPEG do navegador embutido apresentam suavização; isso limita avaliação de antialiasing fino, não prova nitidez em um iPhone físico. |
| Conteúdo | Ressalvas e referência temporal permanecem visíveis no corpo. Nome da fonte, tipo e acesso declarado estão disponíveis na dica e no nome acessível. A data da fonte não é apresentada como verificação atual do fato. |

## Ambientes e limites

Foram conferidos 390 × 844 e 1440 × 960 CSS px, ambos em tema claro e escuro. O navegador embutido estava com fator 1,14; a viewport física foi ajustada e `innerWidth`/`innerHeight` confirmados no DOM. Em ambos os tamanhos, a largura de rolagem não ultrapassou a viewport. Evidências: [desktop claro](evidence/desktop-light.jpg), [desktop escuro](evidence/desktop-dark-sources.jpg), [celular escuro](evidence/mobile-dark-sources.jpg).

A rotação de 60 segundos, pausa por interação e preferência de movimento reduzido têm regressões automatizadas. A navegação, seleção, envio, reabertura e foco foram exercitados no navegador. Não foram usados sessão de produção, dispositivo físico, VoiceOver ou teclado virtual de iOS; a emulação não comprova esses ambientes.

## Complemento de mascote e processamento

Em implementação após a última orientação do usuário. A conferência final deve registrar mascote no início do processamento, três pontos animados, remoção dos pontos ao concluir, animação discreta após conclusão e preservação da identidade ao reabrir.

Final result: blocked — somente a conferência do último complemento de mascote está pendente. Os itens anteriores não apresentaram diferenças P0/P1/P2 na comparação final acima.
