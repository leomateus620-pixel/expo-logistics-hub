# Atualizar a logo do login Agenda FENASOJA

## Objetivo
Substituir somente no login `/login/cronograma-eventos` o símbolo antigo circular pela logo oficial atual da Fenasoja, já utilizada nas áreas mais recentes do sistema.

## Alteração visual
- Usar a marca oficial colorida existente em `public/alvorada/fenasoja-symbol-official.png`.
- Manter a composição clean aprovada: logo centralizada acima de “Agenda FENASOJA”, formulário compacto e fundo navy.
- Ajustar o tamanho e o respiro da nova marca para preservar proporção, nitidez e alinhamento em celular e computador.
- Não alterar textos, autenticação, redirecionamento, campos ou comportamento do acesso.
- Não modificar a logo dos outros módulos.

## Implementação
- Em `src/components/auth/CronogramaLoginHero.tsx`, informar explicitamente a logo atual no `FenasojaBrand`, evitando a imagem antiga padrão.
- Em `src/styles/login-experience.css`, adequar somente as dimensões da marca no contexto `cronograma-eventos`, sem afetar os demais logins.
- Atualizar o teste do login para confirmar que a imagem atual é usada e que os elementos removidos anteriormente continuam ausentes.

## Validação
- Executar os testes focados do login e da recuperação da rota.
- Conferir visualmente `/login/cronograma-eventos` em celular e computador, verificando logo, alinhamento, ausência de cortes e contraste.
- Não publicar em produção.
