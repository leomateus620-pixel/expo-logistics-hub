import { Fragment, type ReactNode } from 'react';

import type {
  AgendaMeetingMinutesVersion,
  AgendaMeetingReportInsight,
  AgendaMeetingStructuredReport,
} from '@/features/agenda-meeting-intelligence/types';

import { formatClock, formatDateTime } from './meetingCopy';

const PROPOSAL_STATUS: Record<string, string> = { em_discussao: 'em discussão', nao_aprovada: 'não aprovada', adiada: 'adiada' };

export function modelLabel(model: string) {
  if (model === 'native-local-structuring') return 'estruturação automática local (registro anterior, sem IA generativa)';
  if (model.startsWith('gpt-6.1-sol')) return 'GPT-6.1 Sol';
  return model;
}

/** Inline renderer for **bold** only; everything else is plain text (no HTML from the model). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <Fragment key={index}>{part.replace(/\\([\\`*_[\]#>|])/g, '$1')}</Fragment>);
}

/** Sanitised Markdown subset for legacy minutes: headings, lists, quotes and paragraphs. */
export function SafeMarkdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`l${blocks.length}`}>{list.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>);
    list = [];
  };
  for (const raw of source.replace(/<[^>]*>/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const Tag = (`h${heading[1].length}`) as 'h1' | 'h2' | 'h3';
      blocks.push(<Tag key={`h${blocks.length}`}>{inline(heading[2])}</Tag>);
    } else if (/^[-*]\s+/.test(line)) list.push(line.replace(/^[-*]\s+/, ''));
    else if (line.startsWith('>')) { flush(); blocks.push(<blockquote key={`q${blocks.length}`}>{inline(line.replace(/^>\s*/, ''))}</blockquote>); }
    else { flush(); blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>); }
  }
  flush();
  return <div className="agenda-meeting__markdown">{blocks}</div>;
}

interface EvidenceProps {
  ids: string[];
  starts: Map<string, number>;
  onOpenEvidence: (segmentId: string) => void;
}

function Evidence({ ids, starts, onOpenEvidence }: EvidenceProps) {
  const first = ids.map((id) => ({ id, start: starts.get(id) })).filter((item) => item.start !== undefined)
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))[0];
  if (!first) return null;
  return (
    <button className="agenda-meeting__evidence-link" onClick={() => onOpenEvidence(first.id)} type="button">
      trecho {formatClock(first.start ?? 0)}
    </button>
  );
}

function InsightList({ items, empty, evidence }: { items: AgendaMeetingReportInsight[]; empty: string; evidence: Omit<EvidenceProps, 'ids'> }) {
  if (!items.length) return <p className="agenda-meeting__session-meta">{empty}</p>;
  return (
    <ul className="agenda-meeting__report-list">
      {items.map((item, index) => (
        <li key={`${item.title}-${index}`}>
          <strong>{item.title}</strong>
          {item.detail}
          <Evidence ids={item.evidenceSegmentIds} {...evidence} />
        </li>
      ))}
    </ul>
  );
}

interface MeetingReportViewProps {
  minutes: AgendaMeetingMinutesVersion;
  eventTitle: string;
  meetingDate: string | null;
  transcriptVersionNumber: number | null;
  outdated: boolean;
  evidenceStarts: Map<string, number>;
  onOpenEvidence: (segmentId: string) => void;
}

