# Orientação cartográfica do Mapa Comercial

## Objetivo
Tornar ruas, quadras externas e os três segmentos reconhecíveis no mapa sem recolorir lotes, alterar geometrias ou transformar lotes em etiquetas permanentes. A seleção contextual, as quatro situações comerciais e o acesso por comissão/link público permanecem intactos.

## Diagnóstico confirmado
- A cena comum renderiza identificação contextual por seleção/hover; a camada SVG de ruas e quadras hoje é montada somente quando existe uma política de link público. O mapa interno e o mapa das comissões passam pelo mesmo canvas com dados e limites de interação próprios.
- O menu “Segmentos e legenda” efetivo está em `CommercialMapDock`; `SegmentLegend` existe, mas não está montado nesse fluxo. No celular, o dock é uma folha inferior expansível. Os vínculos cadastrais dos segmentos já são resolvidos por `buildCommercialMapSegmentIndex`, inclusive exclusões e herança de entidades.
- Já há união geométrica de membros declarados no mini mapa do dashboard; ela será avaliada como referência, não copiada como contorno sem conferir interferências com ruas, vazios e edificações.

## Etapas
1. **Diagnóstico espacial e visual.** Conferir na base carregada quais ruas/quadras têm nome oficial, polígono e âncora confiáveis; conferir as versões efetivamente desenhadas de vias ajustadas e os limites das quadras. Inventariar lacunas/ambiguidades e verificar a montagem do canvas, obstruções, modos especiais e permissões em cada uma das três comissões e nos links públicos.
2. **Hierarquia visual.** Definir uma família discreta de linhas neutras (padrões distintos e ícones correspondentes) e etiquetas compactas: segmentos e vias principais na visão geral; quadras e ruas na aproximação; lote selecionado sempre prioritário. Usar o nome completo de ICS em legenda/detalhes acessíveis, abreviação ou duas linhas no mapa. Não tocar no preenchimento/status dos lotes.
3. **Implementação modular.** Preparar candidatos a partir das entidades autorizadas e do índice cadastral já existente; excluir módulos internos e casos ambíguos. Traçar apenas limites comprovados de quadras/agrupamentos, respeitando recuos e vazios; quando o contorno completo não for fiel, mostrar só trechos/quadras verificáveis, nunca uma envoltória inventada. Reaproveitar uma única camada SVG inerte para projeção e etiquetas, com âncoras dentro da geometria, trechos de rua realmente apresentados, texto legível após rotação, deduplicação, dimensões medidas ou em cache, colisão com painéis/seleção, densidade progressiva e histerese. Atualizar projeções sob demanda sem alterar DPR, câmera, raycasting ou cores comerciais. Integrar padrões e ícones ao dock real, preservando foco/limpeza e expansão mobile.
4. **Validação.** Ampliar os quatro conjuntos de testes indicados e acrescentar casos de âncora válida, nomes oficiais, exclusões, colisão, histerese, modos especiais e escopo público/comissões. Conferir as verificações de tipos, compilação e testes focais; comparar capturas do mesmo enquadramento antes/depois em desktop e celular, com visão geral, superior/inclinada, rotação, pan, zoom, noite, filtros e painel aberto/fechado. Verificar seleção dos lotes e ausência de regressão perceptível na movimentação; declarar explicitamente qualquer cena ou dado que não puder ser validado.

## Limites técnicos
Nenhuma mudança em banco, migrações, vendas, preços, rotas ou geometrias cadastrais. Links públicos e comissões só receberão orientação derivada de dados já autorizados; jamais o inventário comercial de outro segmento. Sem publicação de produção.

## Entrega
Resumo dos arquivos modificados, resultados dos testes, capturas comparáveis e eventuais nomes ou limites cadastrais cuja confiabilidade impeça exibição.
