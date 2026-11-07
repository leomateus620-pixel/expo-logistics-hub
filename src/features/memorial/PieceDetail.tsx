import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, FileImage, Maximize2, Minimize2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlvoradaErrorBoundary } from '@/features/alvorada/AlvoradaErrorBoundary';
import { faceUrl, rectifiedUrl, historicalDocument, historicalEditions, epilogue, loadTranscription, originalUrl, pieceLabel, type MemorialPiece, type Transcription } from './catalog';

const MemorialViewer = lazy(() => import('./MemorialViewer'));

function Transcript({ transcript, compact = false }: { transcript: Transcription; compact?: boolean }) {
  const sections = compact ? transcript.sections.slice(0,1) : transcript.sections;
  return <div className="memorial-transcript">
    <p className="memorial-editorial-state">{transcript.status === 'verified' ? 'Seções transcritas e conferidas com a fotografia.' : 'Transcrição parcial conferida. Os trechos sem confirmação estão sinalizados.'}</p>
    {sections.map((section,index) => <section key={`${section.title}-${index}`} aria-label={section.title || 'Inscrição de rodapé'}>
      {section.title && <h3>{section.title}</h3>}
      <dl>{(compact ? section.lines.slice(0,5) : section.lines).map((line,lineIndex) => <div key={lineIndex} data-editorial-status={line.status}>
        <dt>{line.role || (!section.title ? 'Inscrição de rodapé' : section.title.startsWith('Crédito') ? 'Crédito inscrito' : 'Cargo compartilhado')}</dt>
        <dd>{line.status === 'unreadable' ? 'Trecho ilegível na fotografia' : line.name}{line.note && <small>{line.note}</small>}</dd>
      </div>)}</dl>
    </section>)}
  </div>;
}

function OriginalPhoto({ piece }: { piece: MemorialPiece }) {
  const [fullSize,setFullSize] = useState(false);
  const [failed,setFailed] = useState(false);
  return <figure className="memorial-original">
    <div className="memorial-original__toolbar">
      <button type="button" onClick={() => setFullSize(value => !value)} aria-pressed={fullSize}>{fullSize ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}{fullSize ? 'Ajustar à tela' : 'Tamanho original'}</button>
      <a href={originalUrl(piece)} target="_blank" rel="noreferrer">Abrir JPEG original <ArrowUpRight size={15} aria-hidden="true" /></a>
    </div>
    <div className="memorial-original__pan" tabIndex={fullSize ? 0 : -1} role="group" aria-label={fullSize ? 'Fotografia no tamanho original. Role para consultar os detalhes.' : 'Fotografia ajustada à tela'} data-full-size={fullSize || undefined}>
      {failed ? <p role="status">A fotografia não pôde ser carregada. <button type="button" onClick={() => setFailed(false)}>Tentar novamente</button></p> : <img src={originalUrl(piece)} alt={`Fotografia de origem de ${pieceLabel(piece)}, ${piece.year}. Inclui o enquadramento original e eventuais reflexos ou cortes.`} width={1152} height={1536} onError={() => setFailed(true)} />}
    </div>
    <figcaption>{piece.sourceFile} · JPEG preservado, 1152 × 1536 px. O tamanho original permite consultar as inscrições sem ampliação artificial.</figcaption>
  </figure>;
}

