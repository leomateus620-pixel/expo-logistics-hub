import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { EventRelationshipWorkspace } from '@/components/cronograma-eventos/workspace/EventRelationshipWorkspace';
import type {
  CronogramaEvent,
  CronogramaSubevent,
  CronogramaSubeventPlanDraft,
} from '@/components/cronograma-eventos/types';
import '@/styles/tokens.css';
import '@/index.css';

const subevent: CronogramaSubevent = {
  id: 'qa-subevent',
  owner: 'Mariana Oliveira',
  commission: 'Programação e Eventos',
  commissionSlug: 'programacao-e-eventos',
  title: 'Ações previstas e orçamento',
  description:
    'Promover a integração dos voluntários da Fenasoja 2028, fortalecendo o sentimento de pertencimento e o compromisso coletivo com a construção da feira. Valorizar cada pessoa e alinhar as comissões para a próxima edição.',
  date: '2026-10-24',
  startTime: '07:30',
  endTime: '11:30',
  status: 'planned',
  sortOrder: 0,
  storage: 'relational',
  commissionsRel: [
    {
      commissionId: 'qa-commission',
      commissionSlug: 'programacao-e-eventos',
      commissionName: 'Programação e Eventos',
      isPrimary: true,
    },
  ],
  responsiblesRel: [
    {
      userId: 'qa-person-1',
      name: 'Mariana Oliveira',
      role: 'Coordenação de programação',
      responsibleType: 'member',
      isPrimary: true,
    },
  ],
  actions: [
    [
      '07:30',
      'Recepção dos voluntários e café de boas-vindas',
      'Mariana Oliveira',
    ],
    [
      '08:30',
      'Apresentação musical e acolhimento das comissões',
      'Rafael Costa',
    ],
    [
      '08:35',
      'Abertura e apresentação dos objetivos da imersão',
      'Coordenação executiva',
    ],
    [
      '08:45',
      'Dinâmica de integração e apresentação dos projetos para 2028',
      'Equipe de programação',
    ],
    [
      '09:30',
      'Alinhamento institucional e próximos passos',
      'Conselho consultivo',
    ],
    [
      '09:40',
      'Cultura Fenasoja: compromisso e pertencimento',
      'Mariana Oliveira',
    ],
    ['10:20', 'Dinâmica em grupos e construção colaborativa', 'Rafael Costa'],
    ['10:50', 'Participação dos convidados institucionais', 'Cerimonial'],
    [
      '11:00',
      'Encerramento e registro oficial com todas as equipes',
      'Coordenação executiva',
    ],
  ].map(([startTime, title, responsibleName], i) => ({
    id: `qa-action-${i}`,
    startTime,
    title,
    responsibleName,
    sortOrder: i,
  })),
  provisions: [
    [
      'Convites e confirmação de presença das comissões',
      'Mariana Oliveira',
      true,
    ],
    ['Som, painel de LED e iluminação do espaço', 'Rafael Costa', true],
    [
      'Estrutura, montagem e organização das mesas',
      'Equipe de infraestrutura',
      false,
    ],
    [
      'Café, recepção e credenciamento dos participantes',
      'Equipe de acolhimento',
      false,
    ],
    [
      'Release para imprensa e registro fotográfico',
      'Assessoria de comunicação',
      true,
    ],
  ].map(([description, responsibleName, isDone], i) => ({
    id: `qa-provision-${i}`,
    description: String(description),
    responsibleName: String(responsibleName),
    isDone: Boolean(isDone),
    sortOrder: i,
  })),
  budget: [
    {
      id: 'qa-budget-1',
      item: 'Coffee break para os voluntários e convidados',
      supplier: 'Fornecedor de alimentação',
      amount: 2850,
      sortOrder: 0,
    },
    {
      id: 'qa-budget-2',
      item: 'Locação de som, iluminação e painel de LED',
      supplier: 'Produção audiovisual',
      amount: 4200.5,
      sortOrder: 1,
    },
  ],
  guests: [
    {
      id: 'qa-guest-1',
      name: 'Representantes das comissões',
      category: 'Comissões',
      sortOrder: 0,
    },
  ],
};
const initialEvent: CronogramaEvent = {
  id: 'qa-main-event',
  title: 'IMERSÃO FENASOJA 2028',
  summary:
    'Encontro da família Fenasoja: cultura, projetos e integração para a edição 2028.',
  date: '2026-10-24',
  year: 2026,
  kind: 'event',
  category: 'programacao',
  status: 'planned',
  priority: 'high',
  owner: 'Coordenação executiva',
  commission: 'Programação e Eventos',
  location: 'Centro de Eventos Fenasoja',
  subevents: [subevent],
};
function Preview() {
  const [event, setEvent] = useState(initialEvent);
  const [fail, setFail] = useState(false);
  const [message, setMessage] = useState(
    'Ambiente local de teste · Dados demonstrativos',
  );
  const save = async (items: CronogramaSubeventPlanDraft[]) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (fail)
      throw new Error(
        'Não foi possível salvar. Revise a conexão e tente novamente.',
      );
    setEvent((current) => {
      const next = [...(current.subevents ?? [])];
      items.forEach((item) => {
        const position = next.findIndex((existing) => existing.id === item.id);
        const updated: CronogramaSubevent = {
          ...item,
          id: item.id ?? crypto.randomUUID(),
          owner: item.responsible,
          storage: 'relational',
        };
        if (position >= 0) next[position] = updated;
        else next.push(updated);
      });
      return { ...current, subevents: next };
    });
    setMessage('Planejamento salvo na demonstração local.');
  };
  return (
    <TooltipProvider>
      <div
        style={{
          padding: '.6rem 1rem',
          fontSize: '.75rem',
          background: 'oklch(var(--surface-2))',
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <span role="status">{message}</span>
        <label>
          <input
            type="checkbox"
            checked={fail}
            onChange={(e) => setFail(e.target.checked)}
          />{' '}
          Simular erro de salvamento
        </label>
      </div>
      <EventRelationshipWorkspace
        event={event}
        onBack={() => setMessage('Retorno ao cronograma acionado.')}
        onSaveEvent={async (next) => setEvent(next)}
        onCreateSubevent={() => {}}
        onUpdateSubevent={async (target, input) =>
          setEvent((current) => ({
            ...current,
            subevents: current.subevents?.map((item) =>
              item.id === target.id ? { ...item, ...input } : item,
            ),
          }))
        }
        onRemoveSubevent={async (target) =>
          setEvent((current) => ({
            ...current,
            subevents: current.subevents?.filter(
              (item) => item.id !== target.id,
            ),
          }))
        }
        onSaveSubeventPlan={save}
        canManage
        canDeleteSubevents
      />
    </TooltipProvider>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <Preview />
  </QueryClientProvider>,
);
