# Modo Vendas 2028 — liberação comercial e acabamento final

Escopo: liberar comercialmente os espaços já com área e preço oficiais, finalizar a experiência de venda no mapa e provar tudo com testes. Nada será publicado.

Observação sobre as imagens enviadas: elas mostram o painel antigo ("Toque nos espaços do mapa…") e a ficha lateral abrindo ao clicar no lote. No código atual essas duas coisas já foram corrigidas — a tela que você viu é a versão anterior carregada no navegador. A primeira coisa do plano é confirmar isso na tela real antes de mexer em qualquer coisa.

## Etapa 1 — Conferência antes de tocar em dados

- Reconferir no banco: total de espaços ativos, quantos bloqueados, quantos elegíveis e quantos do Pavilhão 7.
- Números esperados: 1.579 bloqueados, 1.408 elegíveis, 171 do Pavilhão 7 sem preço.
- Gerar um relatório de simulação (sem gravar) com identificador, quadra/pavilhão, status atual, área oficial, situação do preço e motivo da elegibilidade.
- Se os números divergirem, parar e reportar — nenhuma liberação silenciosa.

## Etapa 2 — Liberação comercial controlada

- Uma única operação transacional que muda para "disponível" apenas os espaços bloqueados que a camada oficial de elegibilidade considera vendáveis.
- Cada mudança gera um registro de histórico com situação anterior, nova situação e o motivo "Liberação comercial 2028 após validação de área oficial e precificação".
- O histórico antigo de importação e bloqueio é preservado, nunca apagado.
- Pavilhão 7 permanece bloqueado e sem preço.
- Conferência depois: contagem por situação, soma das áreas, quantidade de regras de preço e de esquinas inalteradas, nenhuma venda criada.

## Etapa 3 — Pavilhão 7 e espaços sem valor

- No mapa e no carrinho aparecem como "Valor ainda não definido / Indisponível para venda".
- Clique não adiciona, o fechamento da venda fica bloqueado e nenhum preço é criado.

## Etapa 4 — Qualidade visual dos pavilhões

- Conferir, comparando lado a lado mapa normal e modo Vendas, que telhado, fachadas, vigas, sombras, módulos, rótulos e proporção são idênticos.
- Garantir um piso mínimo de qualidade estrutural no modo Vendas: a redução automática por desempenho pode simplificar ambientação, nunca a arquitetura comercial.
- Modo Vendas continua ocultando só ambientação (árvores, pessoas, chuva, parque, bairro externo, efeitos) e restaurando tudo ao sair.

## Etapa 5 — Interação e seleção

- Clique no espaço externo e no módulo interno alterna direto no carrinho; a ficha lateral não abre no modo Vendas e continua normal fora dele.
- Dentro do modo Vendas, o botão "adicionar à venda" do card do módulo é ocultado para não existirem dois caminhos.
- Seleção sobrevive a mover câmera, trocar quadra/segmento, entrar e sair de pavilhões e trocar de etapa.
- Realce: contorno claro para disponível, brilho leve no hover, contorno forte com leve elevação e pulso único ao selecionar, aparência distinta para vendido, bloqueado e sem preço — sempre por contorno/espessura/opacidade, não só cor.

## Etapa 6 — Painel e carrinho

- Entrada no modo com transição curta (cerca de 200 ms), painel deslizando pela direita.
- Desktop: painel sólido de 340–390 px, cabeçalho "VENDAS" com subtítulo "Mapa Comercial • Fenasoja 2028" e contador de espaços, fechar discreto.
- Seletor de etapa como controle segmentado real, com indicador animado; trocar recalcula cada item na hora, com transição suave nos valores, sem perder seleção.
- Cada item: quadra/pavilhão e número, área, valor por m², total do item e remover discreto.
- Área total e, em maior destaque, valor total. Soma sempre item a item.
- Estado vazio curto: "Selecione os espaços diretamente no mapa." com a linha de apoio "Clique em um lote para adicionar à venda."
- Botão de finalizar só ativo com seleção válida; com item sem valor, desabilitado e com o motivo visível.
- Celular (360/390/430): barra inferior com quantidade, área e valor, abrindo uma gaveta com os mesmos controles.

## Etapa 7 — Fechamento da venda

- Três etapas: expositor (nome/razão social, CPF ou CNPJ, celular, e-mail e observações opcionais), pagamento (à vista ou parcelado, método, primeiro vencimento, cronograma automático com ajuste de centavos) e revisão completa antes de confirmar.
- Não abre com carrinho vazio ou inválido; botão bloqueado durante o processamento.
- No servidor: autenticação, permissão de venda, travamento das linhas, revalidação de elegibilidade e disponibilidade, recálculo do total no próprio servidor, criação de ordem, itens, parcelas e vendas, mudança para vendido, histórico e confirmação — tudo ou nada.
- Se um espaço deixar de estar disponível durante o fechamento, a venda inteira é cancelada com mensagem nomeando o espaço.
- Duplo clique não cria duas vendas.
- Depois do sucesso: carrinho limpo, mapa atualizado, espaços como vendidos e confirmação curta.

## Etapa 8 — Testes

- Regra: alternar, 1/2/N espaços, remover, limpar, sem duplicar, persistência ao entrar/sair de pavilhão, as duas etapas, troca de etapa, somas com preços diferentes, esquina com comum, pavilhões diferentes, Pavilhão 7, parcelas, CPF, CNPJ, telefone, repetição da mesma venda.
- Elegibilidade: disponível com preço, bloqueio técnico, bloqueio comercial, vendido, sem preço, Pavilhão 7, arquivado, venda ativa.
- Tela: fora do modo abre a ficha; no modo Vendas não abre e adiciona; segundo clique remove; carrinho vazio não abre o fechamento; barra inferior aparece no celular.
- Visual no navegador: 1366×768, 1920×1080 e 360/390/430, em Exporural, Indústria/Comércio/Serviços, Espaço do Automóvel e dentro de dois pavilhões, comparando a arquitetura com o mapa normal.

## Detalhes técnicos

- Liberação via migração transacional filtrada por `commercial_sale_eligibility.is_sellable`, com inserção em `lot_status_history`; a camada de elegibilidade continua existindo e sendo revalidada no servidor.
- Preset visual `salesPresentationActive`; `reducedGraphics` nunca é acionado pelo modo Vendas; piso de qualidade estrutural aplicado sobre `renderQualityTier`/`adaptiveQualityRuntime`.
- Interação por `sales/salesInteraction.ts` (`toggleLot`), sem depender de `selectedEntityId`; consumo do clique em `CommercialMapCanvas` e `CommercialPavilionModuleLayer`.
- Cálculo item a item em `sales/salesPricing.ts`; venda por `register_commercial_sale_order` (atômica, idempotente, total recalculado no servidor).
- Invariantes: áreas oficiais, preços, regras 2028, esquinas, geometrias, identificadores e numeração intocados; Pavilhão 7 sem preço; sem publicação.

## Entrega

Relatório com: quantos estavam bloqueados, quantos foram liberados, quantos seguem bloqueados e por quê, confirmação dos 171 do Pavilhão 7, arquivos alterados, migrações, testes executados, comparação do pavilhão normal × Vendas, testes em celular e pendências reais.