export function MeetingReportView({ minutes, eventTitle, meetingDate, transcriptVersionNumber, outdated, evidenceStarts, onOpenEvidence }: MeetingReportViewProps) {
  const report: AgendaMeetingStructuredReport | null = minutes.reportFormat === 'structured_v3' && minutes.report ? minutes.report : null;
  const partial = minutes.isPartial || minutes.coverage === 'with_gaps';
  const evidence = { starts: evidenceStarts, onOpenEvidence };
  return (
    <article className="agenda-meeting__report" aria-label="Relatório da reunião">
      <header className="agenda-meeting__report-header">
        <p>FENASOJA · RELATÓRIO DE REUNIÃO</p>
        <h4>{eventTitle}</h4>
        <p>
          {formatDateTime(meetingDate)} · versão {minutes.version} · transcrição v{transcriptVersionNumber ?? '–'} · {modelLabel(minutes.model)}
        </p>
        <div className="agenda-meeting__report-badges">
          <span className="agenda-meeting__badge" data-tone={minutes.state === 'reviewed' ? 'ok' : undefined}>
            {minutes.state === 'reviewed' ? 'Revisado' : minutes.state === 'superseded' ? 'Substituído' : 'Rascunho · revisão humana pendente'}
          </span>
          {partial && <span className="agenda-meeting__badge" data-tone="partial">Parcial · transcrição com lacunas</span>}
          {outdated && <span className="agenda-meeting__badge">Desatualizado · há transcrição mais nova</span>}
        </div>
      </header>

      {!report ? (
        <>
          <div className="agenda-meeting__summary-callout">{minutes.executiveSummary}</div>
          <SafeMarkdown source={minutes.minutesMarkdown} />
        </>
      ) : (
        <>
          <div className="agenda-meeting__summary-callout">{report.executiveSummary}</div>

          <section className="agenda-meeting__report-section">
            <h5>Principais temas e discussões</h5>
            {report.themes.length ? (
              <ul className="agenda-meeting__report-list">
                {report.themes.map((theme, index) => (
                  <li key={`${theme.title}-${index}`}>
                    <strong>{theme.title}<Evidence ids={theme.evidenceSegmentIds} {...evidence} /></strong>
                    {theme.discussion}
                    {theme.arguments.length > 0 && <ul>{theme.arguments.map((item, i) => <li key={i}>Argumento: {item}</li>)}</ul>}
                    {theme.divergences.length > 0 && <ul>{theme.divergences.map((item, i) => <li key={i}>Divergência: {item}</li>)}</ul>}
                  </li>
                ))}
              </ul>
            ) : <p className="agenda-meeting__session-meta">Não definido</p>}
          </section>

          <section className="agenda-meeting__report-section">
            <h5>Decisões confirmadas</h5>
            <InsightList empty="Nenhuma decisão confirmada na transcrição." evidence={evidence} items={report.decisions} />
          </section>

          <section className="agenda-meeting__report-section">
            <h5>Propostas e possibilidades</h5>
            <InsightList
              empty="Nenhuma proposta pendente registrada."
              evidence={evidence}
              items={report.proposals.map((item) => ({ ...item, title: `${item.title} (${PROPOSAL_STATUS[item.status] ?? item.status})` }))}
            />
          </section>

          <section className="agenda-meeting__report-section">
            <h5>Encaminhamentos</h5>
            {report.actionItems.length ? (
              <div className="agenda-meeting__table-wrap">
                <table className="agenda-meeting__table">
                  <thead>
                    <tr><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Origem</th></tr>
                  </thead>
                  <tbody>
                    {report.actionItems.map((item, index) => (
                      <tr key={`${item.title}-${index}`}>
                        <td><strong>{item.title}</strong><br />{item.description}</td>
                        <td>{item.responsibleText ?? 'Não definido'}</td>
                        <td>
                          {item.dueDate ? item.dueDate.split('-').reverse().join('/') : item.dueDateText ?? 'Não definido'}
                          {item.dueDate && item.dueDateText ? <><br /><span className="agenda-meeting__session-meta">“{item.dueDateText}”</span></> : null}
                        </td>
                        <td><Evidence ids={item.evidenceSegmentIds} {...evidence} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="agenda-meeting__session-meta">Nenhum encaminhamento explícito na transcrição.</p>}
          </section>

          <section className="agenda-meeting__report-section">
            <h5>Pendências, riscos e questões em aberto</h5>
            <InsightList empty="Nenhuma pendência registrada." evidence={evidence} items={report.pendingItems} />
            {report.risks.length > 0 && <InsightList empty="" evidence={evidence} items={report.risks.map((item) => ({ ...item, title: `Risco: ${item.title}` }))} />}
            {report.openQuestions.length > 0 && <InsightList empty="" evidence={evidence} items={report.openQuestions.map((item) => ({ ...item, title: `Em aberto: ${item.title}` }))} />}
          </section>

          <section className="agenda-meeting__report-section">
            <h5>Próximos passos</h5>
            <InsightList empty="Não definido" evidence={evidence} items={[...report.nextSteps, ...report.nextMeetings]} />
          </section>

          <section className="agenda-meeting__report-section">
            <h5>Cobertura e revisão</h5>
            <ul className="agenda-meeting__report-list">
              <li>
                Transcrição versão {transcriptVersionNumber ?? '–'}: {partial ? `com ${report.coverage?.missingSegmentCount ?? 'algumas'} lacuna(s) — nada foi deduzido sobre os trechos ausentes.` : 'completa.'}
              </li>
              {report.coverageNotes.map((note, index) => <li key={index}>{note}</li>)}
              <li>{minutes.state === 'reviewed' ? 'Revisão humana confirmada.' : 'Revisão humana pendente.'}</li>
            </ul>
          </section>
        </>
      )}
    </article>
  );
}
