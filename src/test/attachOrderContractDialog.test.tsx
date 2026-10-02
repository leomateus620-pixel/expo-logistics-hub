import { useState } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachOrderContractDialog } from '@/features/commercial-map/dashboard/salesOrders/AttachOrderContractDialog';
import { attachOrderContract, type SaleContract } from '@/features/commercial-map/dashboard/salesOrders/salesOrdersService';

vi.mock('@/features/commercial-map/dashboard/salesOrders/salesOrdersService', () => ({
  attachOrderContract: vi.fn(),
  describeSalesError: (error: Error) => error.message,
}));

// Isolated UI test data: no application fixture or persisted sale is created.
const items = [{ lotId: 'space-one', label: 'Espaço 1' }, { lotId: 'space-two', label: 'Espaço 2' }];
const existing: SaleContract = {
  contractId: 'test-contract', contractNumber: 'TESTE-1', scope: 'ORDER_ITEMS', activeVersion: 2,
  createdAt: '2026-10-01T12:00:00Z', lotIds: ['space-one'], versions: [],
};
const attached = { contractId: existing.contractId, version: 3, versionId: 'test-version' };
const props = { orgId: 'test-org', orderId: 'test-order', items, contract: null,
  onClose: vi.fn(), onAttached: vi.fn(async () => undefined) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(attachOrderContract).mockResolvedValue(attached);
});
afterEach(cleanup);

describe('anexação existente de contrato', () => {
  it('mantém os espaços escolhidos e a identidade do contrato ao enviar uma nova versão', async () => {
    const user = userEvent.setup();
    render(<AttachOrderContractDialog {...props} contract={existing} />);
    expect(screen.getByRole('radio', { name: /Escolher espaços/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Espaço 1' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Espaço 2' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Espaço 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Espaço 2' }));
    const file = new File(['contrato'], 'contrato-v3.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Selecionar arquivo do contrato'), file);
    expect(screen.getByText(file.name)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar nova versão' }));
    await waitFor(() => expect(attachOrderContract).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'test-org', orderId: 'test-order', lotIds: ['space-two'], contractId: existing.contractId,
      contractNumber: existing.contractNumber, file,
    })));
    expect(props.onAttached).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('mantém o modal aberto durante o envio e mostra a validação do arquivo antes de persistir', async () => {
    const user = userEvent.setup({ applyAccept: false });
    let finishUpload: (() => void) | undefined;
    vi.mocked(attachOrderContract).mockImplementation(async ({ onProgress }) => {
      onProgress?.('upload');
      return new Promise((resolve) => { finishUpload = () => resolve(attached); });
    });
    render(<AttachOrderContractDialog {...props} />);
    await user.upload(screen.getByLabelText('Selecionar arquivo do contrato'), new File(['texto'], 'arquivo.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Envie um arquivo PDF ou DOCX.');
    await user.click(screen.getByRole('button', { name: 'Anexar contrato' }));
    expect(attachOrderContract).not.toHaveBeenCalled();
    await user.upload(screen.getByLabelText('Trocar arquivo: arquivo.txt'), new File(['contrato'], 'contrato.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: 'Anexar contrato' }));
    expect(screen.getByRole('status')).toHaveTextContent('Enviando arquivo…');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => { finishUpload?.(); });
    expect(props.onAttached).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('isola o teclado do dashboard, mantém o foco no modal e o devolve à origem ao fechar com Escape', async () => {
    const user = userEvent.setup();
    const parentKeyDown = vi.fn();
    const closeDashboard = vi.fn();
    const dashboardShortcut = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) closeDashboard();
    };
    function Harness() {
      const [open, setOpen] = useState(false);
      return <div onKeyDown={(event) => {
        parentKeyDown();
        if (event.key === 'Tab' && !event.currentTarget.contains(document.activeElement)) {
          event.preventDefault();
          event.currentTarget.querySelector('button')?.focus();
        }
      }}>
        <button onClick={() => setOpen(true)}>Anexar documento da venda</button>
        {open && <AttachOrderContractDialog {...props} onClose={() => setOpen(false)} />}
      </div>;
    }
    window.addEventListener('keydown', dashboardShortcut);
    try {
      render(<Harness />);
      const trigger = screen.getByRole('button', { name: 'Anexar documento da venda' });
      await user.click(trigger);
      expect(screen.getByLabelText('Selecionar arquivo do contrato')).toHaveFocus();
      await user.tab({ shift: true });
      expect(screen.getByRole('button', { name: 'Fechar anexação de contrato' })).toHaveFocus();
      await user.tab({ shift: true });
      expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
      expect(parentKeyDown).not.toHaveBeenCalled();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
      expect(closeDashboard).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', dashboardShortcut);
    }
  });
});
