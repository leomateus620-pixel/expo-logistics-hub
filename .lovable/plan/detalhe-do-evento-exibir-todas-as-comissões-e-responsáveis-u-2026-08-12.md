# Detalhe do evento: exibir todas as comissões e responsáveis + upgrade visual

## Diagnóstico confirmado

O cadastro salva corretamente todos os vínculos nas tabelas relacionais (`cronograma_evento_comissoes` e `cronograma_evento_responsaveis`) — por isso o modo de edição (anexo 1) mostra tudo certo. O problema é só de **exibição**: as telas de detalhe leem apenas o vínculo "principal" (campos `event.owner` e `event.commission`, valores únicos) e ignoram as listas completas `commissionsRel` / `responsiblesRel`, que já chegam prontas no modelo do evento.

Consulta ao banco confirma **18 eventos afetados** hoje, entre eles:
- "reunião comissão central" — 35 comissões e 49 responsáveis vinculados (exibe só 1 de cada);
- "REUNIÃO POLÍTICA COMERCIAL" (o evento dos anexos) — 3 comissões e 4 responsáveis;
- "REUNIÃO MICHELE ARMANJE", "REUNIÃO COM ROSA", "Reunião com Anderson e Thais", "REUNIÃO EXPORURAL" e mais 12.

Dois componentes apresentam o problema:
1. `EventDrawer.tsx` — a janela lateral de detalhes (anexos 2, 3 e 4): blocos "Responsável" e "Comissão" mostram valor único.
2. `EventRelationshipWorkspace.tsx` — o card "Evento principal" da tela de subeventos (anexo 1, fora do modo edição): mesma limitação.

## O que será feito

### 1. Exibição completa dos vínculos (correção do bug)
- Criar um componente compartilhado de campo relacional que recebe a lista de vínculos e renderiza **todos**:
  - **Comissões**: cada comissão vinculada como chip/cartão, com selo "Principal" no vínculo primário; fallback para o campo legado quando não houver vínculos relacionais.
  - **Responsáveis**: cada pessoa vinculada, com selo "Principal", distinção visual entre membro do sistema e responsável externo (ícone próprio), e fallback para o legado.
- Aplicar no `EventDrawer` (substituindo os `InfoBlock` únicos de Responsável/Comissão) e no card "Evento principal" do `EventRelationshipWorkspace`.
- Nenhuma mudança de persistência: o salvamento via RPC já está correto; é só leitura/exibição. Cadastros futuros passam a exibir tudo automaticamente.

### 2. Upgrade visual do drawer de detalhes (anexos 3 e 4)
- **Remover a faixa colorida da lateral esquerda** (`EventIdentityStrip` no cabeçalho do drawer) e substituir por um destaque clean e premium: filete dourado fino no topo do cabeçalho + chip de categoria com placa de vidro, sem barra vermelha/colorida na borda.
- **Campos de informação reformulados**: saem as linhas simples com divisor e entram cartões de vidro (liquid glass) em grade 2 colunas, cada um com:
  - ícone em placa quadrada com gradiente da marca (navy/dourado), label em eyebrow tipográfico e valor em tipografia mais forte;
  - campos de Comissões/Responsáveis ocupam largura total quando houver mais de um vínculo, com lista empilhada organizada (ícone + nome + selo Principal), evocando a "linha de vínculo" já usada no formulário.
- Hierarquia tipográfica refinada no título/resumo e espaçamentos ajustados; tudo via tokens sem cores fixas, mantendo dark mode e o padrão visual do módulo.

### 3. Arquivos tocados
- `src/components/cronograma-eventos/EventDrawer.tsx` — novo bloco de vínculos múltiplos + remoção da faixa lateral + novos cartões de informação.
- `src/components/cronograma-eventos/workspace/EventRelationshipWorkspace.tsx` — meta do card "Evento principal" passa a listar todos os vínculos.
- Novo componente pequeno `EventRelationFields.tsx` (em `src/components/cronograma-eventos/`) compartilhado pelos dois.
- `src/index.css` — estilos dos novos cartões/chips e do cabeçalho sem a faixa lateral.

## Validação
- Typecheck limpo.
- Via Playwright com sessão autenticada: abrir "REUNIÃO POLÍTICA COMERCIAL" e conferir que o drawer exibe as 3 comissões e os 4 responsáveis (com Principal marcado); abrir o workspace de subeventos e conferir o mesmo no card principal; abrir um evento com vínculo único e um legado sem vínculos para garantir os fallbacks; capturar screenshots do novo visual.
