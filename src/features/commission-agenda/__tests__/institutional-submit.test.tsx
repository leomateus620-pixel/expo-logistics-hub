import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarDays } from 'lucide-react';
import { CommissionAgendaPage } from '../components/CommissionAgendaPage';
import { EventFormShell } from '../components/EventFormShell';
import { CRONOGRAMA_LOCATION_OPTIONS } from '@/lib/cronograma-location-options';
import type { CommissionUnitViewModel } from '../types';

afterEach(cleanup);
const unit: CommissionUnitViewModel = {id:'health',name:'Saúde',type:'comissao',status:'active',icon:CalendarDays,leads:[],members:[],basePath:'/comissoes/saude'};
function fill() {
  fireEvent.change(screen.getByLabelText(/Título/),{target:{value:'Reunião institucional'}});
  fireEvent.change(screen.getByLabelText(/^Data\s*\*?$/),{target:{value:'2028-05-20'}});
}

describe('confirmação transacional no formulário institucional',()=>{
 it('waits, locks dismissal and duplicate clicks, preserves input on rejection, then closes on explicit success',async()=>{
  let finish!: (value:boolean)=>void;
  const save=vi.fn().mockImplementationOnce(()=>new Promise<boolean>(resolve=>{finish=resolve;})).mockResolvedValueOnce(true);
  render(<CommissionAgendaPage unit={unit} events={[]} onSubmitEvent={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'Criar primeiro evento'}));
  fill();
  fireEvent.submit(document.querySelector('form')!);
  fireEvent.submit(document.querySelector('form')!);
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button',{name:'Salvando…'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Fechar'}));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await act(async()=>finish(false));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByLabelText(/Título/)).toHaveValue('Reunião institucional');
  const first=save.mock.calls[0][0];
  fireEvent.submit(document.querySelector('form')!);
  await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(save.mock.calls[1][0].sourceKey).toBe(first.sourceKey);
 });
 it('does not interpret a discarded or missing callback result as success',async()=>{
  render(<CommissionAgendaPage unit={unit} events={[]} onSubmitEvent={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Criar primeiro evento'}));fill();
  fireEvent.submit(document.querySelector('form')!);
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('não foi salvo'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
 });
 it.each(CRONOGRAMA_LOCATION_OPTIONS)('saves fixed location $code using the shared Agenda selector',async place=>{
  const submit=vi.fn().mockResolvedValue(true);
  render(<EventFormShell onSubmit={submit}/>);fill();
  fireEvent.click(screen.getByRole('button',{name:'Local Selecionar local'}));
  fireEvent.click(screen.getByRole('button',{name:place.label}));
  fireEvent.submit(document.querySelector('form')!);
  await waitFor(()=>expect(submit).toHaveBeenCalled());
  expect(submit.mock.calls[0][0]).toMatchObject({location:place.label,locationCode:place.code});
 });
 it('keeps an explicitly added external guest in the submitted selection', async () => {
  const submit = vi.fn().mockResolvedValue(true);
  render(<EventFormShell onSubmit={submit} />); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Pessoas responsáveis Buscar e selecionar' }));
  fireEvent.change(screen.getByLabelText('Buscar em pessoas responsáveis'), { target: { value: 'Convidada externa QA' } });
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar como convidado externo: Convidada externa QA' }));
  fireEvent.submit(document.querySelector('form')!);
  await waitFor(() => expect(submit).toHaveBeenCalled());
  const draft = submit.mock.calls[0][0];
  expect(draft.externalPeople).toEqual([{ id: draft.peopleIds[0], name: 'Convidada externa QA' }]);
 });
 it('preserves a historic free-text location until deliberately changed',()=>{
  render(<EventFormShell event={{id:'e',title:'Original',date:'2028-05-20',status:'confirmed',location:'Sala histórica'}}/>);
  expect(screen.getByLabelText('Outro local do evento')).toHaveValue('Sala histórica');
 });
});
