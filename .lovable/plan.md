# Correção visual dos menus do Mapa Comercial

## Diagnóstico confirmado

- O diálogo **Interesse por áreas e lotes** usa `hsl(var(--...))`, mas os tokens atuais do projeto são definidos em **OKLCH** em `src/styles/tokens.css`. Essas declarações ficam inválidas, fazendo fundos, bordas e parte da tipografia desaparecerem sobre o mapa escurecido.
- O problema não é exclusivo do mobile: a mesma folha é aplicada no desktop. No celular, ele fica mais evidente porque o diálogo ocupa quase toda a tela e a lista longa aparece diretamente sobre o mapa.
- O contêiner compartilhado de diálogos em `src/components/ui/dialog.tsx` já usa os tokens corretos. Os outros fluxos internos principais — disponibilidade, edição estrutural, workflow comercial e checkout — herdam essa base e não repetem a causa.
- O mesmo padrão inválido foi encontrado em:
  - `src/features/commercial-map/public/public-interest.css` — diálogo afetado;
  - `src/features/commercial-map/public/public-map.css` — consulta externa, ficha e avisos;
  - `src/features/commercial-map/components/panels/lot-pricing-2028.css` — bloco de preços dentro dos detalhes;
  - `src/features/commercial-map/history/history.css` — fundo do visualizador de imagens.

## Implementação

1. **Restaurar a superfície do diálogo de interesse**
   - Aplicar fundo sólido/forte, cor de texto, borda e sombra com tokens OKLCH válidos.
   - Separar cabeçalho e conteúdo rolável para manter título, descrição e fechamento legíveis.
   - Respeitar `90dvh`, safe areas e largura útil em 320–430 px, sem cortar ações ou links.

2. **Dar hierarquia e leitura às funções existentes**
   - Organizar carregamento, gráfico, rankings e links em seções visuais claras, preservando toda a lógica atual.
   - Melhorar contraste, tipografia, espaçamento, quebra dos endereços e alinhamento dos controles.
   - No mobile, empilhar ações com alvos de toque adequados; no desktop, manter composição compacta e escaneável.
   - Não alterar geração, ativação, cópia de chaves, consultas, permissões ou métricas.

3. **Corrigir ocorrências equivalentes no Mapa Comercial**
   - Migrar somente as declarações incompatíveis de HSL para OKLCH nos quatro arquivos auditados.
   - Preservar os componentes compartilhados, a identidade atual e os demais estilos que já funcionam.
   - Confirmar que popover Gestão, diálogos comerciais, ficha pública, preços e visualizador possuem fundo e contraste reais.

4. **Validação**
   - Testar a abertura do menu Gestão e do diálogo em mobile (393×706 e 320 px) e desktop (1280 px).
   - Conferir rolagem até o décimo link, cabeçalho/fechar, switches, Gerar chave e Copiar, inclusive estados desabilitados e carregando.
   - Verificar visualmente os outros pontos corrigidos e checar ausência de sobreposição ou transparência indevida.
   - Rodar os testes focados do Mapa Comercial e a validação TypeScript; não publicar.

## Limites

- Nenhuma alteração em banco, tokens/chaves, links públicos, regras de preço, dados comerciais ou permissões.
- Nenhuma publicação em produção.
