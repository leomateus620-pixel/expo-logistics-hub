import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { listExhibitors, matchesExhibitor, type CommercialExhibitor } from '../exhibitorService';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (exhibitor: CommercialExhibitor) => void;
}

export function ExhibitorBookDialog({ open, onOpenChange, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const list = useQuery({
    queryKey: ['commercial-map', 'exhibitors'],
    queryFn: listExhibitors,
    enabled: open,
    staleTime: 30_000,
  });
  const filtered = useMemo(() => (list.data ?? []).filter((item) => matchesExhibitor(item, query)), [list.data, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sales-checkout-dialog sales-exhibitor-book sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Expositores cadastrados</DialogTitle>
          <DialogDescription>Busque por nome, CPF/CNPJ, celular ou e-mail.</DialogDescription>
        </DialogHeader>
        <div className="sales-exhibitor-book__search">
          <Search aria-hidden="true" className="h-4 w-4" />
          <Input
            autoFocus
            aria-label="Buscar expositor"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome, documento, celular ou e-mail"
          />
        </div>
        <div className="sales-exhibitor-book__list" role="list">
          {list.isLoading && <p className="sales-exhibitor-book__empty"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
          {list.isError && <p className="sales-exhibitor-book__empty">Não foi possível carregar os cadastros.</p>}
          {!list.isLoading && !list.isError && filtered.length === 0 && (
            <p className="sales-exhibitor-book__empty">{query ? 'Nenhum expositor encontrado.' : 'Nenhum expositor cadastrado ainda.'}</p>
          )}
          {filtered.map((item) => (
            <button
              type="button"
              role="listitem"
              key={item.id}
              className="sales-exhibitor-book__item"
              onClick={() => { onSelect(item); onOpenChange(false); setQuery(''); }}
            >
              <strong>{item.name}</strong>
              <span>{item.documentNumber}{item.phone ? ` · ${item.phone}` : ''}</span>
              {item.email && <span>{item.email}</span>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
