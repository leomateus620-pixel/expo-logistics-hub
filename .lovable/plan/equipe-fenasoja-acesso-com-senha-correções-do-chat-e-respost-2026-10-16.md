# Equipe Fenasoja: acesso com senha, correções do chat e respostas mais humanas

## 1. Acesso restrito com senha
- Quem pode usar: administradores da organização, membros ativos do CCPF e membros ativos da Comissão Central. Os demais não veem o botão "Equipe IA" e recebem uma página "acesso restrito" se abrirem o endereço direto.
- Ao abrir a Equipe (botão, atalho Ctrl/Cmd+K ou as páginas `/equipe-ia`), aparece uma tela pedindo a **senha da própria conta**. A senha é conferida no login real, não comparada no navegador.
- Desbloqueio vale por 30 minutos sem uso nesta aba; ao sair da conta ou trocar de usuário, pede de novo.
- A regra também vale no servidor: o serviço dos bots recusa (403) quem não for admin/CCPF/Comissão Central, mesmo que alguém pule a tela.
- Nenhuma permissão nova é concedida; nada muda nos outros módulos.

## 2. "Failed to fetch"
- Causa confirmada: o painel do chat consulta dois serviços auxiliares (ações e rotinas da equipe) que **ainda não estão ativos** no backend — o endereço responde 404, e o navegador mostra o erro cru "Failed to fetch".
- Correção: ativar esses dois serviços já existentes no projeto (sem mudar suas regras) e, enquanto qualquer serviço auxiliar estiver indisponível, esconder o aviso técnico — a conversa continua funcionando e só aparece uma mensagem amigável se o usuário tentar usar ação/rotina.

## 3. Resposta aparecendo acima da pergunta
- Diagnóstico ainda não confirmado. Primeiro passo: reproduzir com uma conta autorizada e comparar a ordem na tela com a ordem gravada no banco (pergunta e resposta podem estar recebendo o mesmo horário, ou a lista sendo recarregada fora de ordem ao terminar a resposta).
- Correção: ordenar sempre pergunta → resposta, com desempate estável, e manter a resposta em andamento logo abaixo da pergunta.

## 4. Respostas curtas, humanas e visuais
Hoje o bot não escreve a resposta: ele copia os registros brutos (datas ISO, "setup start at", "approval status: nao_solicitado"...). Novo formato:
- **Resposta direta em 1–3 frases**, em português natural, respondendo exatamente o que foi perguntado (ex.: "Há 113 eventos; os próximos 3 são…").
- **Blocos visuais quando ajudam**: tabela compacta (até 5–8 linhas, só colunas relevantes), gráfico de barras/pizza para contagens e comparações, cartões de destaque com números-chave, e comparação lado a lado. Animação suave de entrada.
- Datas no formato brasileiro (16/10/2026, 14h), campos internos e códigos técnicos nunca aparecem.
- "Ver detalhes" recolhido para quem quiser mais, e links "Abrir no módulo" no lugar de listas longas.
- Fontes da web filtradas: só resultados relevantes à pergunta (descarta lixo como o "Assistir Futebol Ao Vivo").
- Segurança mantida: os números de tabelas e gráficos vêm somente dos dados verificados; o texto do modelo é conferido e não pode inventar valores.

## Verificação
- Testes: acesso negado a perfil sem CCPF/Comissão Central/admin; senha errada não desbloqueia; ordem pergunta→resposta; formato da resposta sem campos técnicos.
- Conferência na prévia (desktop e celular) com conta autorizada: pedir senha, perguntar sobre a Agenda, ver resposta curta com tabela/gráfico abaixo da pergunta e sem "Failed to fetch".
- Nada de dados de teste, nenhuma publicação do site sem seu pedido.

## Detalhes técnicos
- Gate: novo `WorkersAccessGate` (envolve `WorkersLauncher`, `WorkersRoot` e páginas `/equipe-ia/*`) usando `supabase.auth.signInWithPassword` com o e-mail da sessão para step-up; desbloqueio guardado em `sessionStorage` com user ID + expiração. Elegibilidade via RPC `ai_workers_can_access(_org_id)` (SECURITY DEFINER, STABLE): `org_members.role='admin'` OU vínculo ativo em comissões slug `ccpf` / Comissão Central. Migration incremental nova com GRANT a `authenticated`.
- Servidor: `workers-orchestrator` chama a mesma RPC após `resolveWorkerAccess` e retorna 403; idem nas funções `workers-actions`/`workers-routines`, depois implantadas.
- `useWorkerWorkspace`: tratar `TypeError` de rede/404 como "indisponível" silencioso.
- Ordenação: `order(created_at).order(id)` + inserção otimista estável em `useWorkersChat`.
- Engine: após as ferramentas, uma chamada de síntese com saída estruturada `{ answer, blocks: [{type:'table'|'bar'|'pie'|'stat'|'compare', ...}] }`; blocos montados no servidor a partir de `ReadResult` (valores nunca vindos do modelo); `answer` validado contra números das evidências, com fallback para resumo determinístico curto. Frontend renderiza blocos com Recharts + tabela shadcn e Motion.
- Registro em `AGENTS.md` da regra de acesso e do formato de resposta.
