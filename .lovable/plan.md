# Liberar acesso da Débora: Mapa Comercial completo + Agenda (visualização)

## Situação atual (verificada)
- `debora@fenasoja.com.br` está ativa na Fenasoja com papel **leitura** e **nenhuma permissão específica**.

## Acesso final
- **Mapa Comercial — acesso total:** Exporural, Indústria/Comércio/Serviços e Espaço do Automóvel, com Dashboard, Vendas, preços, reservas, contratos, camadas e edição de lotes/geometrias.
- **Agenda Fenasoja — só visualização:** vê todos os eventos, sem criar, editar ou excluir.
- **Sem acesso:** Financeiro, Logística, frota, outras comissões e área administrativa.
- Ela continua sem papel de administrador; nada é liberado por herança de papel.

## O que será feito
1. Adicionar as permissões do mapa e de visualização da agenda à conta dela (papel "leitura" mantido).
2. Testar entrando como Débora: mapa com Dashboard e Vendas ativos; agenda lista eventos sem botões de edição; Financeiro e Logística bloqueados.

Senha e demais dados não serão alterados. Nada será publicado.

## Detalhes técnicos
- Usuário `d251d7d6-389f-42f3-afef-8b94db02a47b`, org `985888b8-155f-4bbe-b6b9-6bef2893d99b`.
- `user_capabilities` (upsert idempotente): `map.view`, `map.edit`, `map.edit_geometry`, `map.manage_lots`, `map.manage_sales`, `map.manage_contracts`, `map.manage_layers`, `map.admin`, `cronograma_eventos_access`.
- Sem `cronograma_scoped_access` (vê a agenda inteira); escrita na agenda continua bloqueada pelo papel leitura (policy de update exige admin/gestor/operador ou autoria).
- Se algum botão de edição aparecer na agenda para leitura, ajustar o guard de UI para exigir papel de escrita.
