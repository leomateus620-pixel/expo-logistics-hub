# Fenasoja Meeting — ícone limpo e tipografia mais precisa

Refino visual sóbrio do cabeçalho da Inteligência de Reunião. Sem enfeites, sem gradientes extras, sem novos elementos gráficos.

## Ícone

Redesenhar a marca (`MeetingIntelligenceMark`) mantendo o conceito grão + microfone, porém mais legível em tamanho pequeno:

- Traço único e uniforme (1,5px), cantos arredondados, sem veio decorativo interno do grão.
- Cápsula do microfone centralizada e proporcional, base e haste simplificadas.
- Duas linhas laterais curtas de captação apenas quando o estado é "gravando"; nos demais estados o ícone fica estático e neutro.
- Contêiner (`__mark-shell`) reduzido de 48px para 40px, borda 1px, fundo sólido suave — sem sombra nem brilho.

## Textos

- Sobrelinha: "Ata inteligente" (em vez de "Inteligência de reunião", que repete o contexto).
- Título: "Fenasoja Meeting".
- Uma linha de apoio curta e objetiva no lugar da descrição removida: "Transcrição e ata do evento" (some quando a sessão está em captura, para não competir com o status).
- Estado indisponível: "Disponível apenas para eventos já salvos." (mantido, uma linha).

## Tipografia

- Sobrelinha: 9,5px, peso 700, letter-spacing 0,16em, cor secundária (menos peso visual que hoje).
- Título: 17px desktop / 15,5px mobile, peso 700 (hoje 900), tracking -0,015em — menos "gordo", mais editorial.
- Linha de apoio: 12px, peso 500, cor muted.
- Ritmo vertical padronizado em 2px/3px entre as três linhas; alinhamento óptico do ícone com o bloco de texto.

## Detalhes técnicos

- Arquivos alterados: `MeetingIntelligenceMark.tsx`, `AgendaMeetingWorkspace.tsx` (apenas strings e classes do cabeçalho), `src/styles/agenda-meeting-intelligence.css`.
- Nenhuma mudança em captura, transcrição, finalização, histórico ou backend.
