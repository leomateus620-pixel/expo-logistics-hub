import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AtSign, BarChart3, Bell, BookOpen, Check, ChevronDown, CircleHelp, CornerDownLeft, Copy, ExternalLink, FileText, History, Loader2, Menu, MessageCircle, MessageSquareText, Mic, Paperclip, Plus, RefreshCw, ShieldCheck, Square, Users, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { WorkerMascot } from '../mascot/WorkerMascot';
import { getWorker, workerCatalog, workerChatLink } from '../workerCatalog';
import { useWorkersChat } from '../useWorkersChat';
import { CatalogWorkerChips, PermissionNote, ProgressSteps, ResultChip, WorkerEmptyState, WorkerLink, WorkerSkeletons } from './WorkerPrimitives';
import { safeSourceUrl, workerStyle } from '../ui-utils';
import WorkerRichContent, { richContentToText } from './WorkerRichContent';
import { WorkerBotMotionToggle, WorkerTeamBrand, WorkerTeamMark } from './WorkerTeamBrand';
import { useWorkerWorkspace } from '../workspace/useWorkerWorkspace';
import { WorkspaceActionCard } from '../workspace/WorkspaceActionCard';
import { RoutineCard, RunDivider, SystemEvent, WorkspacePanels, type WorkspacePanel } from '../workspace/WorkspacePanels';
import { orderWorkerThreadEntries } from '../message-order';
import type { WorkerAttachment, WorkerChatMessage, WorkerContext, WorkerDefinition, WorkerId } from '../types';

interface WorkersChatProps { workerId?: WorkerId; context?: WorkerContext; compact?: boolean; onClose?: () => void }
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type BrowserRecognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };

function MessageBubble({ message, streaming }: { message: WorkerChatMessage; streaming: boolean }) {
  const reducedMotion = useReducedMotion();
  const [copied, setCopied] = useState(false); const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const worker = getWorker(message.workerId) ?? getWorker('agenda')!;
  const hasStructuredSources = /^```fenasoja-response\r?\n/.test(message.content.trimStart());
  if (message.role === 'system') return <div className="worker-system-event"><ShieldCheck size={13} /><span>{message.content}</span></div>;
  const sources = (message.sources ?? []).map(source => ({ ...source, safeUrl: safeSourceUrl(source.url) })).filter(source => source.safeUrl);
  const resultChips = [...(message.chips ?? []), ...sources.filter(source => /^\d+\s/.test(source.title)).map(source => ({ label: source.title.split(' · ')[0], href: source.safeUrl! }))];
  const copy = async () => { try { await navigator.clipboard.writeText(richContentToText(message.content)); setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1600); } catch { setCopied(false); } };
  return <m.article className={`worker-message worker-message--${message.role}`} data-request-id={message.requestId} data-message-id={message.id} aria-label={message.role === 'user' ? 'Sua pergunta' : `Resposta de ${worker.name}`} style={workerStyle(worker)} initial={reducedMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}>
    {message.role === 'assistant' && <div className="worker-message__author"><span className="worker-specialist-dot" /><strong>{worker.name}</strong><span>BOT FENASOJA</span></div>}
    <div className="worker-message__text">{message.role === 'assistant' ? <>{!message.content && streaming ? <span className="worker-response-status" role="status">Consultando as informações…</span> : <WorkerRichContent content={message.content} streaming={streaming} />}</> : message.content}{streaming && <span className="worker-stream-cursor" aria-label="Respondendo" />}</div>
    {resultChips.length > 0 && <div className="worker-message__chips">{resultChips.map(chip => { const href = safeSourceUrl(chip.href); return href ? <ResultChip key={`${chip.label}-${href}`} label={chip.label} href={href} /> : null; })}</div>}
    {sources.length > 0 && !hasStructuredSources && <div className="worker-sources" aria-label="Fontes da resposta"><span>Confira nas fontes</span><div>{sources.map((source, index) => <a href={source.safeUrl!} key={`${source.url}-${index}`} target={source.kind === 'web' ? '_blank' : undefined} rel={source.kind === 'web' ? 'noopener noreferrer' : undefined}><span>{source.kind === 'web' ? <ExternalLink size={13} /> : <ArrowUp size={13} className="worker-record-arrow" />}{source.title}</span>{source.date && <small>{/^\d{4}-\d{2}-\d{2}$/.test(source.date) ? new Date(`${source.date}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : source.date}</small>}</a>)}</div></div>}
    {message.role === 'assistant' && message.content && !streaming && <div className="worker-message__tools"><button type="button" onClick={() => void copy()} aria-label={copied ? 'Resposta copiada' : 'Copiar resposta'}>{copied ? <Check size={15} /> : <Copy size={15} />}<span>{copied ? 'Copiado' : 'Copiar'}</span></button><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</time></div>}
  </m.article>;
}

