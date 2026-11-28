import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CommercialLot, SpaceCession } from '../types';
import { CessionContract, useCessionDetail } from './CessionContract';
import { documentStatus } from './cessionService';

function OperationRow({
  operation,
  lots,
  canManageContracts,
  onOpen,
}: {
  operation: SpaceCession & { id: string };
  lots: CommercialLot[];
  canManageContracts: boolean;
  onOpen: () => void;
}) {
  const query = useCessionDetail(operation.id, canManageContracts);
  const blocks = new Map<string, string[]>();
  for (const lot of lots) {
    const block = lot.block ? `Quadra ${lot.block}` : 'Espaços';
    blocks.set(block, [...(blocks.get(block) ?? []), lot.lotNumber ?? lot.publicIdentifier]);
  }
  return (
    <article className="cession-card">
      <div className="cession-card-heading">
        <h4>{operation.beneficiary}</h4>
        <span>{lots.length} lotes</span>
      </div>
      <p>{operation.purpose}</p>
      <ul>
        {[...blocks].sort().map(([block, numbers]) => (
          <li key={block}>
            <strong>{block}</strong> ·{' '}
            {numbers.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).join(', ')}
          </li>
        ))}
      </ul>
      <div className="cession-card-footer">
        <small>{query.isError ? 'Documento indisponível para consulta' : documentStatus(query.data)}</small>
        <Button variant="outline" onClick={onOpen}>
          <FileText size={16} />
          Consultar operação
        </Button>
      </div>
    </article>
  );
}

export function CessionCategory({
  lots,
  canManageContracts,
  onLocate,
}: {
  lots: CommercialLot[];
  canManageContracts: boolean;
  onLocate: (entityId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const operations = useMemo(() => {
    const groups = new Map<string, CommercialLot[]>();
    for (const lot of lots)
      if (!lot.archivedAt && lot.cession?.id) {
        const group = groups.get(lot.cession.id) ?? [];
        group.push(lot);
        groups.set(lot.cession.id, group);
      }
    return [...groups].sort((a, b) =>
      a[1][0].cession!.beneficiary.localeCompare(b[1][0].cession!.beneficiary),
    );
  }, [lots]);
  return (
    <section className="cession-category">
      <h2>Vendas não comercializáveis</h2>
      <p>
        {operations.length} operações · {operations.reduce((n, [, group]) => n + group.length, 0)} lotes · R$
        0,00
      </p>
      <h3>Lotes não comercializáveis</h3>
      <div className="cession-cards">
        {operations.map(([id, group]) => (
          <OperationRow
            key={id}
            operation={{ ...group[0].cession!, id }}
            lots={group}
            canManageContracts={canManageContracts}
            onOpen={() => setSelected(id)}
          />
        ))}
      </div>
      {selected && (
        <CessionContract
          id={selected}
          canManageContracts={canManageContracts}
          onClose={() => setSelected(null)}
          onLocate={onLocate}
        />
      )}
    </section>
  );
}
