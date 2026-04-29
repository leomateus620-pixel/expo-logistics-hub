import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Loader2, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PlaceResult {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  city: string;
}

interface PlacesAutocompleteProps {
  value: string;
  onSelect: (place: PlaceResult) => void;
  placeholder?: string;
}

export default function PlacesAutocomplete({ value, onSelect, placeholder = 'Buscar destino...' }: PlacesAutocompleteProps) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState(!!value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync external value
  useEffect(() => {
    if (value && !query) {
      setQuery(value);
      setSelected(true);
    }
  }, [value]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('places-autocomplete', {
        body: { query: q },
      });
      if (error) throw error;
      setResults(data?.results || []);
      setShowDropdown(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (val: string) => {
    setQuery(val);
    setSelected(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (place: PlaceResult) => {
    setQuery(place.name);
    setSelected(true);
    setShowDropdown(false);
    setResults([]);
    onSelect(place);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (results.length > 0 && !selected) setShowDropdown(true); }}
          placeholder={placeholder}
          className="pl-8 pr-8"
        />
        {loading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />}
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-60 overflow-y-auto">
          {results.length === 0 && !loading && query.length >= 2 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum resultado encontrado</p>
          )}
          {results.map((r) => (
            <button
              key={r.place_id}
              type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-accent/50 flex items-start gap-2 border-b last:border-b-0 transition-colors"
              onClick={() => handleSelect(r)}
            >
              <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground truncate">{r.address}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
