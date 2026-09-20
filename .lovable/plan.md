# Consulta pública do Mapa Comercial: tela preta, ficha dos pavilhões e endereço permanente

Três frentes, na ordem em que serão executadas e validadas.

## 1. Tela preta nas três áreas externas

Não há diagnóstico confirmado ainda. O primeiro passo é reproduzir e medir, não corrigir às cegas.

- Abrir Exporural, ICS externa e Espaço do Automóvel no navegador controlado (cache frio, cache aquecido e sessão anônima), coletando: erros de console, respostas do inventário e do contexto, tamanho real da área de desenho, valores de câmera/limites (inclusive NaN), início e perda do contexto 3D.
- Instrumentar as etapas: link validado → dados recebidos → escopo iniciado → cena preparada → primeira imagem → interação liberada, para identificar exatamente onde o processo para.
- Corrigir a causa comprovada. Suspeitas já levantadas, a confirmar antes de mexer: o Espaço do Automóvel não tem segmento definido (é conjunto de entidades), então o foco precisa vir dos lotes do próprio link; a cena inicia só com os dados da área e recebe o parque inteiro depois, trocando as entidades durante a inicialização; o estado compartilhado do mapa (interior, camadas, câmera) não é reiniciado ao entrar no link.
- Passar a apresentar estados visíveis de erro de dados, erro de desenho e carregamento longo, com "Tentar novamente" e atalho para a lista da própria área. Nenhuma situação pode terminar em retângulo preto.
- Registrar "mapa pronto" só depois da imagem apresentada e interação liberada.

## 2. Clique e ficha dos lotes dos pavilhões

Causa provável identificada na leitura do código: a página compara o identificador visual do módulo (ex.: `B1:module:063`) com um índice montado por identificador da entidade, que é um UUID — nunca casa, e a ficha não abre.

- Resolver a cadeia correta: identificador visual do módulo → entidade persistida → lote autorizado do link, reaproveitando os utilitários já existentes de módulos de pavilhão.
- Manter a autorização pelo lote devolvido pelo servidor (número de lote se repete entre pavilhões; não serve como chave).
- Não repetir a entrada no interior a cada atualização de dados, para não limpar seleção nem mover a câmera.
- Ficha: destaque do módulo, abertura imediata (lateral no computador, painel inferior no celular), identificação, localização, metragem, disponibilidade, preço por m² e total; troca ao selecionar outro lote; fechar sem perder o enquadramento; lotes indisponíveis consultáveis, sem ação comercial.
- Validar os sete pavilhões (1, 3, 5, 8, 12, 13, 14) com vários lotes em cada.

## 3. Parque completo e cor só do segmento do link

- Nas três áreas externas: parque inteiro como cenário (ruas, acessos, estruturas, vegetação, pavilhões, lotes vizinhos), abertura já enquadrada na área, navegação livre e botão "Reenquadrar área".
- Coloração comercial aplicada apenas aos lotes do segmento do link. Os demais lotes ficam em material neutro e discreto; construções, vias e vegetação mantêm seus materiais naturais. Preços e status dos outros segmentos não são carregados para desenhar contexto.
- Lista, busca, contagem, soma de m² e medição de interesse continuam restritos ao segmento autorizado. Seleção e consulta só dos lotes do link, em clique, toque, cursor, teclado, lista, busca e endereço direto.

## 4. Sincronização automática, sem aviso de nova versão

- Remover o aviso "Nova versão da consulta disponível" e seu botão, no computador e no celular.
- Dados cadastrais (metragem, preço, status, geometria) passam a atualizar sozinhos, atualizando só o que mudou e preservando câmera, zoom, seleção e ficha aberta.
- Publicação de código/recursos passa a ser aplicada automaticamente, recuperando a posição de navegação quando a reinicialização for inevitável, sem repetição de recarregamentos.
- Cada link usa cache próprio; ao trocar de área nada da área anterior é exibido e respostas atrasadas são descartadas.
- Se o lote aberto sair da área, a ficha fecha com mensagem clara.

## 5. Dez endereços permanentes

Verificado no banco: os dez destinos já existem e estão ativos, mas só o resumo criptográfico da chave foi guardado — as chaves atuais são tecnicamente irrecuperáveis. Portanto:

- Migração única que grava uma chave permanente e recuperável por destino (leitura só por gestor autorizado, no servidor), com unicidade por destino e criação idempotente, mesmo em chamadas simultâneas.
- Os endereços atuais deixam de valer e serão substituídos pelos permanentes; a relação final dos dez será entregue.
- Consultar ou copiar nunca gera outra chave. A operação comum de rotação é removida da tela e desativada no servidor.
- Se um destino for desativado e reativado, volta o mesmo endereço.
- Tela de Gestão: nome da área, endereço permanente, "Copiar link" e "Abrir visualização" — sem "Gerar chave", "Regenerar" ou "Rotacionar". O copiar funciona após fechar/reabrir, recarregar, sair e entrar de novo e em outro dispositivo autorizado.
- Chaves nunca aparecem em registros de acesso ou medição.

## 6. Desempenho, acessibilidade e testes

- Carregamento progressivo priorizando o segmento; reaproveitar geometrias, materiais e instâncias existentes; nada de recursos administrativos na consulta pública.
- Área de toque confortável, rótulos legíveis conforme o zoom, navegação por teclado com foco visível, ficha com rolagem e fechar acessível, painel que não cobre o lote no celular.
- Medir tempo até a primeira imagem e até a interação (meta de 5 segundos no cenário de teste); relatar o número medido.
- Testes dos dez links: abertura direta, recarga, sessão anônima, troca entre links e entre Mapa/Lista, consulta negada a lote fora do escopo (inclusive por chamada direta), atualização de preço/metragem/disponibilidade sem perder navegação, falha de rede e perda do contexto 3D com recuperação, medição sem visitas artificiais.
- Rodar verificação de tipos, testes e conferência visual em computador e celular.

## Detalhes técnicos

- `PublicAreaMapPage.tsx`: reiniciar o escopo do store ao montar; resolver módulo → entidade via `buildPavilionModuleCommercialIndex` (adaptado ao payload público) em vez de `selectedModuleId` contra `lot.entityId`; foco do Espaço do Automóvel derivado de `interactiveEntityIds`; `map_ready` disparado por evento de renderização do canvas.
- `CommercialMapCanvas`: nova entrada de coloração comercial restrita (`commercialColorEntityIds`), com material neutro para lotes fora do conjunto, atualizando apenas os buffers de cor afetados.
- Remover `useAppBuildFreshness` da página e trocar por atualização automática (revalidação por revisão de escopo já existente + recarregamento controlado com restauração de rota em nova versão de assets).
- Migração: coluna de chave permanente em `public_map_links`, índice único por destino, RPC `public_map_link_reveal` (apenas gestores), remoção/bloqueio de `public_map_link_rotate`, provisionamento idempotente dos dez destinos.
- Sem publicação em produção.
