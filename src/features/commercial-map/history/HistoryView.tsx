import { lazy, Suspense, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, ExternalLink } from 'lucide-react';
import { getPublishedHistory, HISTORY_SOURCES } from './catalog';
import { HISTORY_IMAGES } from './media';
import { isPublishableHistoryImage, type HistoryImage } from './mediaTypes';
import type { HistoricalDate } from './types';

const ImageViewer = lazy(() => import('./HistoryImageViewer'));
const eventLabels = { construcao: 'Construção', inauguracao: 'Inauguração', reforma: 'Reforma', uso: 'Uso do espaço', homenagem: 'Homenagem' };
const imageLabels = { period: 'Registro de época', recent: 'Registro recente', context: 'Contexto documental' };

function formatHistoryDate(date: HistoricalDate): string {
  if (date.precision === 'year') return date.value;
  const [year, month, day = 1] = date.value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', ...(date.precision === 'day' ? { day: 'numeric' as const } : {}) }).format(new Date(year, month - 1, day));
}

export function HistoryPhoto({ image, full = false, onError }: { image: HistoryImage; full?: boolean; onError: () => void }) {
  return <picture>
    {!full && image.variants.length > 0 && <source type="image/webp" srcSet={image.variants.map((variant) => `${variant.src} ${variant.width}w`).join(', ')} sizes="(max-width: 950px) calc(100vw - 32px), 340px" />}
    <img src={full ? image.fullSrc : image.src} alt={image.alt} width={image.width} height={image.height} decoding="async" onError={onError} />
  </picture>;
}

export default function HistoryView({ historyId }: { historyId: string }) {
  const entry = getPublishedHistory(historyId);
  const images = entry ? HISTORY_IMAGES.filter((image) => entry.imageIds.includes(image.id) && isPublishableHistoryImage(image, entry.id)) : [];
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState(false);
  const photoTrigger = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const active = images[index];
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  const neighbor = index + 1 < images.length ? index + 1 : index - 1;
  if (!entry) return <p role="status">Esta história não está disponível.</p>;
  const changePhoto = (next: number) => setIndex((next + images.length) % images.length);
  const markFailed = () => setFailed((current) => new Set(current).add(active.id));
  return <article className="fenasoja-history-article">
    <h2>{entry.title}</h2>
    {active && <figure className="fenasoja-history-figure"
      onTouchStart={(event) => { const point = event.touches[0]; touch.current = { x: point.clientX, y: point.clientY }; }}
      onTouchEnd={(event) => {
        const point = event.changedTouches[0]; const start = touch.current; touch.current = null;
        if (!start || images.length < 2) return;
        const dx = point.clientX - start.x; const dy = point.clientY - start.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) changePhoto(index + (dx < 0 ? 1 : -1));
      }}
      onKeyDown={(event) => {
        if (images.length < 2 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); changePhoto(index + (event.key === 'ArrowRight' ? 1 : -1));
      }}>
      {failed.has(active.id) ? <p role="status" className="fenasoja-history-photo-error">Fotografia indisponível no momento. A história e suas fontes continuam abaixo.</p>
        : <button ref={photoTrigger} type="button" className="fenasoja-history-photo" aria-label={`Ampliar fotografia: ${active.alt}`} onClick={() => setExpanded(true)}>
          <HistoryPhoto key={active.id} image={active} onError={markFailed} /><span><Expand aria-hidden="true" />Ver fotografia completa</span>
        </button>}
      <figcaption><span className="fenasoja-history-photo-role">{imageLabels[active.role]}</span>{active.caption}
        <span className="fenasoja-history-credit">{active.captureDate ? `Fotografia: ${formatHistoryDate(active.captureDate)}.` : 'Data da fotografia não confirmada.'} {active.publicationDate && `Publicada em ${formatHistoryDate(active.publicationDate)}.`} Crédito: {active.credit || 'autoria não identificada'}{active.collection ? ` · Acervo: ${active.collection}` : ''}.</span>
      </figcaption>
      {images.length > 1 && <div className="fenasoja-history-gallery" aria-label="Galeria de fotografias">
        <div className="fenasoja-history-gallery-controls">
          <button type="button" aria-label="Fotografia anterior" onClick={() => changePhoto(index - 1)}><ChevronLeft aria-hidden="true" /></button>
          <output aria-live="polite" aria-atomic="true">Fotografia {index + 1} de {images.length}</output>
          <button type="button" aria-label="Próxima fotografia" onClick={() => changePhoto(index + 1)}><ChevronRight aria-hidden="true" /></button>
        </div>
        <div className="fenasoja-history-thumbnails">{images.map((image, position) => <button key={image.id} type="button" aria-label={`Ver fotografia ${position + 1}: ${image.alt}`} aria-pressed={position === index} onClick={() => changePhoto(position)}>
          {(position === index || (!saveData && position === neighbor)) && !failedThumbnails.has(image.id)
            ? <img src={image.thumbnailSrc} alt="" width="80" height="56" loading="lazy" decoding="async" onError={() => setFailedThumbnails((current) => new Set(current).add(image.id))} />
            : <span aria-hidden="true">{position + 1}</span>}
          {position === index && <span className="sr-only">Selecionada</span>}
        </button>)}</div>
      </div>}
    </figure>}
    <p className="fenasoja-history-summary">{entry.summary}</p>
    {!!entry.body?.length && <details className="fenasoja-history-details"><summary>Ler mais</summary>{entry.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</details>}
    {!!entry.milestones.length && <section className="fenasoja-history-milestones" aria-label="Marcos deste lugar"><h3>Marcos deste lugar</h3>
      <ol>{entry.milestones.slice(0, 3).map((milestone, position) => <li key={position}><strong>{milestone.date && <time dateTime={milestone.date.value}>{formatHistoryDate(milestone.date)} · </time>}{eventLabels[milestone.eventType]}</strong><p>{milestone.text}</p></li>)}</ol>
      {entry.milestones.length > 3 && <details className="fenasoja-history-details"><summary>Ver outros marcos</summary><ol>{entry.milestones.slice(3).map((milestone, position) => <li key={position}><strong>{milestone.date && `${formatHistoryDate(milestone.date)} · `}{eventLabels[milestone.eventType]}</strong><p>{milestone.text}</p></li>)}</ol></details>}
    </section>}
    <details className="fenasoja-history-details fenasoja-history-sources"><summary>Fontes e créditos</summary>
      <ul>{HISTORY_SOURCES.filter((source) => entry.sourceIds.includes(source.id)).map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ExternalLink aria-hidden="true" /></a><small>{source.publisher}</small></li>)}</ul>
      {images.map((image) => <p key={image.id}><a href={image.sourcePageUrl} target="_blank" rel="noopener noreferrer">Fonte da fotografia: {image.caption}</a><small>{image.credit || 'Autoria pessoal não identificada'}{image.collection && ` · ${image.collection}`}. {image.permission.label}</small></p>)}
    </details>
    {active && expanded && <Suspense fallback={<p role="status">Abrindo fotografia…</p>}><ImageViewer image={active} onClose={() => setExpanded(false)} returnFocus={() => photoTrigger.current?.focus()} /></Suspense>}
  </article>;
}
