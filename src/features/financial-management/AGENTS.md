# Financeiro

- Financeiro por edição: 2026 é histórico somente leitura e 2028 é operacional; todas as gravações passam por RPCs `financial_*` transacionais, idempotentes, versionadas e auditadas, com autorização via `financial_can` (admin ou capacidade financeira explícita, nunca `has_capability`), e os totais vêm da agregação no servidor — por quê: não misturar edições, não dar poder financeiro a gestores/operadores por padrão e não depender de paginação.
