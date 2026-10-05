# Seleção clara do local na Agenda Fenasoja

## Resultado
O campo **Local** mostrará os quatro locais oficiais como opções legíveis e fáceis de tocar, sem depender do menu pouco previsível do navegador. **Outro local** continuará permitindo escrever um endereço ou espaço diferente. A escolha do Centro de Eventos continuará acionando o aviso sobre a agenda do Restaurante quando houver data.

## Diagnóstico confirmado
- O formulário `EventForm` apresenta `Input` com `datalist` nativo contendo quatro opções (`cronograma-location-options.ts`). A aparência e a abertura dessa lista dependem do navegador; não há indicação visual clara de que existem quatro escolhas.
- O evento guarda tanto o texto do local quanto `locationCode`; ao salvar, o código é derivado do nome oficial exato. O aviso do Restaurante lê o código; não deve ser ativado por descrições aproximadas ou locais personalizados.
- O formulário móvel usa `MobileDialogFrame`, com corpo rolável e adaptação ao teclado. A prévia atual não expõe o formulário sem autenticação; a conferência visual do menu dependerá de uma sessão autorizada.

## Mudança proposta
1. Substituir apenas o controle `Input + datalist` de **Local** por um seletor compacto dentro da seção de data/local: botão de escolha com nome selecionado e lista explícita dos quatro locais, cada linha inteira clicável (alvo de toque de pelo menos 44 px), marcação de selecionado e opção **Outro local**. Os nomes longos devem quebrar linha, não ser truncados. Preferir componente de seleção acessível já usado no projeto, com abertura/fechamento e foco por teclado; no celular a lista deve caber e rolar dentro da área disponível, sem ficar escondida sob o teclado ou rodapé do formulário.
2. Ao tocar uma opção oficial, preencher em conjunto `location` (rótulo atual) e `locationCode` (código estável), usando o catálogo existente. Em **Outro local**, mostrar campo de texto com 16 px no mobile e manter `locationCode=null`; ao editar evento com texto personalizado ou nome histórico, apresentar **Outro local** já preenchido, sem reclassificar ou apagar seu valor. Permitir trocar entre oficial e personalizado sem confirmação extra; o local pode permanecer vazio como hoje.
3. Manter o envio do nome oficial e do código pelo caminho atual, sem mudar migrações, permissões, alertas, integração Google Agenda ou lembretes. Preservar a regra de correspondência exata do catálogo para evitar que um texto livre ambíguo ative o alerta indevidamente.

## Arquivos e verificação
- Alterar `src/components/cronograma-eventos/EventForm.tsx`; criar um pequeno controle local reutilizável próximo ao formulário se a lógica de foco/estado justificar. Reusar `src/lib/cronograma-location-options.ts`, `Button` e os componentes de seleção existentes. Estilo pontual nos estilos da Agenda apenas se necessário; não alterar CSS global.
- Testar: quatro opções legíveis e selecionáveis; código/nome gravados corretamente; alternância para **Outro local**; edição de local histórico; campo vazio; aviso do Centro de Eventos só para escolha oficial; navegação por teclado, Escape e foco; desktop e larguras móveis com teclado/rolagem. Conferir que os dados enviados continuam compatíveis com os fluxos existentes.

## Limites
Sem alterações no Mapa Comercial, pavilhões, vendas, permissões ou dados existentes. Sem publicar. Este é um plano para aprovação; nenhum código foi alterado nesta rodada.