export function WorkersChat({ workerId, context, compact = false, onClose }: WorkersChatProps) {
  const reducedMotion = useReducedMotion();
  const [justCompleted, setJustCompleted] = useState(false); const [interrupted, setInterrupted] = useState(false); const wasStreaming = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams(); const navigate = useNavigate();
  const { user } = useAuth(); const { myRole } = useCurrentOrg();
  const { messages, conversations, conversationId, isStreaming, progress, error, sendMessage, stop, selectConversation, newConversation, isLoadingHistory, clearError, activeWorkerId, workspaceRevision = 0, hasEarlierMessages = false, loadEarlierMessages } = useWorkersChat({ workerId, context });
  const workspace = useWorkerWorkspace({ conversationId, revision: workspaceRevision, isStreaming });
  const worker = getWorker(conversationId ? activeWorkerId : workerId); const replyingWorker = getWorker(activeWorkerId) ?? worker ?? getWorker('agenda')!;
  const showWelcomeSuggestions = worker && worker.id !== 'mapa' && worker.id !== 'agenda';
  const [draft, setDraft] = useState(() => searchParams.get('prompt') ?? ''); const [attachments, setAttachments] = useState<WorkerAttachment[]>([]);
  const [mentionsOpen, setMentionsOpen] = useState(false); const [mobileNavOpen, setMobileNavOpen] = useState(false); const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>(null);
  const [voiceConsentOpen, setVoiceConsentOpen] = useState(false); const [recording, setRecording] = useState(false); const [composerError, setComposerError] = useState<string | null>(null);
  const [showNewMessages, setShowNewMessages] = useState(false); const listRef = useRef<HTMLDivElement>(null); const textareaRef = useRef<HTMLTextAreaElement>(null); const attachmentRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.max(56, Math.min(144, field.scrollHeight))}px`;
  }, [draft]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const earlierScroll = useRef<{ height: number; top: number } | null>(null); const skipAutoScroll = useRef(false);
  const previousScope = useRef(workspace.scope); const panelTrigger = useRef<HTMLElement | null>(null);
  const nearBottom = useRef(true); const speech = useRef<BrowserRecognition | null>(null); const hasPrompt = useRef(searchParams.get('prompt'));
  const firstName = (String(user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '').trim().split(' ')[0] || 'equipe').slice(0, 40);
  const events = workspace.snapshot.events.filter(event => event.conversationId === conversationId && event.kind !== 'routineRun');
  const routineProposals = workspace.snapshot.routines.filter(routine => routine.conversationId === conversationId && routine.state === 'proposed');
  const needsYou = workspace.pendingActions.length + workspace.snapshot.routines.filter(routine => routine.state === 'proposed').length + workspace.snapshot.alerts.filter(alert => !alert.seenAt && Date.parse(alert.expiresAt) > Date.now()).length;
  const hasConversation = messages.length > 0 || workspace.conversationActions.length > 0 || routineProposals.length > 0 || events.length > 0;
  const openPanel = (panel: Exclude<WorkspacePanel, null>) => { panelTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setWorkspacePanel(panel); };
  const ask = (text: string) => { setDraft(text); setWorkspacePanel(null); requestAnimationFrame(() => textareaRef.current?.focus()); };
  const threadEntries = orderWorkerThreadEntries([
    ...messages.filter(message => !(message.role === 'user' && workspace.snapshot.runs.some(run => run.requestId === message.requestId))).map(message => { const run = message.role === 'assistant' ? workspace.snapshot.runs.find(item => item.requestId === message.requestId) : undefined; return { id: `message-${message.id}`, at: message.createdAt, requestId: message.requestId, role: message.role, sequence: message.sequence, kind: 'message', element: <>{run && <RunDivider run={run} />}<MessageBubble message={message} streaming={isStreaming && message === messages[messages.length - 1] && message.role === 'assistant'} /></> }; }),
    ...workspace.conversationActions.map(action => ({ id: `action-${action.id}`, at: action.createdAt, kind: 'action', element: <WorkspaceActionCard action={action} workspace={workspace} /> })),
    ...routineProposals.map(routine => ({ id: `routine-${routine.id}`, at: routine.createdAt, kind: 'routine', element: <RoutineCard routine={routine} workspace={workspace} /> })),
    ...events.map(event => ({ id: `event-${event.id}`, at: event.createdAt, kind: 'event', element: <SystemEvent event={event} workspace={workspace} /> })),
  ]);
  useEffect(() => { const next = searchParams.get('prompt'); if (next && next !== hasPrompt.current) { setDraft(next); hasPrompt.current = next; textareaRef.current?.focus(); } }, [searchParams]);
  useLayoutEffect(() => { nearBottom.current = true; earlierScroll.current = null; skipAutoScroll.current = false; setInterrupted(false); }, [conversationId]);
  useLayoutEffect(() => {
    const list = listRef.current; const previous = earlierScroll.current;
    if (!list || !previous) return;
    list.scrollTop = previous.top + list.scrollHeight - previous.height;
    earlierScroll.current = null; skipAutoScroll.current = true;
  }, [messages]);
  useEffect(() => {
    if (skipAutoScroll.current) { skipAutoScroll.current = false; return; }
    if (!messages.length) return;
    if (nearBottom.current) { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: isStreaming || reducedMotion ? 'auto' : 'smooth' }); setShowNewMessages(false); }
    else setShowNewMessages(true);
  }, [messages, progress, isStreaming, workspaceRevision, workspace.conversationActions.length, events.length, routineProposals.length, reducedMotion]);
  useEffect(() => () => speech.current?.stop(), []);
  useEffect(() => {
    const completed = wasStreaming.current && !isStreaming && !error && !interrupted;
    wasStreaming.current = isStreaming;
    if (!completed) { setJustCompleted(false); return; }
    setJustCompleted(true);
    const timer = setTimeout(() => setJustCompleted(false), 1200);
    return () => clearTimeout(timer);
  }, [isStreaming, error, interrupted]);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => {
      const element = viewportRef.current;
      if (!element) return;
      const top = Math.max(0, element.getBoundingClientRect().top - viewport.offsetTop);
      element.style.setProperty('--worker-visible-height', `${Math.max(0, viewport.height - top)}px`);
    };
    resize(); viewport.addEventListener('resize', resize); viewport.addEventListener('scroll', resize);
    return () => { viewport.removeEventListener('resize', resize); viewport.removeEventListener('scroll', resize); };
  }, []);
  useEffect(() => { if (previousScope.current !== workspace.scope) setDraft(''); previousScope.current = workspace.scope; setWorkspacePanel(null); setAttachments([]); setComposerError(null); speech.current?.stop(); }, [workspace.scope]);
  useEffect(() => { const view = searchParams.get('view'); if (view === 'routines' || view === 'memory' || view === 'inbox') setWorkspacePanel(view); }, [searchParams]);
  const selectWorker = (selected: WorkerDefinition) => { setMobileNavOpen(false); if (compact) { setDraft(`@${selected.id} `); textareaRef.current?.focus(); } else navigate(workerChatLink(selected.id)); };
  const resetConversation = () => { setInterrupted(false); newConversation(); setDraft(''); setAttachments([]); setMobileNavOpen(false); if (!compact && searchParams.has('prompt')) { searchParams.delete('prompt'); setSearchParams(searchParams, { replace: true }); } };
  const send = async () => { if (!draft.trim() || isStreaming || recording) return; const text = draft.trim(); const files = attachments; setInterrupted(false); setDraft(''); setAttachments([]); setMentionsOpen(false); setComposerError(null); nearBottom.current = true; await sendMessage(text, files); };
  const attach = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) { setComposerError('Nesta fase, você pode anexar somente arquivos .txt ou .md.'); return; }
    if (file.size > 48 * 1024) { setComposerError('Use um arquivo de texto com até 6.000 caracteres.'); return; }
    if (attachments.length >= 3) { setComposerError('Você pode incluir até 3 arquivos por mensagem.'); return; }
    try { const text = await file.text(); if (text.length > 6000 || text.length + attachments.reduce((total, item) => total + item.text.length, 0) > 12000) { setComposerError('Cada arquivo pode ter até 6.000 caracteres; o total deve ficar em até 12.000.'); return; } setAttachments(previous => [...previous, { name: file.name, text, trust: 'untrusted' }]); setComposerError(null); } catch { setComposerError('Não foi possível ler esse arquivo. Tente novamente.'); }
  };
  const startVoice = () => {
    setVoiceConsentOpen(false); const browser = window as unknown as { SpeechRecognition?: new () => BrowserRecognition; webkitSpeechRecognition?: new () => BrowserRecognition }; const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) { setComposerError('A transcrição por voz não está disponível neste navegador. Você pode escrever sua mensagem.'); return; }
    const recognition = new Recognition(); speech.current = recognition; recognition.lang = 'pt-BR'; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = event => { const text = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(' '); setDraft(previous => `${previous}${previous ? ' ' : ''}${text}`); };
    recognition.onerror = () => { setRecording(false); setComposerError('A transcrição foi interrompida. Você pode tentar novamente ou escrever.'); };
    recognition.onend = () => { setRecording(false); speech.current = null; textareaRef.current?.focus(); };
    try { recognition.start(); setRecording(true); } catch { setRecording(false); setComposerError('Não foi possível iniciar o microfone. Confira a permissão do navegador.'); }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } if (event.key === 'Escape') setMentionsOpen(false); };
  const insertMention = (selected: WorkerDefinition) => { setDraft(previous => `${previous.replace(/@\w*$/, '').trim()} @${selected.id} `.trimStart()); setMentionsOpen(false); textareaRef.current?.focus(); };
  const historyNavigation = <><div className="worker-workspace-brand"><WorkerTeamBrand /></div><button type="button" className="worker-new-chat" onClick={resetConversation}><Plus size={17} /> Nova conversa <span>↗</span></button><nav className="worker-workspace-nav" aria-label="BOT FENASOJA"><WorkerLink to="/equipe-ia/conheca"><Users size={17} /> Conheça a equipe</WorkerLink><button type="button" onClick={() => { openPanel('routines'); setMobileNavOpen(false); }}><History size={17} /> Rotinas <span>{workspace.snapshot.routines.filter(routine => routine.state === 'active').length || ''}</span></button><button type="button" onClick={() => { openPanel('memory'); setMobileNavOpen(false); }}><BookOpen size={17} /> Memória</button><button type="button" onClick={() => { openPanel('inbox'); setMobileNavOpen(false); }}><Bell size={17} /> Precisa de você {needsYou > 0 && <span className="worker-attention-count">{needsYou}</span>}</button>{myRole === 'admin' && <WorkerLink to="/admin/workers/uso"><BarChart3 size={17} /> Uso da equipe</WorkerLink>}</nav><div className="worker-nav-section-label">SEUS BOTS <span>08</span></div><div className="worker-workspace-workers">{workerCatalog.map(item => <button key={item.id} type="button" onClick={() => selectWorker(item)} className={workerId === item.id ? 'is-active' : ''} style={workerStyle(item)}><WorkerMascot shape={item.shape} color={item.color} size={30} paused /><span>{item.name}</span><ArrowRight size={13} /></button>)}</div><div className="worker-nav-section-label worker-history-heading">RECENTES</div><div className="worker-conversation-list">{isLoadingHistory ? <WorkerSkeletons rows={2} /> : conversations.length === 0 ? <p className="worker-history-empty">As suas conversas<br />começam por aqui.</p> : conversations.slice(0, 12).map(conversation => <button type="button" key={conversation.id} className={conversationId === conversation.id ? 'is-active' : ''} onClick={() => { void selectConversation(conversation.id); setMobileNavOpen(false); }}><MessageCircle size={14} /><span>{conversation.title || 'Nova conversa'}</span></button>)}</div><div className="worker-sidebar-bottom"><ShieldCheck size={16} /><span>Exclusiva da Fenasoja<br /><small>Com as suas permissões.</small></span><WorkerLink to="/portal" aria-label="Voltar ao portal Fenasoja"><ArrowLeft size={16} /></WorkerLink></div></>;
  return <div ref={viewportRef} className={`worker-chat-workspace ${compact ? 'worker-chat-workspace--compact' : ''}`}>
    {!compact && <aside className="worker-workspace-sidebar">{historyNavigation}</aside>}
    <main className="worker-chat-main" aria-label="Conversa com o BOT FENASOJA">
      <header className="worker-chat-header" data-state={isStreaming ? 'querying' : justCompleted ? 'complete' : 'idle'}><div className="worker-chat-header__identity">{!compact && <button type="button" className="worker-icon-button worker-mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Abrir navegação do BOT FENASOJA"><Menu size={20} /></button>}<WorkerTeamMark size={36} /><div><strong>BOT FENASOJA</strong><span role="status">{isStreaming ? 'Consultando as informações…' : error ? 'Consulta não concluída' : interrupted ? 'Resposta interrompida' : justCompleted ? 'Consulta concluída' : worker || hasConversation ? `${replyingWorker.name} · especialista` : 'Informação da feira, com contexto.'}</span></div></div><div className="worker-chat-header__actions">{hasConversation && <WorkerBotMotionToggle />}<button type="button" className="worker-icon-button worker-inbox-trigger" onClick={() => openPanel('inbox')} aria-label={`Precisa de você${needsYou ? `: ${needsYou} pendências` : ''}`}><Bell size={18} />{needsYou > 0 && <span>{needsYou}</span>}</button><span className="worker-readonly-badge"><ShieldCheck size={12} /> Você confirma as alterações</span>{compact ? <><WorkerLink to={worker ? workerChatLink(worker.id) : '/equipe-ia'} className="worker-icon-button" aria-label="Abrir workspace completo"><ExternalLink size={17} /></WorkerLink>{onClose && <button type="button" className="worker-icon-button" onClick={onClose} aria-label="Fechar BOT FENASOJA"><X size={19} /></button>}</> : <WorkerLink to="/equipe-ia/conheca" className="worker-icon-button" aria-label="Como o BOT FENASOJA funciona"><CircleHelp size={19} /></WorkerLink>}</div></header>
      {context && <div className="worker-context-bar"><span /><span>Consultando com o contexto da tela atual</span></div>}
      <div className="worker-chat-scroll" ref={listRef} onScroll={() => { const list = listRef.current; if (list) { nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80; if (nearBottom.current) setShowNewMessages(false); } }}>
        {!hasConversation ? <>
          <div><WorkerEmptyState title={worker ? `Oi! Vamos falar sobre ${worker.name.toLocaleLowerCase('pt-BR')}?` : undefined} description={worker ? worker.description : compact ? 'Pergunte sobre esta tela ou escolha um bot com @. As consultas respeitam o seu acesso.' : undefined}>{worker ? showWelcomeSuggestions ? <div className="worker-chat-suggestions">{worker.examples.map(example => <button key={example} type="button" onClick={() => { setDraft(example); textareaRef.current?.focus(); }}>{example}<ArrowUp size={15} /></button>)}</div> : null : <CatalogWorkerChips onSelect={selectWorker} />}</WorkerEmptyState>{worker && <PermissionNote worker={worker} />}</div>
        </> : <div className="worker-thread" role="log" aria-label="Mensagens da conversa" aria-live="polite" aria-relevant="additions text"><div className="worker-thread-start"><ShieldCheck size={12} /> Uma conversa privada, com as suas permissões.</div>{hasEarlierMessages && <button type="button" className="worker-load-earlier" disabled={isLoadingHistory} onClick={() => { const list = listRef.current; if (list) earlierScroll.current = { height: list.scrollHeight, top: list.scrollTop }; void loadEarlierMessages(); }}>Carregar mensagens anteriores</button>}{threadEntries.map(entry => <Fragment key={entry.id}>{entry.element}</Fragment>)}{isStreaming && messages[messages.length - 1]?.role !== 'assistant' && <div className="worker-thinking"><WorkerMascot shape={replyingWorker.shape} color={replyingWorker.color} size={42} mood="thinking" /><span>{replyingWorker.name} está pensando…</span></div>}<ProgressSteps steps={progress} /></div>}
      </div>
      {showNewMessages && <button className="worker-new-messages" type="button" onClick={() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' }); nearBottom.current = true; setShowNewMessages(false); }}><ArrowDown size={14} /> Novas mensagens</button>}
      <div className="worker-composer-area">{!worker && !hasConversation && !compact && <button type="button" className="worker-mobile-voice" onClick={() => setVoiceConsentOpen(true)}><Mic size={18} /> Falar com o BOT FENASOJA</button>}{error && <div className="worker-chat-error" role="alert"><span>{error}</span><button type="button" onClick={clearError} aria-label="Fechar aviso"><X size={16} /></button></div>}{workspace.error && <div className="worker-chat-error" role="alert"><span>{workspace.error}</span><button type="button" onClick={() => { workspace.clearError(); void workspace.refresh(); }} aria-label="Atualizar estado da equipe"><RefreshCw size={16} /></button></div>}{composerError && <p className="worker-composer-error" role="alert">{composerError}</p>}
        <div className={`worker-composer ${draft.trim() ? 'worker-composer--has-draft' : ''}`}>
          <div className="worker-composer__topline"><span><MessageSquareText size={13} /> Sua pergunta</span><span className="worker-composer__destination">{worker?.name ?? 'BOT FENASOJA'}</span></div>
          {attachments.length > 0 && <div className="worker-attachment-list" aria-label="Arquivos anexados">{attachments.map((file, index) => <span key={`${file.name}-${index}`}><FileText size={16} /><span>{file.name}</span><button type="button" onClick={() => setAttachments(previous => previous.filter((_, at) => at !== index))} aria-label={`Remover ${file.name}`}><X size={13} /></button></span>)}<small>Arquivos de referência para esta pergunta</small></div>}
          <label htmlFor={compact ? 'worker-copilot-input' : 'worker-chat-input'} className="sr-only">Mensagem para {worker?.name ?? 'o BOT FENASOJA'}</label>
          <textarea id={compact ? 'worker-copilot-input' : 'worker-chat-input'} ref={textareaRef} value={draft} onChange={event => { setDraft(event.target.value); if (event.target.value.endsWith('@')) setMentionsOpen(true); }} onKeyDown={onKeyDown} placeholder={recording ? 'Ouvindo… sua transcrição aparecerá aqui.' : worker ? `O que você quer saber sobre ${worker.name.toLocaleLowerCase('pt-BR')}?` : 'O que você quer saber sobre a feira?'} rows={2} maxLength={6000} disabled={recording} />
          <div className="worker-composer__toolbar">
            <div className="worker-composer__references"><button type="button" className="worker-composer-action" onClick={() => setMentionsOpen(!mentionsOpen)} aria-label="Mencionar um bot" title="Escolher especialista" aria-expanded={mentionsOpen}><AtSign size={17} /><span className="worker-composer__specialist-label">Especialista</span></button><button type="button" className="worker-composer-action" onClick={() => attachmentRef.current?.click()} aria-label="Anexar arquivo de texto" title="Anexar TXT ou Markdown"><Paperclip size={17} /><span>Anexar</span>{attachments.length > 0 && <span className="worker-composer__attachment-count">{attachments.length}</span>}</button><input hidden ref={attachmentRef} type="file" accept=".txt,.md,text/plain,text/markdown" onChange={event => void attach(event)} /></div>
            <div className="worker-composer__submit"><span className="worker-composer__key-hint"><CornerDownLeft size={12} /> Enter para enviar</span><button type="button" className={`worker-composer-action worker-composer-voice ${recording ? 'is-recording' : ''}`} onClick={() => recording ? speech.current?.stop() : setVoiceConsentOpen(true)} aria-label={recording ? 'Parar transcrição' : 'Falar com o BOT FENASOJA'} title={recording ? 'Parar transcrição' : 'Ditado por voz'} disabled={isStreaming}>{recording ? <Square size={16} /> : <Mic size={17} />}</button><button type="button" className="worker-send-button" onClick={isStreaming ? () => { setInterrupted(true); stop(); } : () => void send()} aria-label={isStreaming ? 'Parar resposta' : 'Enviar mensagem'} disabled={!isStreaming && (!draft.trim() || recording)}><span className="worker-send-button__label">{isStreaming ? 'Parar' : 'Enviar'}</span>{isStreaming ? <Square size={15} fill="currentColor" /> : <ArrowUp size={19} />}</button></div>
          </div>
          <AnimatePresence>{mentionsOpen && <m.div className="worker-mention-menu" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}><span>Quem pode ajudar?</span>{workerCatalog.map(item => <button key={item.id} type="button" onClick={() => insertMention(item)}><WorkerMascot shape={item.shape} color={item.color} size={31} paused /><span>{item.name}</span><small>@{item.id}</small></button>)}</m.div>}</AnimatePresence>
        </div><p className="worker-composer-disclaimer"><ShieldCheck size={11} /> BOT FENASOJA · Confira o período e as fontes.</p>
      </div>
    </main>
    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}><SheetContent side="left" className="workers-scope worker-mobile-nav-sheet"><SheetHeader className="sr-only"><SheetTitle>Navegação do BOT FENASOJA</SheetTitle><SheetDescription>Bots e conversas recentes</SheetDescription></SheetHeader><div className="worker-mobile-nav-content">{historyNavigation}</div></SheetContent></Sheet>
    <WorkspacePanels panel={workspacePanel} onPanelChange={panel => { setWorkspacePanel(panel); if (!panel && searchParams.has('view')) { const next = new URLSearchParams(searchParams); next.delete('view'); setSearchParams(next, { replace: true }); } }} workspace={workspace} onAsk={ask} onRestoreFocus={() => { const previous = panelTrigger.current; if (previous?.isConnected && previous.getClientRects().length) previous.focus(); else textareaRef.current?.focus(); }} />
    <Dialog open={voiceConsentOpen} onOpenChange={setVoiceConsentOpen}><DialogContent className="workers-scope"><DialogHeader><DialogTitle>Vamos conversar por voz?</DialogTitle><DialogDescription>Ao continuar, você permite o uso do microfone para transcrever esta fala. O serviço de voz do seu navegador pode processar o áudio externamente. A transcrição fica no campo de mensagem e só é enviada ao BOT FENASOJA quando você tocar em Enviar.</DialogDescription></DialogHeader><p className="worker-small-note">Evite falar documentos, contatos, dados financeiros pessoais ou informações sensíveis. Você pode interromper a transcrição a qualquer momento.</p><DialogFooter><button type="button" className="worker-button worker-button--quiet" onClick={() => setVoiceConsentOpen(false)}>Agora não</button><button type="button" className="worker-button worker-button--primary" onClick={startVoice}><Mic size={17} /> Permitir esta transcrição</button></DialogFooter></DialogContent></Dialog>
  </div>;
}
