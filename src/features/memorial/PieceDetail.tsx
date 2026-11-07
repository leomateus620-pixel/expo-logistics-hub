import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { X, FileText, ArrowLeft, Accessibility } from 'lucide-react';
import { historicalDocument, historicalEditions, loadTranscription, pieceLabel, type MemorialPiece, type Transcription } from './catalog';
import MemorialViewer from './MemorialViewer';

export default function PieceDetail({ piece, onTimeline, onOpen, hrefFor, entryStyle }: {
  piece: MemorialPiece; onTimeline: () => void; onOpen: (piece: MemorialPiece) => void;
  hrefFor: (piece: MemorialPiece) => string; entryStyle?: CSSProperties;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const [transcript, setTranscript] = useState<Transcription>();
  const [failed, setFailed] = useState(false);
  const [reading, setReading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => { close.current?.focus({ preventScroll: true }); }, [piece.id]);
  useEffect(() => {
    if (piece.kind === 'epilogue') return;
    let active = true;
    setFailed(false);
    loadTranscription(piece).then(result => { if (active) setTranscript(result); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [piece, retry]);
  return <article className="memorial-inspection" role="dialog" aria-modal="true" aria-labelledby="memorial-piece-title" data-memorial-detail-open="true" style={entryStyle}>
    <header className="memorial-inspection__header">
      <h2 id="memorial-piece-title"><strong>{piece.year}</strong><span>{pieceLabel(piece)}</span></h2>
      <div className="memorial-inspection__actions">
        {piece.year === 2022 && <a className="memorial-context-command" href={hrefFor(historicalDocument)} onClick={event => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onOpen(historicalDocument); }}><FileText size={17} /><span>Documento de 2020</span></a>}
        {piece.kind === 'document' && <button type="button" className="memorial-context-command" onClick={() => onOpen(historicalEditions.find(item => item.year === 2022)!)}><ArrowLeft size={17} /><span>Quadro de 2022</span></button>}
        <button type="button" ref={close} onClick={onTimeline} aria-label="Fechar quadro" className="memorial-close"><X size={22} aria-hidden="true" /></button>
      </div>
    </header>
    <MemorialViewer piece={piece} />
    {piece.kind !== 'epilogue' && <>
      <button className="memorial-reading-toggle" type="button" aria-expanded={reading} aria-controls="memorial-inscriptions" onClick={() => setReading(value => !value)}><Accessibility size={16} aria-hidden="true" />{reading ? 'Fechar leitura' : 'Ler inscrições'}</button>
      <section id="memorial-inscriptions" className={reading ? 'memorial-reading' : 'memorial-sr-only'} aria-label={`Inscrições de ${pieceLabel(piece)}`} tabIndex={reading ? 0 : -1}>
        <h3>{pieceLabel(piece)} · {piece.year}</h3>
        {piece.engravedPeriod && <p>{piece.engravedPeriod}</p>}
        {piece.kind === 'document' && <p>Documento da edição prevista para 2020, adiada para 2022. As inscrições originais foram preservadas.</p>}
        {failed ? <p role="status">Não foi possível carregar as inscrições. <button type="button" tabIndex={reading ? 0 : -1} onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></p> : !transcript ? <p role="status">Carregando inscrições…</p> : <>
          {transcript.status !== 'verified' && <p>Transcrição parcial. Trechos sem confirmação estão sinalizados.</p>}
          {transcript.sections.map((section, index) => <section key={index}><h4>{section.title || 'Inscrição'}</h4><dl>{section.lines.map((line, n) => <div key={n}><dt>{line.roleStatus === 'unreadable' ? 'Cargo não confirmado' : line.role || 'Inscrição'}</dt><dd>{line.status === 'unreadable' ? 'Trecho ilegível na fotografia' : line.name}{line.note && <small>{line.note}</small>}</dd></div>)}</dl></section>)}
        </>}
      </section>
    </>}
  </article>;
}
