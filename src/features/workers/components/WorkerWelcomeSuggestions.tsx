import { ArrowUpRight, CalendarDays, CreditCard, Landmark, MapPinned, Sprout, Ticket, TrendingUp, Truck, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { WorkerDefinition } from '../types';

const specialistIcons: Record<WorkerDefinition['id'], LucideIcon> = { agenda: CalendarDays, arena: Ticket, mapa: MapPinned, interesse: TrendingUp, comissao: Users, logistica: Truck, caixa: Wallet, radar: Sprout };

const fairQuestions = [
  'Quem foi o presidente da Fenasoja 2024?',
  'Qual edição da Fenasoja teve o maior público?',
  'Quando foi a décima Fenasoja?',
];
const fieldQuestions = [
  'O que é agricultura de precisão?',
  'Qual o percentual de Reserva Legal no RS?',
  'O que é Pix?',
];
const dayQuestions = ['Quais são os eventos de amanhã?', 'Quais são as pendências da minha comissão?', 'Como estão as vendas do mapa comercial?'];

export function WorkerWelcomeSuggestions({ worker, cycle, onSelect, onHoverChange }: {
  worker?: WorkerDefinition; cycle: number; onSelect: (question: string) => void; onHoverChange: (hovered: boolean) => void;
}) {
  const cards = [
    { topic: worker ? `Com ${worker.name}` : 'Seu dia na feira', question: worker?.examples[cycle % worker.examples.length] ?? dayQuestions[cycle], icon: worker ? specialistIcons[worker.id] : [CalendarDays, Users, MapPinned][cycle], tone: 'day' },
    { topic: 'Histórias da Fenasoja', question: fairQuestions[cycle], icon: Landmark, tone: 'fair' },
    { topic: cycle === 2 ? 'Tecnologia no dia a dia' : 'Conhecimento do campo', question: fieldQuestions[cycle], icon: cycle === 2 ? CreditCard : Sprout, tone: 'field' },
  ];
  return <div className="worker-welcome-suggestions" aria-label="Sugestões para começar" onMouseEnter={() => onHoverChange(true)} onMouseLeave={() => onHoverChange(false)}>
    {cards.map(({ topic, question, icon: Icon, tone }) => <button key={tone} type="button" className={`worker-welcome-card worker-welcome-card--${tone}`} aria-label={question} onClick={() => onSelect(question)}>
      <span className="worker-welcome-card__icon" aria-hidden="true"><Icon size={19} strokeWidth={1.7} /></span>
      <span className="worker-welcome-card__copy"><span className="worker-welcome-card__topic">{topic}</span><span className="worker-welcome-card__question">{question}</span></span>
      <ArrowUpRight className="worker-welcome-card__arrow" size={16} aria-hidden="true" />
    </button>)}
  </div>;
}