export default function PieceDetail({ piece, onTimeline, onOpen, hrefFor, onHome }: {
  piece: MemorialPiece;
  onTimeline: () => void;
  onOpen: (piece: MemorialPiece) => void;
  hrefFor: (piece: MemorialPiece) => string;
  onHome: () => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  const [tab,setTab] = useState('3d');
  const [transcript,setTranscript] = useState<Transcription>();
  const [transcriptError,setTranscriptError] = useState(false);
  const [retry,setRetry] = useState(0);
  const isEpilogue = piece.kind === 'epilogue';
  const parentYear = piece.kind === 'document' ? 2022 : piece.year;
  const index = historicalEditions.findIndex(item => item.year === parentYear);
  const previous = isEpilogue ? historicalEditions.at(-1) : historicalEditions[index-1];
  const next = isEpilogue ? undefined : historicalEditions[index+1] ?? epilogue;
  useEffect(() => { back.current?.focus({ preventScroll: true }); }, [piece.id]);
  useEffect(() => {
    if (isEpilogue) return;
    let active = true;
    setTranscript(undefined); setTranscriptError(false);
    loadTranscription(piece).then(result => { if (active) setTranscript(result); }).catch(() => { if (active) setTranscriptError(true); });
    return () => { active = false; };
  }, [piece, isEpilogue, retry]);
  const transcriptionContent = transcript ? <Transcript transcript={transcript} />
    : transcriptError ? <p role="status">A transcrição desta peça não pôde ser aberta. <button type="button" onClick={() => setRetry(value => value+1)}>Tentar novamente</button></p>
      : <p role="status">Abrindo as inscrições conferidas…</p>;
  return <article className="memorial-detail" aria-labelledby="memorial-piece-title" data-memorial-detail-open="true">
    <header className="memorial-detail__header">
      <button ref={back} type="button" className="memorial-back" onClick={onTimeline}><ArrowLeft size={17} aria-hidden="true" /> Voltar à linha do tempo</button>
      <button type="button" className="memorial-home-link" onClick={onHome}>Voltar ao Ecossistema</button>
    </header>
    <div className="memorial-detail__title"><span className="memorial-eyebrow">{isEpilogue ? 'EPÍLOGO' : piece.kind === 'document' ? 'DOCUMENTO ASSOCIADO À 23ª EDIÇÃO' : 'MEMORIAL DO VOLUNTARIADO'}</span><h2 id="memorial-piece-title"><span>{piece.year}</span> {pieceLabel(piece)}</h2>
      {piece.engravedPeriod && <p>Período gravado: {piece.engravedPeriod}</p>}
      {piece.kind === 'document' && <p>Placa da edição prevista para 2020, adiada para 2022. As datas e inscrições deste documento foram preservadas.</p>}
      {isEpilogue && <p>O próximo capítulo está sendo preparado.</p>}
    </div>
    <Tabs value={tab} onValueChange={setTab} className="memorial-detail__tabs">
      <TabsList aria-label="Consultar a peça" className="memorial-tabs-list">
        <TabsTrigger value="3d">Quadro 3D</TabsTrigger>
        {!isEpilogue && <><TabsTrigger value="transcription">Transcrição</TabsTrigger><TabsTrigger value="photo">Foto original</TabsTrigger></>}
      </TabsList>
      <div className={`memorial-detail__body${tab === '3d' ? ' memorial-detail__body--inspection' : ''}`}>
        <div className="memorial-detail__primary">
          <TabsContent value="3d">
            <AlvoradaErrorBoundary key={piece.id} onError={() => undefined} fallback={<div className="memorial-3d-error"><img src={faceUrl(piece)} alt={`Vista frontal de ${pieceLabel(piece)}`} /><p>O visualizador não pôde ser aberto. Consulte a fotografia e a transcrição.</p></div>}>
              <Suspense fallback={<div className="memorial-3d-error"><img src={faceUrl(piece)} alt={`Vista frontal de ${pieceLabel(piece)}`} /><p role="status">Preparando o visualizador…</p></div>}><MemorialViewer piece={piece} /></Suspense>
            </AlvoradaErrorBoundary>
          </TabsContent>
          {!isEpilogue && <><TabsContent value="transcription">{transcriptionContent}</TabsContent><TabsContent value="photo"><OriginalPhoto piece={piece} /></TabsContent></>}
        </div>
        <aside className="memorial-piece-record" aria-label="Ficha de acervo">
          <span className="memorial-eyebrow">{isEpilogue ? 'UM NOVO ENCONTRO' : 'AS PESSOAS E O SEU TEMPO'}</span>
          <h3>{isEpilogue ? 'A história continua.' : 'Uma homenagem que permanece.'}</h3>
          <p>{isEpilogue ? 'FENASOJA 2028 · LOADING… integra a exposição como apresentação do próximo capítulo.' : piece.visual}</p>
          {piece.year === 2022 && <a className="memorial-document-link" href={hrefFor(historicalDocument)} onClick={event => {
            if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); onOpen(historicalDocument);
          }}><FileImage size={22} aria-hidden="true" /><span><strong>Placa histórica de 2020</strong><small>Conheça o documento da edição adiada</small></span><ArrowUpRight size={17} aria-hidden="true" /></a>}
          {piece.kind === 'document' && <button type="button" className="memorial-document-link" onClick={() => onOpen(historicalEditions.find(item => item.year === 2022)!)}>Voltar ao quadro de 2022</button>}
          {tab === '3d' && transcript && <><Transcript transcript={transcript} compact /><button type="button" className="memorial-text-link" onClick={() => setTab('transcription')}>Ler todas as inscrições disponíveis <ArrowRight size={16} aria-hidden="true" /></button></>}
          {!isEpilogue && <details className="memorial-provenance"><summary>Origem e notas do acervo</summary>
            <p>Fonte: {piece.sourceFile}</p>
            <p>Face limpa recomposta a partir das inscrições conferidas e dos recortes originais de marcas e cartazes. A fotografia e sua cópia retificada preservam a fonte.</p>
            <ul>{piece.notes.map(note => <li key={note}>{note}</li>)}</ul>
            {transcript && <><h4>Notas da conferência</h4><ul>{transcript.notes.map(note => <li key={note}>{note}</li>)}</ul></>}
            <p>Espessura, verso, relevo e escolha tipográfica da recomposição são aproximações visuais para inspeção, sem medição física. Marcas e cartazes conservam os pixels fornecidos.</p>
            <a href={faceUrl(piece)} target="_blank" rel="noreferrer">Ver face recomposta em alta resolução <ArrowUpRight size={14} aria-hidden="true" /></a>
            <a href={rectifiedUrl(piece)} target="_blank" rel="noreferrer">Consultar fotografia retificada <ArrowUpRight size={14} aria-hidden="true" /></a>
            {piece.context && <div className="memorial-context"><h4>Contexto histórico</h4><p>{piece.context.text}</p><p>{piece.context.decision}</p>{piece.context.sources.map(source => <a href={source.url} key={source.url} target="_blank" rel="noreferrer">{source.title} <ArrowUpRight size={14} aria-hidden="true" /></a>)}</div>}
          </details>}
        </aside>
      </div>
    </Tabs>
    <nav className="memorial-detail__navigation" aria-label="Navegar entre as edições">
      {previous ? <a href={hrefFor(previous)} onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.button) { event.preventDefault(); onOpen(previous); } }}><ArrowLeft size={16} aria-hidden="true" /><span>Edição anterior<strong>{previous.year} / {pieceLabel(previous)}</strong></span></a> : <span />}
      {next ? <a href={hrefFor(next)} onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.button) { event.preventDefault(); onOpen(next); } }}><span>{next.kind === 'epilogue' ? 'O próximo capítulo' : 'Próxima edição'}<strong>{next.year} / {pieceLabel(next)}</strong></span><ArrowRight size={16} aria-hidden="true" /></a> : <button type="button" onClick={onTimeline}>Voltar à linha do tempo <ArrowRight size={16} aria-hidden="true" /></button>}
    </nav>
  </article>;
}
