# Responsável automático no cadastro de evento do cronograma

## Objetivo
No formulário "Novo evento do cronograma", o campo "Responsável (fallback)" passa a se chamar apenas "Responsável" e é preenchido automaticamente com o nome do usuário logado, ficando fixo (somente leitura).

## Comportamento
- Ao abrir o formulário para um novo evento, o campo Responsável já vem preenchido com o nome do usuário que está cadastrando.
- O campo fica fixo (não editável), com indicação visual de campo bloqueado e uma legenda curta: "Preenchido automaticamente com o usuário logado".
- Em eventos já existentes, o valor salvo é preservado e continua exibido (sem sobrescrever o responsável original).
- Além do texto, o usuário logado é adicionado automaticamente como responsável principal nos vínculos relacionais quando o novo evento ainda não tem nenhum responsável marcado — mantendo consistência com o registro relacional.
- O texto "(fallback)" é removido do rótulo e o placeholder legado também sai.

## Detalhes técnicos
- Arquivo: `src/components/cronograma-eventos/EventForm.tsx`.
- Nome do usuário: `useAuth()` (id/e-mail do usuário) cruzado com `useOrgMembers()` para obter `nome_exibicao` do membro da organização; fallback para `user_metadata.full_name` e, por último, o e-mail.
- Efeito de inicialização: apenas quando `event` é nulo (novo evento) e `form.owner` está vazio, define `owner` com o nome resolvido; também injeta o responsável principal em `responsiblesRel` se a lista estiver vazia, usando `userId` real do usuário.
- Input passa a ter `readOnly` + estilo desabilitado; o valor continua sendo enviado no submit normalmente.
