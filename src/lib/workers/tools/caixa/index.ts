import { limit } from '../../schema.ts';
import { tool, input, financial } from '../definition.ts';

export const caixaTools = [
  tool('financial_editions','caixa','Edições financeiras','Lista edições autorizadas para selecionar o resumo. Nenhuma ação financeira disponível.',input({ limit: limit() }),'financial','/comissoes/financeiro-gerencial',['financial_editions']),
  tool('financial_edition_summary','caixa','Resumo financeiro agregado','Consulta somente totais calculados da edição, em centavos.',financial(),'financial','/comissoes/financeiro-gerencial',['financial_editions','financial_edition_summary']),
  tool('financial_budget_execution','caixa','Orçamento × execução','Consulta agregados por orçamento e linha, em centavos.',financial(),'financial','/comissoes/financeiro-gerencial',['financial_editions','financial_budget_execution']),
  tool('financial_expense_comparison','caixa','Comparação de despesas','Consulta totais e agregados por categoria/comissão, sem despesas individuais.',financial(),'financial','/comissoes/financeiro-gerencial',['financial_editions','financial_expense_comparison']),
];
