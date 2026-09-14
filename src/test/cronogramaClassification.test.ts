import { describe, expect, it } from 'vitest';
import { classifyEvent } from '@/lib/cronograma-classification';

const cat = (title: string, extra = {}) => classifyEvent({ title, ...extra }).category.value;
const kind = (title: string, extra = {}) => classifyEvent({ title, ...extra }).kind.value;

describe('classificação automática — cenários do brief', () => {
  it('reunião da comissão central é governança', () => {
    expect(cat('Reunião da Comissão Central')).toBe('governanca');
    expect(kind('Reunião da Comissão Central')).toBe('meeting');
  });

  it('reunião da central para definir o orçamento permanece governança', () => {
    expect(cat('REUNIÃO DA COMISSÃO CENTRAL PARA DEFINIR O ORÇAMENTO 2028')).toBe('governanca');
    expect(kind('REUNIÃO DA COMISSÃO CENTRAL PARA DEFINIR O ORÇAMENTO 2028')).toBe('meeting');
  });

  it('prazos', () => {
    expect(kind('Prazo para envio de documentos das comissões')).toBe('deadline');
    expect(cat('Prazo para assinatura dos contratos de patrocinadores')).toBe('comercial');
    expect(kind('Prazo para assinatura dos contratos de patrocinadores')).toBe('deadline');
    expect(cat('Prazo para contratação das vans')).toBe('logistica');
    expect(kind('Prazo para contratação das vans')).toBe('deadline');
  });

  it('comercial e patrocínios', () => {
    expect(cat('Reunião com patrocinadores')).toBe('comercial');
    expect(kind('Reunião com patrocinadores')).toBe('meeting');
    expect(cat('Reunião com patrocinadores para definição das cotas 2028')).toBe('comercial');
  });

  it('programação e marcos', () => {
    expect(cat('Lançamento oficial da Fenasoja 2028')).toBe('programacao');
    expect(cat('Marco: conclusão da montagem dos pavilhões')).toBe('infraestrutura');
    expect(kind('Marco: conclusão da montagem dos pavilhões')).toBe('milestone');
    expect(cat('Conclusão da instalação elétrica do parque')).toBe('infraestrutura');
    expect(kind('Conclusão da instalação elétrica do parque')).toBe('milestone');
  });

  it('comunicação', () => {
    expect(cat('Coletiva de imprensa Fenasoja 2028')).toBe('comunicacao');
    expect(kind('Coletiva de imprensa Fenasoja 2028')).toBe('event');
    expect(cat('Produção de campanha de divulgação')).toBe('comunicacao');
  });

  it('financeiro', () => {
    expect(cat('Definição oficial do orçamento 2028')).toBe('financeiro');
    expect(kind('Definição oficial do orçamento 2028')).toBe('decision');
    expect(cat('Reunião para aprovação do orçamento')).toBe('financeiro');
    expect(kind('Reunião para aprovação do orçamento')).toBe('meeting');
    expect(kind('Decisão sobre contratação do fornecedor')).toBe('decision');
  });

  it('tecnologia', () => {
    expect(cat('Treinamento da equipe no novo sistema')).toBe('tecnologia');
    expect(kind('Treinamento da equipe no novo sistema')).toBe('event');
    expect(cat('Implantação concluída do novo portal')).toBe('tecnologia');
    expect(kind('Implantação concluída do novo portal')).toBe('milestone');
    expect(cat('Conclusão oficial da implantação do portal 2028')).toBe('tecnologia');
  });

  it('logística, representações e cerimonial', () => {
    expect(cat('Reunião de alinhamento dos transportes')).toBe('logistica');
    expect(cat('Recepção da comitiva estadual')).toBe('representacoes');
    expect(cat('Definição do protocolo da solenidade')).toBe('cerimonial');
  });
});

describe('ambiguidade — intenção principal vence a última palavra-chave', () => {
  it.each([
    ['Reunião para decidir patrocinador oficial', 'meeting', 'comercial'],
    ['Prazo para decisão sobre fornecedor', 'deadline', undefined],
    ['Reunião para definir prazo da montagem', 'meeting', undefined],
    ['Evento para lançamento da campanha de marketing', 'event', 'comunicacao'],
    ['Marco da conclusão da logística de transporte', 'milestone', 'logistica'],
  ])('%s', (title, expectedKind, expectedCategory) => {
    expect(kind(title)).toBe(expectedKind);
    if (expectedCategory) expect(cat(title)).toBe(expectedCategory);
  });
});

describe('regra especial da Comissão Central', () => {
  it('significado do evento prevalece sobre a presença da Central', () => {
    expect(cat('Comissão Central define nova regra')).toBe('governanca');
    expect(kind('Comissão Central define nova regra')).toBe('decision');
    expect(cat('Presidente concede entrevista para imprensa')).toBe('comunicacao');
    expect(cat('Presidente visita patrocinador')).toBe('comercial');
    expect(cat('Comissão Central participa do lançamento oficial')).toBe('programacao');
  });

  it('contexto de comissão vinculada influencia sem dominar', () => {
    expect(classifyEvent({ title: 'Alinhamento operacional', commissions: ['Comissão Central'] }).category.value)
      .toBe('governanca');
    expect(classifyEvent({ title: 'Coletiva de imprensa', commissions: ['Comissão Central'] }).category.value)
      .toBe('comunicacao');
  });
});

describe('confiança e origem', () => {
  it('retorna score interno e sinais usados', () => {
    const result = classifyEvent({ title: 'Reunião da Comissão Central', commissions: ['Comissão Central'] });
    expect(result.category.confidence).toBeGreaterThan(0);
    expect(result.category.confidence).toBeLessThanOrEqual(1);
    expect(result.category.source).toContain('governance-rule');
  });

  it('título vazio cai no fallback sem quebrar', () => {
    const result = classifyEvent({ title: '' });
    expect(result.kind.value).toBe('event');
    expect(result.category.source).toContain('fallback');
  });
});
