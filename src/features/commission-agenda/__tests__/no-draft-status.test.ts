import { describe, expect, it } from 'vitest';
import { mapCronogramaStatus } from '../adapters/cronograma.adapter';

describe('agenda das comissões sem rascunho', () => {
  it('aguardando definição aparece como Solicitado', () => expect(mapCronogramaStatus('aguardando_definicao')).toBe('requested'));
  it('status vazio aparece como Solicitado', () => expect(mapCronogramaStatus(null)).toBe('requested'));
  it('rascunho legado aparece como Solicitado', () => expect(mapCronogramaStatus('rascunho')).toBe('requested'));
});
