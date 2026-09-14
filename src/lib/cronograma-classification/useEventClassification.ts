import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CronogramaCategory, CronogramaKind } from '@/components/cronograma-eventos/types';
import { classifyEvent, type EventClassification, type EventClassificationInput } from './engine';

const DEBOUNCE_MS = 450;

export interface UseEventClassificationOptions {
  input: EventClassificationInput;
  /** Automation starts frozen when reopening a saved event. */
  enabled: boolean;
  onSuggest: (suggestion: { category?: CronogramaCategory; kind?: CronogramaKind }) => void;
}

export interface EventClassificationState {
  suggestion: EventClassification | null;
  categoryAuto: boolean;
  kindAuto: boolean;
  markCategoryManual: () => void;
  markKindManual: () => void;
  resumeCategoryAuto: () => void;
  resumeKindAuto: () => void;
  /** Edition-only action: apply the current suggestion to both fields. */
  applySuggestion: () => void;
}

/**
 * Debounced, purely local classification. Never blocks typing, never touches
 * status/priority and never overwrites a field the user changed by hand.
 */
export function useEventClassification({
  input,
  enabled,
  onSuggest,
}: UseEventClassificationOptions): EventClassificationState {
  const [suggestion, setSuggestion] = useState<EventClassification | null>(null);
  const [categoryAuto, setCategoryAuto] = useState(enabled);
  const [kindAuto, setKindAuto] = useState(enabled);
  const onSuggestRef = useRef(onSuggest);
  onSuggestRef.current = onSuggest;

  const signature = useMemo(() => JSON.stringify([
    input.title ?? '',
    input.summary ?? '',
    input.description ?? '',
    (input.commissions ?? []).filter(Boolean),
    (input.people ?? []).filter(Boolean),
    input.owner ?? '',
    input.location ?? '',
  ]), [input]);

  const latestInput = useRef(input);
  latestInput.current = input;

  useEffect(() => {
    const hasContent = Boolean((latestInput.current.title ?? '').trim());
    if (!hasContent) {
      setSuggestion(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const next = classifyEvent(latestInput.current);
      setSuggestion(next);
      if (import.meta.env.DEV) {
        // Observability limited to development.
        console.debug('[classificação]', {
          title: latestInput.current.title,
          category: next.category,
          kind: next.kind,
        });
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [signature]);

  useEffect(() => {
    if (!suggestion) return;
    const patch: { category?: CronogramaCategory; kind?: CronogramaKind } = {};
    if (categoryAuto) patch.category = suggestion.category.value;
    if (kindAuto) patch.kind = suggestion.kind.value;
    if (patch.category || patch.kind) onSuggestRef.current(patch);
  }, [suggestion, categoryAuto, kindAuto]);

  const applySuggestion = useCallback(() => {
    const next = classifyEvent(latestInput.current);
    setSuggestion(next);
    setCategoryAuto(true);
    setKindAuto(true);
    onSuggestRef.current({ category: next.category.value, kind: next.kind.value });
  }, []);

  return {
    suggestion,
    categoryAuto,
    kindAuto,
    markCategoryManual: useCallback(() => setCategoryAuto(false), []),
    markKindManual: useCallback(() => setKindAuto(false), []),
    resumeCategoryAuto: useCallback(() => {
      setCategoryAuto(true);
      const next = classifyEvent(latestInput.current);
      setSuggestion(next);
      onSuggestRef.current({ category: next.category.value });
    }, []),
    resumeKindAuto: useCallback(() => {
      setKindAuto(true);
      const next = classifyEvent(latestInput.current);
      setSuggestion(next);
      onSuggestRef.current({ kind: next.kind.value });
    }, []),
    applySuggestion,
  };
}
