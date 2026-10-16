import { ArrowRight, Check, Database, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { m } from 'motion/react';
import { WorkerMascot } from '../mascot/WorkerMascot';
import { workerCatalog, workerChatLink } from '../workerCatalog';
import { WorkerCluster, WorkerLink } from '../components/WorkerPrimitives';
import { workerStyle } from '../ui-utils';

export default function TeamPage() {
  return <div className="worker-team-page">
    <section className="worker-team-hero"><div className="worker-team-hero__copy"><span className="worker-eyebrow"><Sparkles size={14} /> Feita para a nossa feira</span><h1>Grandes ideias.<br /><span>Uma equipe ao seu lado.</span></h1><p>Conheça a equipe Fenasoja. Oito olhares para conectar informações, cuidar dos detalhes e ajudar você a preparar o que vem pela frente.</p><WorkerLink to="/equipe-ia" className="worker-button worker-button--primary">Vamos conversar <ArrowRight size={17} /></WorkerLink><div className="worker-hero-note"><ShieldCheck size={15} /> Seus dados. Suas permissões. Sua feira.</div></div><WorkerCluster fullTeam /></section>
    <section className="worker-team-grid-section"><div className="worker-section-heading"><div><span className="worker-eyebrow">Juntos, pela Fenasoja</span><h2>Encontre o olhar que você precisa.</h2></div><p>Cada bot tem uma especialidade.<br />Todos trabalham com o mesmo cuidado.</p></div>
      <div className="worker-team-grid">{workerCatalog.map((worker, index) => <m.article className="worker-card" key={worker.id} style={workerStyle(worker)} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '40px' }} transition={{ duration: .32, delay: (index % 4) * .05 }}>
        <div className="worker-card__scene"><div className="worker-card__halo" /><div style={{ viewTransitionName: `worker-${worker.id}` }}><WorkerMascot shape={worker.shape} color={worker.color} size="lg" interactive seed={`card-${worker.id}`} /></div><span className="worker-card__mode">{worker.futureActions.length ? 'Alterações com confirmação' : 'Somente leitura'}</span></div>
        <div className="worker-card__body"><h3>{worker.name}</h3><p>{worker.tagline}</p><ul>{worker.skills.map(skill => <li key={skill.title}><Check size={13} />{skill.title}</li>)}</ul><div className="worker-card__links"><WorkerLink to={`/equipe-ia/${worker.id}`} className="worker-card__know">Conhecer <ArrowRight size={15} /></WorkerLink><WorkerLink to={workerChatLink(worker.id)} className="worker-card__chat" aria-label={`Conversar com ${worker.name}`}>Conversar</WorkerLink></div></div>
      </m.article>)}</div>
    </section>
    <section className="worker-permissions-section"><div><span className="worker-eyebrow"><ShieldCheck size={15} /> Confiança em cada conversa</span><h2>Uma equipe próxima.<br />Um acesso cuidadoso.</h2><p>Os bots respeitam as permissões que você já tem na Fenasoja. Você vê a origem da informação e continua no controle.</p></div><div className="worker-trust-list"><article><LockKeyhole size={21} /><div><h3>O seu acesso é o limite</h3><p>Cada consulta passa pelas permissões da sua conta e da sua organização.</p></div></article><article><Database size={21} /><div><h3>Informação com origem</h3><p>Resultados do sistema levam ao registro. Pesquisas externas mostram suas fontes.</p></div></article><article><ShieldCheck size={21} /><div><h3>Você confirma cada alteração</h3><p>Notas da Arena, reservas e negociações geram uma proposta para revisar. A equipe nunca envia mensagens para outras pessoas.</p></div></article></div></section>
    <footer className="worker-page-footer"><span>Uma equipe exclusiva da Fenasoja.</span><WorkerLink to="/equipe-ia">Começar uma conversa <ArrowRight size={15} /></WorkerLink></footer>
  </div>;
}
