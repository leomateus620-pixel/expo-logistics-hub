import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, MapPin, Navigation, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';

interface PlaceResult {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  city: string;
}

interface PlacesSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (place: PlaceResult) => void;
}

export default function PlacesSearchDialog({ open, onOpenChange, onSelect }: PlacesSearchDialogProps) {
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSearched(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/places-autocomplete`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${session?.access_token || ''}`,
          },
          body: JSON.stringify({ query: q }),
        }
      );
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 350);
  };

  const handleSelect = (place: PlaceResult) => {
    onSelect(place);
    onOpenChange(false);
  };

  const content = (
    <div className="flex flex-col gap-3 px-1">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Digite o nome do local ou cidade..."
          className="pl-10 pr-10 h-12 text-base rounded-xl bg-muted/30 border-border/50 focus-visible:ring-primary/40"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary animate-spin" />}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto max-h-[50vh] min-h-[200px] space-y-1">
        {!searched && !loading && (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Navigation className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Buscar destino</p>
              <p className="text-xs text-muted-foreground mt-1">
                Digite o nome do local, cidade ou endereço
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div className="space-y-2 py-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-start gap-3 px-3 py-3">
                <Skeleton className="w-5 h-5 rounded-full mt-0.5 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {searched && !loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
            <MapPin className="w-8 h-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Nenhum resultado encontrado</p>
            <p className="text-xs text-muted-foreground/70">Tente outro nome ou endereço</p>
          </div>
        )}

        {!loading && results.map((r) => (
          <button
            key={r.place_id}
            type="button"
            className="w-full text-left px-3 py-3 rounded-xl hover:bg-primary/5 active:bg-primary/10 flex items-start gap-3 transition-colors group"
            onClick={() => handleSelect(r)}
          >
            <div className="w-9 h-9 rounded-full bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center shrink-0 mt-0.5 transition-colors">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{r.address}</p>
              {r.city && (
                <Badge variant="secondary" className="mt-1.5 text-[10px] h-5 px-2 font-medium">
                  {r.city}
                </Badge>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2 text-base">
              <MapPin className="w-5 h-5 text-primary" />
              Buscar Destino
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="w-5 h-5 text-primary" />
            Buscar Destino
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
