# Novo login clean da Agenda FENASOJA

## Objetivo
Substituir exclusivamente o login de `/login/cronograma-eventos` por uma composição central, limpa e institucional, removendo o grande grão dourado e os elementos que hoje atrasam o acesso no celular. Os demais logins permanecem inalterados.

## Direção escolhida
- Paleta navy e dourado: `#031834`, `#121D85`, `#F9C121` e `#F5E6CD`, aplicada pelos tokens visuais existentes.
- Tipografia sólida institucional: Archivo Black nos destaques e Hind nos textos, carregadas localmente no projeto.
- Composição central em uma única coluna, com leitura rápida e todo o conteúdo essencial visível na primeira tela do celular.
- Movimento discreto de entrada, respeitando a preferência de redução de movimento.

## Composição
1. Fundo navy profundo, limpo, com textura de grade quase imperceptível e sem imagens decorativas grandes.
2. Cabeçalho central com a logo oficial colorida da FENASOJA, usando o arquivo oficial já existente e proporções adequadas.
3. Título literal **Agenda FENASOJA**:
   - “Agenda” como sobrelinha curta em dourado;
   - “FENASOJA” com o mesmo peso, caixa alta e acabamento visual usados atualmente no wordmark institucional FENASOJA;
   - alinhamento óptico entre símbolo, nome e formulário.
4. Um único painel compacto de credenciais contendo somente:
   - título “Entrar”;
   - campos E-mail e Senha, incluindo exibir/ocultar senha;
   - mensagens atuais de validação e erro;
   - botão “Entrar no sistema”;
   - link “Voltar ao portal”.

## Limpeza visual
Remover deste login:
- o grão dourado gigante e sua imagem;
- “Planejamento da Fenasoja 2028”;
- a linha “Ciclo estratégico” com 2026, 2027 e 2028;
- o badge “Módulo selecionado”;
- “Identificação segura”;
- o texto explicativo redundante sobre credenciais;
- o bloco “Acesso restrito / solicite suas credenciais”.

Não serão adicionados links ou textos inexistentes, como cadastro, solicitação de acesso, recuperação de senha, versão ou rodapé promocional.

## Responsividade e acessibilidade
- No celular, logo, título e formulário cabem de forma equilibrada em aproximadamente 393×706 px, respeitando as áreas seguras.
- No desktop, o conjunto permanece centralizado, com largura contida e sem grandes vazios ou divisão em duas colunas.
- Manter rótulos visíveis, foco por teclado, contraste, mensagens acessíveis e alvos de toque adequados.

## Implementação técnica
- Simplificar `CronogramaLoginHero.tsx` para conter somente a apresentação oficial “Agenda FENASOJA”, reutilizando `FenasojaBrand` e o asset oficial.
- Em `LoginPage.tsx`, aplicar condicionais apenas ao login da Agenda FENASOJA para ocultar os blocos redundantes, sem alterar autenticação, redirecionamento, validações ou outros módulos.
- Substituir o bloco específico de `cronograma-eventos` em `login-experience.css` pela composição central escolhida e remover estilos que ficarem órfãos do grão e da linha temporal.
- Atualizar os testes do login para a nova estrutura e confirmar que o redirecionamento continua em `/cronograma-eventos`.

## Validação
- Testar estados normal, erro, carregamento e sucesso.
- Conferir visualmente em celular 393×706 e desktop 1280×900, garantindo ausência de cortes, sobreposição e rolagem desnecessária.
- Executar os testes focados no login e a verificação de tipos.
- Não publicar em produção.
