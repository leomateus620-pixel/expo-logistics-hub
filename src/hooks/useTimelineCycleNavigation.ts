import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  getClosestCycleYear,
  isCronogramaCycleYear,
  type CronogramaCycleYear,
} from '@/lib/cronograma-cycle';

export type TimelinePositionReason =
  | 'year-select'
  | 'period-control'
  | 'today'
  | 'event-open'
  | 'observer'
  | 'external'
  | 'temporal-filter'
  | 'reconcile';

export interface TimelinePositionChange {
  year: CronogramaCycleYear;
  month: string | null;
  reason: TimelinePositionReason;
  replace: boolean;
}

interface TimelineNavigationState {
  selectedYear: CronogramaCycleYear;
  focusedMonth: string | null;
  expandedMonths: Record<string, boolean>;
}

type TimelineNavigationAction =
  | { type: 'focus'; year: CronogramaCycleYear; month: string | null; expand?: boolean; expandMonths?: string[] }
  | { type: 'observe'; year: CronogramaCycleYear; month: string | null }
  | { type: 'toggle-month'; month: string };

interface TimelineNavigationOptions {
  monthKeys: string[];
  firstMonthByYear: Record<CronogramaCycleYear, string | null>;
  availableYears: CronogramaCycleYear[];
  initialMonth: string | null;
  requestedYear: CronogramaCycleYear | null;
  requestedMonth: string | null;
  todayKey: string;
  temporalFocusKey: string;
  preferredTemporalYear: CronogramaCycleYear | null;
  onPositionChange?: (change: TimelinePositionChange) => void;
}

function yearFromMonth(month: string | null | undefined): CronogramaCycleYear | null {
  if (!month) return null;
  const year = Number(month.slice(0, 4));
  return isCronogramaCycleYear(year) ? year : null;
}

function reducer(state: TimelineNavigationState, action: TimelineNavigationAction): TimelineNavigationState {
  if (action.type === 'toggle-month') {
    return {
      ...state,
      expandedMonths: {
        ...state.expandedMonths,
        [action.month]: !(state.expandedMonths[action.month] ?? false),
      },
    };
  }

  const next = {
    ...state,
    selectedYear: action.year,
    focusedMonth: action.month,
  };

  if (action.type === 'focus' && (action.expand || action.expandMonths?.length)) {
    const expanded = { ...state.expandedMonths };
    if (action.expand && action.month) expanded[action.month] = true;
    action.expandMonths?.forEach((month) => { expanded[month] = true; });
    next.expandedMonths = expanded;
  }

  if (
    state.selectedYear === next.selectedYear
    && state.focusedMonth === next.focusedMonth
    && next.expandedMonths === state.expandedMonths
  ) return state;

  return next;
}

function focusKey(year: CronogramaCycleYear, month: string | null) {
  return month ? `month:${month}` : `year:${year}`;
}

function resolveAvailableYear(
  preferred: CronogramaCycleYear,
  availableYears: CronogramaCycleYear[],
) {
  if (!availableYears.length || availableYears.includes(preferred)) return preferred;
  return availableYears
    .slice()
    .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred))[0];
}

/**
 * Foco temporal: qualquer ano do ciclo (2026/2027/2028) é válido para foco,
 * mesmo sem eventos — o stream renderiza um placeholder próprio para anos vazios.
 * Só cai no vizinho mais próximo se o ano pedido sair da janela do ciclo
 * (proteção contra URL corrompida).
 */
function resolveFocusYear(
  preferred: CronogramaCycleYear,
  availableYears: CronogramaCycleYear[],
) {
  if (isCronogramaCycleYear(preferred)) return preferred;
  return resolveAvailableYear(preferred, availableYears);
}

function resolveDesiredMonth(options: TimelineNavigationOptions, selectedYear: CronogramaCycleYear) {
  const requestedMonthYear = yearFromMonth(options.requestedMonth);
  const requestedMonth = requestedMonthYear === selectedYear ? options.requestedMonth : null;
  const initialMonth = yearFromMonth(options.initialMonth) === selectedYear ? options.initialMonth : null;
  return requestedMonth ?? initialMonth ?? options.firstMonthByYear[selectedYear] ?? null;
}

/** Meses que devem nascer expandidos: o mês em foco e sempre o mês corrente (quando tem eventos). */
function resolveExpandedMonths(options: TimelineNavigationOptions, month: string | null) {
  const expanded: Record<string, boolean> = {};
  if (month && options.monthKeys.includes(month)) expanded[month] = true;
  const currentMonth = options.todayKey.slice(0, 7);
  if (options.monthKeys.includes(currentMonth)) expanded[currentMonth] = true;
  return expanded;
}

