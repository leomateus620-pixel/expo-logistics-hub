# Acesso total da Débora Leticia Bamberg (exceto Financeiro)

## Situação atual (verificada)
- Perfil **leitura** na Fenasoja, sem papel de administrador.
- Já tem o Mapa Comercial completo e a Agenda apenas para visualização.
- O perfil leitura bloqueia a edição nos demais menus.

## Acesso final
- **Ver e editar** todos os menus: Logística (transportes, frota, carrinhos, patinetes, escala, equipe), Cronograma e Eventos/Agenda (criar, editar, excluir), Eventos Restaurante e Arena (acesso total), Mobilidade, Mapa Comercial completo, portais Exporural e Indústria/Comércio/Serviços e todas as comissões.
- **Sem acesso:** Financeiro Gerencial.
- Ela continua **sem papel de administrador**: não gerencia usuários nem permissões administrativas.
- É a mesma configuração já aplicada ao Roque Lugoch.

## O que será feito
1. Alterar o perfil dela de leitura para gestor e acrescentar as permissões dos menus, sem incluir a permissão financeira.
2. Testar entrando como Débora: menus completos com botões de edição e Financeiro bloqueado.

Senha e demais dados não serão alterados. Nada será publicado. Ela precisará sair e entrar novamente para ver o novo acesso.

## Detalhes técnicos
- Usuário `d251d7d6-389f-42f3-afef-8b94db02a47b`, org `985888b8-155f-4bbe-b6b9-6bef2893d99b`.
- `org_members.role` = `gestor` (as regras de escrita exigem admin/gestor/operador).
- Upsert idempotente em `user_capabilities`: `full_access`, `logistica_access`, `mobility_access`, `cronograma_eventos_access`, `cronograma_reminder_all`, `exporural_access`, `industria_comercio_servicos_access`, `arte_cultura_access`, `gastronomia_access`, `infraestrutura_access`, `novas_geracoes_access`, `seguranca_access`, `servicos_access`, `venue_events_access`, `venue_events_full_access`; mantém as permissões `map.*` atuais.
- Não conceder `financial_access` nem `admin_access`; `useModuleAccess` já restringe o Financeiro a essas permissões ou ao papel admin.
- `user_roles` continua apenas `user`.
