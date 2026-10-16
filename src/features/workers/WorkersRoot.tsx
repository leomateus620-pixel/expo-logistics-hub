import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { m } from 'motion/react';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { WorkersMotionProvider } from './motion/MotionProvider';
import { WorkerTeamBrand } from './components/WorkerTeamBrand';
import { WorkerLink } from './components/WorkerPrimitives';
import { WorkersChat } from './components/WorkersChat';
import { getWorker } from './workerCatalog';
import TeamPage from './pages/TeamPage';
import WorkerProfilePage from './pages/WorkerProfilePage';
import DesignReviewPage from './pages/DesignReviewPage';
import WorkersUsagePage from './pages/WorkersUsagePage';
import './styles/worker-tokens.css';
import './styles/workers.css';
import './styles/workspace.css';

export default function WorkersRoot() {
  const location = useLocation(); const [params] = useSearchParams(); const navigate = useNavigate();
  const isUsage = location.pathname === '/admin/workers/uso';
  const isDesign = location.pathname === '/admin/workers/design'; const isTeam = location.pathname === '/equipe-ia/conheca';
  const slug = location.pathname.startsWith('/equipe-ia/') ? location.pathname.split('/')[2] : undefined;
  const profileWorker = !isTeam ? getWorker(slug) : undefined; const chatWorker = getWorker(params.get('worker'));
  const isChat = !isUsage && !isDesign && !isTeam && !slug;
  useEffect(() => {
    const previous = document.title; document.title = `${isUsage ? 'Uso da equipe' : isDesign ? 'Revisão visual' : isTeam ? 'Conheça a equipe' : profileWorker?.name ?? 'Equipe IA'} · Fenasoja`;
    return () => { document.title = previous; };
  }, [isDesign, isTeam, isUsage, profileWorker]);
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { if (document.querySelector('[role="dialog"][data-state="open"]')) return; event.preventDefault(); if (isChat) document.getElementById('worker-chat-input')?.focus(); else { navigate('/equipe-ia'); requestAnimationFrame(() => document.getElementById('worker-chat-input')?.focus()); } } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [isChat, navigate]);
  return <WorkersMotionProvider><div className={`workers-scope workers-root ${isChat ? 'workers-root--chat' : ''}`}>
    {!isChat && <header className="worker-site-header"><WorkerLink to="/equipe-ia" className="worker-site-brand"><WorkerTeamBrand /></WorkerLink><nav aria-label="Navegação da equipe"><WorkerLink to="/equipe-ia/conheca" className={isTeam ? 'is-active' : ''}>Conheça a equipe</WorkerLink><WorkerLink to="/equipe-ia" className="worker-site-chat-link">Conversar <ArrowRight size={15} /></WorkerLink></nav><WorkerLink to="/portal" className="worker-site-portal"><ArrowLeft size={14} /> Portal</WorkerLink></header>}
    {isChat ? <WorkersChat workerId={chatWorker?.id} /> : <m.main key={location.pathname} className="worker-site-main" initial={'startViewTransition' in document ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}>{isUsage ? <WorkersUsagePage /> : isDesign ? <DesignReviewPage /> : isTeam ? <TeamPage /> : profileWorker ? <WorkerProfilePage worker={profileWorker} /> : <div className="worker-not-found"><Sparkles size={30} /><h1>Esse bot não está na equipe.</h1><p>Conheça os oito bots exclusivos da Fenasoja.</p><WorkerLink to="/equipe-ia/conheca" className="worker-button worker-button--primary">Conheça a equipe <ArrowRight size={16} /></WorkerLink></div>}</m.main>}
  </div></WorkersMotionProvider>;
}
