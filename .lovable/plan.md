# Auditoria do modo Vendas — Mapa Comercial (somente leitura)

Nada foi alterado nesta verificação: sem edição de código, sem migração, sem publicação.

Resultado geral: a maior parte do que você pediu já está no projeto após a última correção. O que sobra são pontos reais e específicos, listados abaixo com o que ainda precisa ser feito.

## Item a item

### 1. Pavilhões cortados/simplificados — causa anterior eliminada
O modo Vendas não liga mais o modo gráfico reduzido: não há nenhuma chamada a `setReducedGraphics` dentro de `sales/`. Hoje só restam dois acionadores, ambos manuais e fora de Vendas: o interruptor no painel de camadas (`components/panels/MapPanels.tsx:211,301`) e as telas de diagnóstico.

Ao entrar em Vendas só some ambientação decorativa: bairro residencial, parque de diversões, distrito das nações, árvores e chuva (`components/canvas/CommercialMapCanvas.tsx:4833, 4934, 4942, 4966, 5001`). Terreno, ruas, quadras, pavilhões, módulos e rótulos continuam completos.

Ponto que ainda pode explicar "cortado" e não foi validado visualmente: o mapa tem qualidade adaptativa própria (`utils/adaptiveQualityRuntime.ts`, `renderQualityTier`), que baixa o nível sozinha quando a taxa de quadros cai — independente de Vendas. Falta a validação visual descrita no item 10 para confirmar se o que você viu era isso ou resíduo da versão anterior.

### 2. Seleção e cálculo da venda
Clique em espaço externo e clique em módulo interno agora entram direto no carrinho pelo mesmo despachante (`sales/salesInteraction.ts`), com alternância (clica adiciona, clica de novo remove) e mistura de externos + internos na mesma venda. O painel lista cada item com identificador, contexto, área oficial, preço por m² e total do item, e soma item a item; trocar Renovação ↔ 2ª Etapa recalcula sem perder a seleção (`sales/useSalesCheckout.ts`, `sales/salesPricing.ts`).

Pendência real: o texto vago que você citou não existe mais, mas isso ainda não foi conferido na tela com o mapa rodando.

### 3. Ficha lateral padrão
O clique no canvas é interceptado antes de selecionar a entidade (`components/canvas/CommercialMapCanvas.tsx:4442-4447`): em modo Vendas o clique é consumido pelo carrinho e a ficha lateral não abre. Fora de Vendas nada muda. Os demais pontos que abrem a ficha (criação de lote, diálogo de estrutura) não fazem parte do fluxo de venda.

### 4. Módulos internos
O clique do módulo alterna direto no carrinho (`components/canvas/CommercialPavilionModuleLayer.tsx`), sem depender do card do módulo. Como o carrinho vive em um estado separado do mapa, a seleção sobrevive a entrar e sair do interior dos pavilhões. O botão antigo dentro do card continua existindo como caminho alternativo — decidir se fica ou sai.

### 5. Painel Vendas
Já está sólido (sem transparência), com cabeçalho "VENDAS" e contador, seletor real de etapa com indicador deslizante, lista compacta, área e valor totais em destaque, "Finalizar venda" só com seleção válida, "Limpar seleção" secundário e estado vazio curto. No celular há barra fixa inferior com quantidade, área e valor, abrindo uma gaveta com os mesmos controles.

### 6. Checkout
Continua em três etapas (expositor, pagamento, revisão) com confirmação, validações de CPF/CNPJ, telefone e parcelas, e agora só é montado quando a seleção é válida. No servidor, a operação segue atômica e idempotente por chave, bloqueando lote sem preço oficial.

### 7. Elegibilidade — estado atual do banco (verificado agora)
- 1.579 lotes ativos, todos ainda com status bloqueado. Nenhuma liberação em massa foi feita.
- A camada de elegibilidade existe como consulta oficial e classifica: 1.408 vendáveis e 171 não vendáveis, todos do Pavilhão 7 pelo motivo "sem preço".
- A regra distingue bloqueio técnico (sem histórico comercial, ou apenas o histórico de importação da referência 2026.3) de bloqueio comercial explícito, exige área oficial maior que zero, preço 2028 resolvido e ausência de venda, reserva, negociação ou contrato ativo.
- O aplicativo não usa mais lista de status: ele apenas espelha essa decisão do servidor, e a operação de venda revalida a mesma regra antes de gravar.

Pendência real: a consulta de elegibilidade respeita as permissões de quem está logado, mas isso ainda não foi exercido com um usuário real — se as permissões de leitura de lotes não alcançarem o usuário comercial, o carrinho ficará sem itens elegíveis.

### 8. Pavilhão 7
Permanece intocado, sem preço, marcado como indisponível e impedido no carrinho e na confirmação da venda.

### 9. Realce visual
Selecionados ganham realce dourado forte e leve elevação, tanto nos espaços externos quanto nos módulos internos, sem alterar geometria. Hover e seleção comum continuam distintos. Falta reforçar a leitura de vendido/bloqueado por contorno, hoje apoiada só em cor.

## O que ainda precisa ser feito

1. Validação visual no mapa rodando: 1366×768, 1920×1080 e 360/390/430, em Exporural, Indústria/Comércio/Serviços, Espaço do Automóvel e no interior de pavilhões — confirmando que nenhum pavilhão aparece cortado, que a ficha lateral não abre e que a multi-seleção soma corretamente.
2. Confirmar, com um usuário comercial real, que a lista de espaços vendáveis chega ao aplicativo.
3. Decidir sobre o botão "adicionar à venda" dentro do card do módulo: manter como atalho ou remover para evitar dois caminhos.
4. Contorno próprio para vendido/bloqueado, sem depender apenas de cor.
5. Testes de tela (hoje só existem testes de regra): painel não abre a ficha lateral, carrinho vazio não abre o checkout, barra inferior aparece no celular.

## Riscos de regressão

- Ocultar ambientação por engano em outros modos, se o preset de Vendas não for restaurado ao sair.
- Interceptar clique fora de Vendas e quebrar a navegação normal do mapa.
- Liberar lote bloqueado por decisão comercial ao afrouxar a regra de elegibilidade.

## Sequência sugerida

1. Validação visual e de permissão (itens 1 e 2).
2. Ajustes finos de leitura visual e caminho duplicado (itens 3 e 4).
3. Testes de tela (item 5).

## Detalhes técnicos

- Preset visual: `salesPresentationActive` no store do mapa, separado de `reducedGraphics`.
- Despachante de clique: `sales/salesInteraction.ts`, consumido por `CommercialMapCanvas` e `CommercialPavilionModuleLayer`.
- Elegibilidade: consulta `commercial_sale_eligibility` (respeita permissões do usuário), espelhada por `sales/salesEligibility.ts` e revalidada em `register_commercial_sale_order`.
- Cálculo: `sales/salesPricing.ts` soma item a item; nunca área total × preço único.
- Invariantes preservados: áreas oficiais, preços, regras 2028, esquinas, geometrias, identificadores, numeração e Pavilhão 7.
