# Design QA — Bots Fenasoja, Fases 2/3

**final result: pass** · 16/10/2026.

Alvo: referências de conversa/home Salte fornecidas por Leonardo, continuidade da UI Fenasoja já entregue e tokens existentes. Não é uma cópia pixel a pixel: o conteúdo clínico e envio de WhatsApp das referências foram substituídos por operação interna da feira, com confirmação explícita e fontes.

Fonte e implementação foram abertos e colocados no mesmo [quadro de comparação](captures/design-comparison.png). A referência original tem moldura/status bar de celular e textos diferentes; a implementação foi capturada em viewport web 390×844, com identidade/dados sintéticos identificados. A comparação avalia hierarquia e padrão de interação, não equivalência de conteúdo ou moldura.

## Iterações e correções verificadas

| Achado | Correção | Evidência posterior |
|---|---|---|
| Tabela de uso com rolagem sem foco de teclado | Região nomeada e `tabIndex` | `*-usage-unknown.png`; auditorias axe sem violações |
| Fechar do sheet com baixo contraste no dark e alvo 36px | Cores locais `worker-paper`/`worker-ink`, alvo 44px, sem alterar Sheet global | `1280x800-dark-routines.png`, folhas de memória e formulário |
| Escape fechava formulário sem devolver foco | `onCloseAutoFocus` para o botão de origem e fallback composer | Fluxo explícito Escape/foco aprovado e teste unitário |
| Aviso da proposta dividia validade numa coluna estreita | Ícone + bloco único de texto/validade | Adendo com oito recapturas de proposta/execução, quatro combinações de viewport/tema |

As capturas posteriores foram inspecionadas. A hierarquia do card mantém alvo, diff e confirmação claros; formulário privado fica separado do composer; o histórico distingue horário agendado e executado; chips têm alvos próprios e fontes separadas. A marca/navy/indigo, mascotes e fundo preservam a continuidade da Fenasoja. Nenhum P0/P1/P2 visual remanescente foi identificado nas telas observadas.

[Rodada completa](visual-workspace-qa-results.json): **55 capturas, 55 auditorias axe sem violações, 55 verificações de overflow aprovadas, 10 fluxos aprovados**. O 503 usado para testar reconciliação após timeout é intencional e está identificado, sem erro inesperado. [Adendo final de rotinas](visual-workspace-routine-qa-results.json): **oito capturas, oito auditorias axe e oito verificações de overflow aprovadas** após a última correção.

[Telas existentes](existing-pages-qa.json): 16 pares sem sessão, mesmo layout e texto; 12 binariamente idênticos e quatro com diferença máxima de 1/255 em 12 pixels da borda do ícone de voltar. A comparação não cobre telas autenticadas de negócio. Os testes de performance/mascotes da Fase 1 não foram repetidos como benchmark físico nesta fase; não houve alteração no pacote de animação.
