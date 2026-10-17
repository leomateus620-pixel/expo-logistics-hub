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

Conferido após a última orientação do usuário. O cabeçalho da resposta usa o mascote de 32 px do bot persistido, com nome acessível/tooltip. [Durante o processamento](evidence/mobile-bot-processing-motion.jpg), havia exatamente três pontos e estado `working`; [após concluir](evidence/mobile-bot-complete-motion.jpg), zero pontos e estado `settled`. O avatar permaneceu acima da resposta, sem alterar o texto nem as fontes. [Reabertura](evidence/mobile-bot-reopened.jpg) preservou `worker=mapa`, mascote e três fontes. [Desktop escuro final](evidence/desktop-dark-bot.jpg).

O ambiente do navegador tem movimento reduzido ativo: nesse modo o mascote ficou estático, conforme esperado. Para observar o caminho animado, foi usada a preferência simulada `motion=full`, exclusiva da entrada de QA em loopback e identificada na tela. Isso não modifica a preferência do sistema nem adiciona uma flag ao produto. A prévia também usa atraso sintético de 1,8 s para permitir observar o processamento; esse tempo não mede latência da busca nem atrasa respostas de produção.

No modo animado foram observadas rotação leve, deslocamento e piscada no SVG: 228 amostras, 217 posições distintas e `scaleY` da piscada detectado. Os três pontos usaram a mesma animação com atrasos 0 / 0,18 / 0,36 s. O botão de pausa mudou o mascote para `data-active=false` e transformações neutras; retomar reativou o movimento. [Medição de movimento](evidence/browser-motion.json). São animações observadas no navegador, não inferidas de uma imagem estática.

Final result: pass — nenhuma diferença P0/P1/P2 ficou aberta nas superfícies e estados conferidos. A imagem suavizada da captura e a ausência de dispositivo físico permanecem limitações materiais; não se declara homologação iOS.

Checklist final: abertura, cinco atalhos, marca, fontes compactas, nome/data acessíveis, processamento com três pontos, mascote ao concluir, pausa, reabertura, temas e viewports conferidos. A validação de publicação e sessão remota é distinta deste QA visual.
