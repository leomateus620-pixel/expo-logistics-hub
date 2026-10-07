import { ArrowRight, BarChart3, FileChartColumn, Handshake, LockKeyhole, Scale, TrendingUp, WalletCards } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import type { FinancialViewPath } from '../types';
import { Financial2028Panel, Financial2028State } from './Financial2028Presentation';

const availableReports: Array<{ view: FinancialViewPath; title: string; description: string; question: string; Icon: typeof BarChart3 }> = [
  { view: 'dashboard', title: 'Posição financeira da edição', description: 'Orçamento, compromissos e caixa em uma visão consolidada.', question: 'Como planejamento, execução e liquidação se relacionam?', Icon: BarChart3 },
  { view: 'receitas-projetadas', title: 'Composição das receitas', description: 'Receitas manuais, origem dos recursos e expectativas do recorte carregado.', question: 'Quais entradas estão sendo acompanhadas?', Icon: TrendingUp },
  { view: 'receitas-confirmadas', title: 'Compromissos confirmados', description: 'Valores confirmados e vencimentos, preservando sua distinção de recebimento.', question: 'O que já foi confirmado comercialmente?', Icon: WalletCards },
  { view: 'orcamento-comissoes', title: 'Orçamento por comissão', description: 'Tetos, linhas de planejamento, responsáveis e justificativas.', question: 'Como o planejado se compara ao teto definido?', Icon: Scale },
  { view: 'patrocinios', title: 'Carteira de patrocínios', description: 'Categoria, negociação e composição livre / Rouanet do recorte carregado.', question: 'Qual é a posição dos recursos da carteira?', Icon: Handshake },
];

export function ReportsView() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('edicao', '2028');
  return <div className="f28-stack">
    <div className="f28-report-intro"><FileChartColumn aria-hidden="true" /><p>Consultas da operação 2028<span>Abra a análise disponível mantendo a edição selecionada.</span></p><strong>5 consultas disponíveis</strong></div>
    <section className="f28-report-grid" aria-label="Catálogo de consultas 2028">
      {availableReports.map(({ view, title, description, question, Icon }, index) => <article className="f28-report" key={view}>
        <div className="f28-report__top"><span>{String(index + 1).padStart(2, '0')}</span><Icon aria-hidden="true" /><span className="f28-availability">Consulta disponível</span></div>
        <h2>{title}</h2><p>{description}</p><div className="f28-report__question"><strong>Pergunta gerencial</strong>{question}</div>
        <Link to={{ pathname: `/comissoes/financeiro-gerencial/${view}`, search: params.toString() }}>Abrir consulta<ArrowRight aria-hidden="true" /></Link>
      </article>)}
    </section>
    <Financial2028Panel title="Recursos pendentes" description="Esses recursos ainda não têm implementação operacional na edição 2028.">
      <ul className="f28-pending-list"><li><LockKeyhole aria-hidden="true" /><div><strong>Exportação PDF e Excel</strong><span>Arquivos gerados ainda indisponíveis.</span></div></li><li><LockKeyhole aria-hidden="true" /><div><strong>Relatórios de auditoria e conciliação</strong><span>Sem consulta ou documento gerado disponível neste menu.</span></div></li></ul>
    </Financial2028Panel>
  </div>;
}

export function PendingView({ view }: { view: 'despesas-previstas' | 'despesas-realizadas' | 'simulacoes' }) {
  const scenarios = view === 'simulacoes';
  const realized = view === 'despesas-realizadas';
  return <div className="f28-stack">
    <Financial2028State tone="locked" title={scenarios ? 'Cenários operacionais ainda indisponíveis' : 'Livro de despesas ainda indisponível'}>
      {scenarios ? 'A edição 2028 ainda não oferece consulta e gravação de cenários. As premissas e os resultados estarão disponíveis quando esse fluxo for implementado.' : `A edição 2028 ainda não oferece cadastro e consulta de despesas neste menu. ${realized ? 'Realização e pagamento são etapas independentes.' : 'Linhas de orçamento representam planejamento e não substituem lançamentos de despesas.'}`}
    </Financial2028State>
    {scenarios ? <section className="f28-scenario-grid" aria-label="Cenários previstos para esta edição">
      {[
        { label: 'Realista', detail: 'Premissas de referência para o planejamento.' },
        { label: 'Otimista', detail: 'Variações favoráveis sobre premissas explícitas.' },
        { label: 'Pessimista', detail: 'Variações desfavoráveis e exposição financeira.' },
      ].map((scenario) => <article className="f28-scenario" key={scenario.label}><span className="f28-availability f28-availability--pending">Indisponível em 2028</span><h2>{scenario.label}</h2><p>{scenario.detail}</p><div>Sem premissas ou resultados operacionais disponíveis.</div></article>)}
    </section> : <Financial2028Panel title={realized ? 'Leitura da execução financeira' : 'Leitura do planejamento de despesas'} description="As etapas mantêm significados distintos ao longo da operação.">
      <ol className="f28-stage-guide">
        <li data-active={!realized}><span>01</span><div><h3>Prevista</h3><p>Estimativa do compromisso, vinculada à comissão e ao planejamento quando o cadastro estiver disponível.</p></div></li>
        <li data-active={realized}><span>02</span><div><h3>Realizada</h3><p>Compromisso existente que participa da execução do orçamento, mesmo sem pagamento.</p></div></li>
        <li><span>03</span><div><h3>Paga</h3><p>Liquidação por movimento registrado. O saldo a pagar permanece separado do valor realizado.</p></div></li>
      </ol>
      <p className="f28-note">A consolidação disponível pode ser consultada no Painel Financeiro. Este menu permanece sem lançamentos ou ações de cadastro enquanto o fluxo operacional estiver pendente.</p>
    </Financial2028Panel>}
  </div>;
}
