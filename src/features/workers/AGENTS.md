# Equipe Fenasoja (bots)

- Equipe Fenasoja (bots) só abre para quem `ai_workers_can_access` aprova (admin da organização, CCPF ou Comissão Central) e após reconfirmar a senha da própria conta; o mesmo RPC é exigido no `workers-orchestrator` e nas funções auxiliares — por quê: a tela de senha sozinha não protege dados.
- Respostas dos bots são montadas no servidor a partir das ferramentas: uma frase direta + blocos `fenasoja-table`/`fenasoja-chart` (JSON) renderizados como tabela/gráfico, sem campos técnicos nem datas ISO — por quê: números vêm só de dados verificados e a tela não enche de texto bruto.
