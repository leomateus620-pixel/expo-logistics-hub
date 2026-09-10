# Anexos da Agenda FENASOJA — correção no celular e nova experiência de envio

## O problema (confirmado no código)

Ao tocar em "Abrir arquivo" ou "Baixar arquivo", o app primeiro pede ao servidor um link temporário do arquivo e **só depois** manda o celular abrir uma nova aba. Como essa espera acontece entre o toque e a abertura, o navegador do celular entende que a nova aba não foi pedida pela pessoa e a bloqueia silenciosamente — nada acontece. No computador esse bloqueio não existe, por isso lá funciona.

Um segundo agravante: a ação está dentro de um menu de três pontinhos que fecha no momento do toque, o que reforça o bloqueio no iPhone.

## O que será feito

### 1. Abrir e baixar anexos no celular (correção do bug)
- O link temporário do arquivo passa a ser preparado com antecedência (assim que a lista de anexos aparece) e reaproveitado enquanto for válido, para que o toque abra o arquivo imediatamente, sem espera.
- Quando o link ainda não estiver pronto, a abertura acontece dentro do próprio app (visualizador interno para imagens e PDF), sem depender de nova aba.
- O botão "Baixar" passa a usar um link de download real, que o celular reconhece — inclusive com a opção de compartilhar/salvar nativa do aparelho quando disponível.
- Se ainda assim algo falhar, aparece um aviso claro com um link tocável de reserva, em vez do silêncio atual.

### 2. Visualizador de anexos mais completo
- Imagens: visualizador em tela cheia com gesto de fechar, nome do arquivo e botões de baixar/compartilhar.
- PDF e documentos: abertura em tela cheia dentro do app quando o formato permitir; caso contrário, download direto.

### 3. Anexar foto ou arquivo mais simples e elegante
- Ação principal única e grande, com toque confortável no celular: "Anexar".
- Ao tocar, opções claras: **Tirar foto**, **Escolher da galeria**, **Escolher arquivo**.
- Arrastar e soltar continua funcionando no computador.
- Miniatura imediata do arquivo escolhido, com progresso individual por arquivo e possibilidade de cancelar/tentar de novo apenas o que falhou.
- Mensagens de erro em linguagem simples (arquivo grande demais, formato não aceito, sem conexão).
- Lista de anexos redesenhada: cartões com miniatura maior, tipo, tamanho, quem enviou e ações visíveis (abrir, baixar, excluir) sem depender do menu escondido no celular.

### 4. Verificação
- Teste real no tamanho de celular e de computador, abrindo uma imagem e um PDF já anexados, e enviando um arquivo novo.
- Testes automatizados do componente atualizados.

## Detalhes técnicos

- `src/hooks/useEventoAnexos.ts`: passar a gerar URLs assinadas em lote junto da listagem, com cache em memória e revalidação antes do vencimento; expor `getCachedUrl` síncrono e `downloadBlob`.
- `src/components/cronograma-eventos/EventoAnexosSection.tsx`: remover `window.open` pós-`await` (linhas ~422 e ~428); usar âncora com `href` já resolvido e `download`, `navigator.share`/`canShare` quando disponível, e visualizador interno (`Dialog`) para imagem e PDF. Substituir o `DropdownMenu` por ações diretas em telas pequenas.
- Novo seletor de origem do arquivo (câmera / galeria / arquivos) via `Drawer` no mobile e `DropdownMenu` no desktop, mantendo os inputs `capture="environment"` e `accept` atuais.
- `src/styles/cronograma-attachments.css`: ajustes de layout dos cartões, alvos de toque mínimos de 44px e estados de progresso; manter identidade Liquid Glass e tokens existentes.
- `src/test/eventoAnexosSection.test.tsx`: cobrir abertura sem `window.open` assíncrono, download por âncora e o novo seletor de origem.
- Sem mudanças de banco, RLS, bucket ou permissões.