function resolveInitialState(options: TimelineNavigationOptions): TimelineNavigationState {
  const requestedMonthYear = yearFromMonth(options.requestedMonth);
  let selectedYear = options.requestedYear
    ?? requestedMonthYear
    ?? yearFromMonth(options.initialMonth)
    ?? getClosestCycleYear(options.todayKey);

  selectedYear = resolveFocusYear(selectedYear, options.availableYears);

  const month = resolveDesiredMonth(options, selectedYear);

  return {
    selectedYear,
    focusedMonth: month,
    expandedMonths: resolveExpandedMonths(options, month),
  };
}

export function useTimelineCycleNavigation(options: TimelineNavigationOptions) {
  const [state, dispatch] = useReducer(reducer, options, resolveInitialState);
  const focusNodes = useRef(new Map<string, HTMLElement>());
  const visibleRatios = useRef(new Map<string, number>());
  const programmaticTarget = useRef<{ key: string; token: number } | null>(null);
  const releaseTimer = useRef<number | null>(null);
  const frameIds = useRef<number[]>([]);
  const token = useRef(0);
  const positionedInitially = useRef(false);
  // Enquanto o usuário não navegar, o foco acompanha o mês inicial calculado
  // (que prioriza o mês corrente) — os dados chegam de forma assíncrona e o
  // primeiro foco pode ter sido definido com a lista ainda incompleta.
  const userNavigated = useRef(false);
  const initialMonthRef = useRef(options.initialMonth);
  const onPositionChangeRef = useRef(options.onPositionChange);
  const requestedSignatureRef = useRef('');
  const contextRef = useRef({
    months: options.monthKeys.join('|'),
    available: options.availableYears.join('|'),
    temporal: options.temporalFocusKey,
  });


  useEffect(() => {
    onPositionChangeRef.current = options.onPositionChange;
  }, [options.onPositionChange]);

  const clearProgrammaticTarget = useCallback(() => {
    programmaticTarget.current = null;
    frameIds.current.forEach((frame) => window.cancelAnimationFrame(frame));
    frameIds.current = [];
    if (releaseTimer.current !== null) {
      window.clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
    }
  }, []);

  const registerFocusNode = useCallback((key: string, node: HTMLElement | null) => {
    if (node) focusNodes.current.set(key, node);
    else focusNodes.current.delete(key);
  }, []);

  const scrollToFocus = useCallback((year: CronogramaCycleYear, month: string | null, immediate = false) => {
    clearProgrammaticTarget();
    const key = focusKey(year, month);
    const currentToken = ++token.current;
    programmaticTarget.current = { key, token: currentToken };

    const run = () => {
      frameIds.current = [];
      const node = focusNodes.current.get(key);
      if (programmaticTarget.current?.token !== currentToken) return;
      if (!node) {
        releaseTimer.current = window.setTimeout(() => {
          if (programmaticTarget.current?.token === currentToken) clearProgrammaticTarget();
        }, 120);
        return;
      }
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      node.scrollIntoView({
        behavior: immediate || reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      releaseTimer.current = window.setTimeout(
        () => {
          if (programmaticTarget.current?.token === currentToken) clearProgrammaticTarget();
        },
        immediate || reduceMotion ? 80 : 900,
      );
    };

    const firstFrame = window.requestAnimationFrame(() => {
      if (programmaticTarget.current?.token !== currentToken) return;
      const secondFrame = window.requestAnimationFrame(run);
      frameIds.current = [secondFrame];
    });
    frameIds.current = [firstFrame];
  }, [clearProgrammaticTarget]);

  const commitFocus = useCallback((
    year: CronogramaCycleYear,
    month: string | null,
    reason: TimelinePositionReason,
    { notify = true, replace = true, immediate = false }: { notify?: boolean; replace?: boolean; immediate?: boolean } = {},
  ) => {
    const currentMonth = options.todayKey.slice(0, 7);
    dispatch({
      type: 'focus',
      year,
      month,
      expand: Boolean(month && options.monthKeys.includes(month)),
      expandMonths: options.monthKeys.includes(currentMonth) ? [currentMonth] : undefined,
    });
    if (notify) onPositionChangeRef.current?.({ year, month, reason, replace });
    scrollToFocus(year, month, immediate);
  }, [options.monthKeys, options.todayKey, scrollToFocus]);

  const selectYear = useCallback((year: CronogramaCycleYear) => {
    userNavigated.current = true;
    commitFocus(year, options.firstMonthByYear[year], 'year-select', { replace: false });
  }, [commitFocus, options.firstMonthByYear]);

  const goToMonth = useCallback((month: string, reason: TimelinePositionReason = 'period-control') => {
    const year = yearFromMonth(month);
    if (!year) return;
    userNavigated.current = true;
    commitFocus(year, month, reason, { replace: false });
  }, [commitFocus]);

  const goToToday = useCallback(() => {
    const year = getClosestCycleYear(options.todayKey);
    const currentYear = yearFromMonth(options.todayKey.slice(0, 7));
    const month = currentYear === year ? options.todayKey.slice(0, 7) : options.firstMonthByYear[year];
    userNavigated.current = true;
    commitFocus(year, month, 'today', { replace: false });
  }, [commitFocus, options.firstMonthByYear, options.todayKey]);

  const reflectEventMonth = useCallback((month: string) => {
    const year = yearFromMonth(month);
    if (!year) return;
    userNavigated.current = true;
    dispatch({ type: 'focus', year, month, expand: true });
    onPositionChangeRef.current?.({ year, month, reason: 'event-open', replace: true });
  }, []);

  const adjacentMonths = useMemo(() => {

    if (!options.monthKeys.length) return { previous: null, next: null };
    if (state.focusedMonth && options.monthKeys.includes(state.focusedMonth)) {
      const index = options.monthKeys.indexOf(state.focusedMonth);
      return {
        previous: options.monthKeys[index - 1] ?? null,
        next: options.monthKeys[index + 1] ?? null,
      };
    }

    const comparison = state.focusedMonth ?? `${state.selectedYear}-01`;
    const nextIndex = options.monthKeys.findIndex((month) => month > comparison);
    return {
      previous: nextIndex === -1 ? options.monthKeys.at(-1) ?? null : options.monthKeys[nextIndex - 1] ?? null,
      next: nextIndex === -1 ? null : options.monthKeys[nextIndex] ?? null,
    };
  }, [options.monthKeys, state.focusedMonth, state.selectedYear]);

  const toggleMonth = useCallback((month: string) => {
    dispatch({ type: 'toggle-month', month });
  }, []);

  useEffect(() => {
    const cancelForUserNavigation = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        const navigationKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
        if (!navigationKeys.includes(event.key)) return;
      }
      clearProgrammaticTarget();
    };

    window.addEventListener('wheel', cancelForUserNavigation, { passive: true });
    window.addEventListener('touchstart', cancelForUserNavigation, { passive: true });
    window.addEventListener('pointerdown', cancelForUserNavigation, { passive: true });
    window.addEventListener('keydown', cancelForUserNavigation);
    return () => {
      window.removeEventListener('wheel', cancelForUserNavigation);
      window.removeEventListener('touchstart', cancelForUserNavigation);
      window.removeEventListener('pointerdown', cancelForUserNavigation);
      window.removeEventListener('keydown', cancelForUserNavigation);
    };
  }, [clearProgrammaticTarget]);

  const observableKey = [
    ...options.monthKeys.map((month) => `month:${month}`),
    focusKey(state.selectedYear, state.focusedMonth),
  ].filter((value, index, values) => values.indexOf(value) === index).join('|');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    visibleRatios.current.clear();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const key = (entry.target as HTMLElement).dataset.focusKey;
        if (!key) return;
        if (entry.isIntersecting) visibleRatios.current.set(key, entry.intersectionRatio);
        else visibleRatios.current.delete(key);
      });

      if (programmaticTarget.current) return;
      const visible = Array.from(visibleRatios.current.entries()).sort((a, b) => b[1] - a[1])[0];
      if (!visible) return;

      const [kind, value] = visible[0].split(':');
      const month = kind === 'month' ? value : null;
      const year = kind === 'month' ? yearFromMonth(value) : Number(value);
      if (!isCronogramaCycleYear(year)) return;
      // Anti-loop: se o foco visível já corresponde ao estado atual, não redespachar
      // (evita cadeia observer → URL → effect de deep-link → commitFocus a cada frame).
      if (year === state.selectedYear && month === state.focusedMonth) return;
      userNavigated.current = true;
      dispatch({ type: 'observe', year, month });
      onPositionChangeRef.current?.({ year, month, reason: 'observer', replace: true });
    }, {
      rootMargin: '-34% 0px -54% 0px',
      threshold: [0.12, 0.32, 0.56],
    });

    observableKey.split('|').filter(Boolean).forEach((key) => {
      const node = focusNodes.current.get(key);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [observableKey]);

  useEffect(() => {
    if (positionedInitially.current) return;
    positionedInitially.current = true;
    scrollToFocus(state.selectedYear, state.focusedMonth, true);
  }, [scrollToFocus, state.focusedMonth, state.selectedYear]);

  useEffect(() => {
    const signature = `${options.requestedYear ?? ''}|${options.requestedMonth ?? ''}`;
    if (signature === requestedSignatureRef.current) return;
    requestedSignatureRef.current = signature;

    const requestedMonthYear = yearFromMonth(options.requestedMonth);
    const requestedYear = options.requestedYear ?? requestedMonthYear;
    if (!requestedYear) return;
    userNavigated.current = true;
    const year = resolveFocusYear(requestedYear, options.availableYears);
    const month = requestedMonthYear === year
      ? options.requestedMonth
      : options.firstMonthByYear[year];
    const reconciled = year !== requestedYear;
    if (year === state.selectedYear && month === state.focusedMonth) {
      if (reconciled) {
        onPositionChangeRef.current?.({ year, month, reason: 'reconcile', replace: true });
      }
      return;
    }
    commitFocus(year, month, reconciled ? 'reconcile' : 'external', {
      notify: reconciled,
      immediate: true,
    });
  }, [
    commitFocus,
    options.availableYears,
    options.firstMonthByYear,
    options.requestedMonth,
    options.requestedYear,
    state.focusedMonth,
    state.selectedYear,
  ]);

  const monthSignature = options.monthKeys.join('|');
  const availableSignature = options.availableYears.join('|');
  useEffect(() => {
    const previous = contextRef.current;
    const temporalChanged = previous.temporal !== options.temporalFocusKey;
    const monthsChanged = previous.months !== monthSignature;
    const availableChanged = previous.available !== availableSignature;
    contextRef.current = {
      temporal: options.temporalFocusKey,
      months: monthSignature,
      available: availableSignature,
    };

    // Os eventos chegam de forma assíncrona: enquanto o usuário não navegar,
    // o foco acompanha o mês inicial recalculado (que prioriza o mês corrente).
    const initialMonthChanged = initialMonthRef.current !== options.initialMonth;
    initialMonthRef.current = options.initialMonth;
    if (initialMonthChanged && !userNavigated.current && options.initialMonth) {
      const year = resolveFocusYear(
        yearFromMonth(options.initialMonth) ?? getClosestCycleYear(options.todayKey),
        options.availableYears,
      );
      const month = resolveDesiredMonth(options, year);
      if (year !== state.selectedYear || month !== state.focusedMonth) {
        commitFocus(year, month, 'reconcile', { notify: false, immediate: true });
        return;
      }
    }




    if (temporalChanged) {
      const year = options.preferredTemporalYear ?? yearFromMonth(options.initialMonth);
      if (year) {
        const month = options.preferredTemporalYear
          ? options.firstMonthByYear[year]
          : options.initialMonth;
        commitFocus(year, month, 'temporal-filter', { immediate: true });
      }
      return;
    }

    // Só reconciliar se o ano atual saiu completamente da janela do ciclo (2026-2028).
    // Anos vazios continuam válidos para foco — o stream renderiza placeholder próprio.
    if (availableChanged && !isCronogramaCycleYear(state.selectedYear)) {
      const year = resolveFocusYear(state.selectedYear, options.availableYears);
      commitFocus(year, options.firstMonthByYear[year], 'reconcile', { immediate: true });
      return;
    }

    if (!monthsChanged || (state.focusedMonth && options.monthKeys.includes(state.focusedMonth))) return;
    const month = options.firstMonthByYear[state.selectedYear];
    if (month === state.focusedMonth) return;
    commitFocus(state.selectedYear, month, 'reconcile', { immediate: true });
  }, [
    availableSignature,
    commitFocus,
    monthSignature,
    options,
    options.availableYears,
    options.firstMonthByYear,
    options.initialMonth,
    options.monthKeys,
    options.preferredTemporalYear,
    options.temporalFocusKey,
    state.focusedMonth,
    state.selectedYear,
  ]);

  useEffect(() => () => clearProgrammaticTarget(), [clearProgrammaticTarget]);

  return {
    selectedYear: state.selectedYear,
    focusedMonth: state.focusedMonth,
    expandedMonths: state.expandedMonths,
    previousMonth: adjacentMonths.previous,
    nextMonth: adjacentMonths.next,
    selectYear,
    goToMonth,
    goToToday,
    reflectEventMonth,
    toggleMonth,
    registerFocusNode,
  };
}
