
## Diagnóstico
Encontrei a causa real do problema: os links não estão mais caindo no login. A rota pública já abre corretamente no site publicado.

O erro agora é outro:
- o formulário público carrega em `/f/mobilidade/:token`
- mas a chamada para `resolve-public-link` volta `404 Link não encontrado`
- isso acontece porque o token copiado já foi invalidado

### O que está acontecendo
Hoje o fluxo de “Copiar” e principalmente “Copiar Todos” depende de regenerar tokens novos. Isso invalida os links anteriores de todas as comissões.

Em outras palavras:
- cada vez que você usa “Copiar Todos”, os 29 links mudam
- qualquer lista enviada antes para as comissões deixa de funcionar
- por isso parece que “todos os links estão errados”

Também vi um problema estrutural no código:
- `MobilityLinksPanel.tsx` monta URLs fixas com `https://fenasojalog.lovable.app`
- o site publicado responde em `https://fenasojalog.com`
- isso pode confundir distribuição e validação, mesmo quando a rota existe

## Correção proposta

### 1. Parar de invalidar links ao copiar
Alterar a lógica para que:
- “Copiar” copie o link atual salvo
- “Copiar Todos” copie os 29 links atuais salvos
- regeneração fique separada em uma ação explícita como “Gerar novo link”

### 2. Persistir o token bruto atual no backend
Hoje só o hash fica salvo, então depois não dá para reconstruir o link sem regenerar.
Precisaremos:
- adicionar um campo seguro para guardar o token atual
- manter o `token_hash` para validação pública
- usar o token salvo apenas no painel interno para cópia

Assim os links passam a ser estáveis até alguém clicar manualmente em regenerar.

### 3. Corrigir a base de URL
Trocar o domínio hardcoded por uma origem confiável, para os links serem gerados corretamente no domínio público atual.

### 4. Ajustar a UI do painel
No painel de links:
- “Copiar” = copia o link atual
- “Copiar Todos” = copia todas as comissões com os links atuais
- “Gerar novo link” = rotaciona apenas aquela comissão
- opcionalmente “Regenerar todos” como ação separada e com confirmação

### 5. Recuperar os 29 links válidos
Depois da correção:
- gerar uma nova rodada única de links válidos
- copiar a lista final das 29 comissões
- usar essa lista como versão oficial para envio

## Arquivos / camadas a alterar
- `src/components/mobility/MobilityLinksPanel.tsx`
- `src/hooks/usePublicFormLinks.ts`
- migração no backend para persistir token atual
- possivelmente `resolve-public-link` / `submit-public-form` apenas se precisarem de ajuste complementar

## Resultado esperado
Após a implementação:
- os 29 links deixam de “quebrar” ao copiar
- cada comissão mantém seu link funcional
- o botão “Copiar Todos” passa a copiar a lista correta sem invalidar nada
- somente ações explícitas de regeneração mudam o link de uma comissão

## Detalhe técnico
O comportamento atual é instável por design:
- o banco guarda apenas `token_hash`
- o frontend não consegue copiar links antigos após refresh
- por isso ele foi implementado regenerando tokens no momento da cópia
- essa estratégia torna qualquer link previamente distribuído inválido

A correção correta é persistir o token atual de forma protegida no backend e separar “copiar” de “regenerar”.
