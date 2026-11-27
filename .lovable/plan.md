# Homologação isolada — Parque de Diversões Stallonne

## Resposta e situação verificada

- Projeto atual: **Fenasoja Log**. A listagem nativa mostra somente o projeto principal, sem drafts abertos neste momento.
- Repositório e branch de entrega informados pelo usuário: `leomateus620-pixel/expo-logistics-hub`, `codex/parque-stallonne`. A revisão final da branch, a PR e seus arquivos não foram verificados nesta etapa. A inspeção local não comprova a configuração atual do Git sync no provedor.
- O preview comum não é homologação isolada: neste projeto, preview e aplicação publicada compartilham o backend principal.
- **Mecanismo nativo disponível:** draft do mesmo projeto com **banco de teste próprio**, separado dos dados live. A ferramenta de criação informa qual banco foi atribuído e a listagem de drafts identifica banco de teste próprio ou banco live. Se a preparação do banco de teste falhar, o draft pode usar o live; portanto, criar um draft, sozinho, não garante isolamento.
- **Limitação:** não há fluxo documentado para selecionar uma branch Git existente e carregá-la diretamente em um draft. Draft e branch Git não são equivalentes. Atualizar o draft traz a versão principal, não uma branch arbitrária. Trocar a branch sincronizada do projeto principal não será usado como atalho de homologação.

## Roteiro proposto — somente após autorização específica

### 1. Fixar a entrega do Codex

Obter PR, SHA final e relação dos arquivos alterados de `codex/parque-stallonne`, incluindo migrations e dependências. Revisar os arquivos sem acessar o banco. A homologação deve testar esse SHA, não uma branch móvel.

Não mesclar a PR nem trocar a branch sincronizada do projeto principal para preparar o teste.

### 2. Criar e comprovar o isolamento no próprio projeto

Criar um draft nativo, sem instrução que inicie implantação ou gravações automaticamente. Conferir o resultado da criação e `drafts.list`: deve constar **banco de teste próprio**, nunca banco live. Confirmar também na interface o aviso de dados de exemplo do preview do draft.

Se houver fallback para live, resultado ambíguo ou ausência da confirmação: **parar antes de aplicar arquivos, executar SQL ou testar gravações**. Não substituir isolamento por uma organização sintética no banco de produção.

Secrets e serviços conectados podem continuar usando valores live mesmo com banco isolado. Antes dos testes, revisar referências nos arquivos a URLs fixas, serviços externos, envio de mensagens, Storage e funções. O isolamento de rotinas agendadas não está comprovado pela documentação consultada. Qualquer chamada que possa alcançar produção bloqueia os testes até existir configuração de teste autorizada e comprovada.

### 3. Levar o mesmo código ao draft

Como não há importação nativa documentada de branch para draft, propor uma transferência controlada **dos arquivos da revisão fixada**, realizada exclusivamente na conversa/workspace do draft, após autorização.

Comparar os arquivos de aplicação e migrations com o SHA aprovado, preservando as configurações e os arquivos de conexão gerados pelo Lovable para o ambiente de teste. Não copiar `.env`, credenciais, metadados Git nem conexões de produção. Registrar explicitamente as diferenças de ambiente; não declarar o workspace inteiro idêntico à branch quando essas diferenças forem necessárias.

Essa transferência é uma alternativa por arquivos, não um recurso nativo de seleção de branch. Sua viabilidade e fidelidade ainda precisam ser verificadas no draft. Se não for possível manter o código da entrega com conexão exclusivamente de teste, interromper a homologação.

### 4. Aplicar somente migrations versionadas no banco de teste

No chat do **draft confirmado como isolado**, usar o mecanismo oficial `lov_database--migration`. Não executar a implantação a partir desta conversa do projeto principal.

Para cada arquivo já versionado em `supabase/migrations/`:

1. Ler seu conteúdo e conferir SHA-256 contra a entrega fixada.
2. Após autorização para consultar o ambiente de teste, verificar quais versões já estão aplicadas e as dependências necessárias.
3. Aplicar apenas os arquivos pendentes aprovados, na ordem de dependência, passando o conteúdo **byte a byte**, sem reescrever, reformatar, concatenar ou gerar SQL substituto. Conteúdo diferente pode ser registrado como outra migration.
4. Conferir resultado e histórico no banco de teste e registrar arquivo, versão, hash e resultado.

Git sync não aplica migrations automaticamente. A ferramenta oficial aplica SQL diretamente, sem uma aprovação adicional por chamada: a confirmação de ambiente e a autorização devem anteceder sua execução. Não presumir que uma migration dependente de registros comerciais reais funcionará em uma cópia de estrutura sem esses registros; usar dados sintéticos autorizados ou interromper para definir a preparação de teste.

### 5. Homologar e conciliar separadamente

Executar os fluxos autenticados previstos na entrega com contas e dados exclusivamente de teste. Verificar permissões, cadastro, venda/contrato, valores, vínculos privados, leitura posterior e histórico conforme o escopo real da PR. Registrar evidências e os testes não executados.

O **registro comercial em produção** permanece condicionado a duas etapas separadas: homologação aprovada e conciliação autenticada específica. Dados, contas e arquivos do draft não serão promovidos como registros comerciais reais.

Não aceitar o draft automaticamente: o aceite pode aplicar alterações de estrutura e implantar funções no backend live imediatamente, mesmo sem publicar o frontend. Exigir autorização coordenada e revisão das diferenças antes de qualquer aceite ou implantação em produção.

## Limites desta etapa

Foi realizada somente consulta de documentação, listagem de metadados dos drafts e inspeção de metadados/nomes de arquivos locais. Nenhuma consulta ao banco, migration, criação de draft, alteração de código/configuração/integração/permissão ou publicação foi executada. O único arquivo criado é este registro de plano.

A aprovação deste roteiro não deve ser interpretada como autorização para gravar em produção. Permanecem pendentes: SHA final e arquivos do Codex, autorização para criar o draft, comprovação de banco próprio e revisão de serviços/rotinas que possam atingir produção.

## Referências

- [Drafts — isolamento, serviços conectados e efeitos do aceite](https://docs.lovable.dev/features/drafts)
- [Git sync — uma branch sincronizada por projeto](https://docs.lovable.dev/integrations/git-sync-overview)
- Procedimento interno oficial do Lovable Cloud: migrations versionadas aplicadas por `lov_database--migration`, com conteúdo idêntico ao arquivo.