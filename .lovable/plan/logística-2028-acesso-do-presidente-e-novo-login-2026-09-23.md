# Logística 2028, acesso do presidente e novo login

## Objetivo
Organizar a Comissão de Logística em dois ciclos independentes, mantendo os mesmos menus: **2028 como padrão e inicialmente vazio**, e **2026 preservado integralmente e acessível em Configurações**. Corrigir o acesso do presidente Eduardo e substituir o login genérico pela direção visual institucional escolhida.

## Situação confirmada
- O cadastro de Eduardo Santos existe, está confirmado e ativo como presidente principal de **Logística, Hotelaria e Turismo**.
- A conta ainda usa outro e-mail; o endereço solicitado ainda não está cadastrado.
- Eduardo já possui vínculo ativo e permissão administrativa na organização, mas não tem uma capability explícita de Logística.
- O módulo possui um único conjunto de menus e rotas. Seus dados operacionais são hoje separados apenas por organização; as tabelas ainda não possuem ciclo 2026/2028.
- O login `/login/logistica` usa a apresentação genérica compartilhada, com cards de capacidades e linha temporal.

## Implementação

### 1. Corrigir o acesso de Eduardo com segurança
- Atualizar a conta existente de Eduardo para o novo e-mail informado e definir a nova senha pelo fluxo administrativo seguro, sem registrar ou exibir a senha no código, banco, logs ou resposta.
- Manter o mesmo usuário, perfil, vínculo de presidente, histórico e IDs.
- Manter o papel administrativo atual e adicionar `logistica_access` explicitamente para que o acesso da presidência não dependa apenas do papel global.
- Confirmar que não foi criado usuário duplicado e que o e-mail está confirmado.

### 2. Criar os modos 2026 e 2028 sem duplicar menus
- Adicionar `cycle_year` com valores permitidos `2026` e `2028` aos dados operacionais da Logística e seus registros dependentes.
- Marcar todos os registros existentes como **2026**, preservando conteúdo, IDs, relações, auditoria e histórico.
- Definir **2028** como ciclo padrão para novos registros; ele começará vazio, conforme escolhido.
- Criar índices por organização e ciclo para manter as consultas rápidas.
- Manter uma única navegação e as mesmas páginas; a troca de ciclo altera somente a base operacional exibida e gravada.

### 3. Aplicar o ciclo em toda a operação
- Criar um contexto único da Logística com `2028 | 2026`, padrão 2028, persistido por usuário no navegador.
- Aplicar o ciclo às leituras, contadores e gravações de Transportes, Veículos, Carrinhos, Patinetes, Hóspedes, Agenda, Escalas, Checklist, Despesas, Abastecimentos, quilometragem e respectivos históricos/vínculos.
- Propagar o ciclo também pelos fluxos transacionais, especialmente o ciclo de vida de transportes, reservas, devoluções e documentos, evitando que uma ação em 2028 altere registros de 2026.
- Incluir o ciclo nas chaves de atualização das telas para impedir cache cruzado entre anos.

### 4. Seletor em Configurações
- Adicionar uma seção **Ciclo da Logística** nas Configurações com 2028 e 2026.
- Exibir 2028 como opção principal e sinalizar 2026 como histórico preservado.
- Ao trocar, atualizar imediatamente a navegação inteira e retornar ao Painel Operacional no ciclo escolhido.
- Mostrar o ciclo ativo no cabeçalho e no menu, para evitar lançamentos no ano errado.
- Disponibilizar a troca somente a administradores/gestores da Logística; demais usuários permanecem em 2028.

### 5. Novo login da Logística
Aplicar somente em `/login/logistica` a direção **Modern institutional login** escolhida:
- composição central, compacta e de alta legibilidade;
- marca oficial Fenasoja 2028 e título literal **Comissão de Logística**;
- formulário como único foco, com E-mail, Senha, exibir/ocultar, botão de entrada e voltar ao portal;
- remover cards de capacidades, linha 2026–2028, badges e textos redundantes;
- preservar autenticação, validações, erros, carregamento e redirecionamento;
- não adicionar recuperação de senha ou outros fluxos não existentes;
- adaptar para celular e computador, respeitando redução de movimento.

## Detalhes técnicos
- A migração fará backfill explícito de 2026 antes de tornar o campo obrigatório e usar 2028 como padrão futuro.
- As regras de acesso existentes continuam válidas; o ciclo restringe o conjunto de dados, não substitui as permissões.
- Relacionamentos dependentes herdarão o ciclo do registro principal, com validações para impedir associações entre anos.
- As datas operacionais específicas deixarão de depender de constantes fixas de 2026 e passarão a respeitar o ciclo ativo.
- Não serão duplicados registros, menus, rotas ou organizações.

## Validação
- Confirmar o login de Eduardo com o novo e-mail e a senha fornecida, sem revelar a senha durante o teste.
- Confirmar que Eduardo abre a Logística 2028 e vê os menus completos.
- Confirmar 2028 vazio e criação de um registro isolado do histórico, removendo apenas o registro de teste ao final.
- Trocar para 2026 em Configurações e confirmar que os dados antigos reaparecem intactos.
- Alternar entre os ciclos e validar que contadores, listas, detalhes e gravações não se misturam.
- Conferir o novo login em celular e desktop, incluindo erro, carregamento e sucesso.
- Executar testes focados, verificação de tipos e lint.
- Não publicar em produção.
