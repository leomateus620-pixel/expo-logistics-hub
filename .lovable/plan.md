# Prévia correta dos links públicos do Mapa Comercial

## Resultado esperado
- Ao compartilhar um link `mapafenasoja.com/areas/...`, a prévia mostrará **Mapa Comercial Fenasoja 2028 — [nome do pavilhão ou área]**, uma descrição da área e uma imagem que represente **aquela área**, não a tela do sistema de gestão.
- Cada pavilhão e segmento com link público terá sua própria prévia. A navegação do mapa continua sem login, com o mesmo endereço, token e escopo autorizado.
- Links inválidos, revogados ou desativados não exibirão informações particulares da área em sua prévia.

## Implementação
1. Preparar imagens de compartilhamento horizontais e legíveis para cada área do registro público, usando capturas da planta/mapa correspondente e conferindo visualmente enquadramento, identidade e ausência de dados privados; não reutilizar a captura genérica do sistema. Imagens sem pessoas, contratos, compradores ou tokens.
2. Adicionar título, descrição, endereço canônico e imagem Open Graph/Twitter específicos na página pública; apresentar metadados somente depois da validação do link, com estado neutro para links inválidos. Manter os metadados gerais nas páginas internas.
3. Confirmar como a hospedagem entrega o HTML aos aplicativos de mensagens. Se a pré-renderização de páginas públicas capturar os metadados atualizados, usá-la; se não capturar, adotar uma resposta HTML específica para compartilhamento que preserve os links existentes e a validação, sem depender apenas de JavaScript no navegador. Não alterar DNS ou estabelecer redirecionamento que abra o sistema administrativo.
4. Testar cada slug do registro, inclusive pavilhões e segmentos, no HTML recebido por robôs de prévia e na navegação normal; verificar links válidos, inválidos e revogados, mobile/desktop, título/imagem corretos e ausência de vazamentos. Comparar a prévia antes/depois, considerando que WhatsApp e outras plataformas podem manter cache antigo.

## Cuidados técnicos
- A página hoje entrega no HTML inicial `Fenasoja 2028 | Gestão Operacional` e a imagem genérica inserida pela hospedagem; apenas mudar o título visível no navegador não corrige a prévia de compartilhamento.
- Reutilizar o registro canônico de áreas e a validação existente do token; não publicar inventário, preços, pedidos ou dados pessoais nas imagens/metadados.
- Não publicar produção automaticamente; conferir o resultado no domínio real após autorização explícita para publicação.
