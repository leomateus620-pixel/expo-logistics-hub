

## Plano

Substituir o PDF da Rede Hoteleira no card de Acessos Rápidos do Dashboard pelo arquivo atualizado enviado.

### Passos
1. Copiar `user-uploads://Rede_Hoteleira_5.pdf` para `public/rede-hoteleira.pdf` (mesmo nome do anterior, sobrescrevendo) — assim o link existente no Dashboard continua funcionando sem mudanças de código.
2. Caso o nome atual do arquivo no `public/` seja diferente, ajustar a referência no `Dashboard.tsx` para apontar para o novo arquivo.

### Verificação
- Localizar a referência atual ao PDF (`grep` por "rede" / "hoteleira" / ".pdf" em `src/pages/Dashboard.tsx`).
- Sobrescrever o PDF no diretório `public/` com o conteúdo enviado.
- Abrir o card "Rede Hoteleira" no Dashboard e confirmar que o PDF atualizado é exibido.

### Arquivos
| Arquivo | Mudança |
|---|---|
| `public/rede-hoteleira.pdf` (ou nome equivalente já usado) | Substituído pelo PDF atualizado |
| `src/pages/Dashboard.tsx` | Apenas se o caminho/nome do arquivo precisar ser ajustado |

