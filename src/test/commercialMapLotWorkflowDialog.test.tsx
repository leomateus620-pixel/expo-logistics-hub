import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LotWorkflowDialog } from '@/features/commercial-map/components/commercial/LotWorkflowDialog';
import { OFFICIAL_REFERENCE_LOTS } from '@/features/commercial-map/data/officialReference2026';

const mocks = vi.hoisted(() => ({
  orgId: null as string | null,
  reservation: { isPending: false, mutateAsync: vi.fn() },
  negotiation: { isPending: false, mutateAsync: vi.fn() },
  sale: { isPending: false, mutateAsync: vi.fn() },
  contract: { isPending: false, mutateAsync: vi.fn() },
}));

vi.mock('@/hooks/useCurrentOrg', () => ({
  useCurrentOrg: () => ({ orgId: mocks.orgId }),
}));

vi.mock('@/features/commercial-map/hooks/useCommercialMap', () => ({
  useMapMutations: () => ({
    reservation: mocks.reservation,
    negotiation: mocks.negotiation,
    sale: mocks.sale,
    contract: mocks.contract,
  }),
}));

const lot = OFFICIAL_REFERENCE_LOTS.find((candidate) => candidate.publicIdentifier === 'B6-M048')!;

describe('upload protegido de contrato comercial', () => {
  beforeEach(() => {
    mocks.orgId = null;
    vi.clearAllMocks();
    mocks.contract.mutateAsync.mockResolvedValue(undefined);
  });

  it('mantém o diálogo aberto e bloqueia envio sem organização ativa', () => {
    const onClose = vi.fn();
    render(<LotWorkflowDialog lot={lot} workflow="contract" onClose={onClose} />);

    const file = new File(['contrato'], 'contrato.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Arquivo (PDF ou DOCX) *'), {
      target: { files: [file] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Selecione uma organização ativa para enviar o contrato com segurança.',
    );
    expect(screen.getByRole('button', { name: 'Enviar contrato' })).toBeDisabled();
    expect(mocks.contract.mutateAsync).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('envia para o bucket privado e fecha somente depois da mutation concluída', async () => {
    mocks.orgId = 'org-test';
    const onClose = vi.fn();
    render(<LotWorkflowDialog lot={lot} workflow="contract" onClose={onClose} />);

    const file = new File(['contrato'], 'contrato.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Arquivo (PDF ou DOCX) *'), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText('Número do contrato'), {
      target: { value: '2028-0042' },
    });
    expect(screen.getByRole('button', { name: 'Enviar contrato' })).toBeEnabled();
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    await waitFor(() => expect(mocks.contract.mutateAsync).toHaveBeenCalledWith({
      orgId: 'org-test',
      lotId: lot.id,
      file,
      contractNumber: '2028-0042',
    }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
