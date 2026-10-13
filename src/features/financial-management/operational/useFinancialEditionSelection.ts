import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  readStoredEdition,
  resolveFinancialEdition,
  storeEdition,
  type FinancialEditionCode,
} from './financialEditionSelection';

/** A sidebar e o conteúdo financeiro compartilham a edição da URL e desta aba. */
export function useFinancialEditionSelection({
  canonicalize = true,
  enabled = true,
}: {
  canonicalize?: boolean;
  enabled?: boolean;
} = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const edition = resolveFinancialEdition(location.search, readStoredEdition());

  useEffect(() => {
    if (!enabled) return;
    storeEdition(edition);
    if (!canonicalize) return;
    const params = new URLSearchParams(location.search);
    if (params.get('edicao') === edition) return;
    params.set('edicao', edition);
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true });
  }, [canonicalize, edition, enabled, location.hash, location.pathname, location.search, navigate]);

  const changeEdition = useCallback((code: FinancialEditionCode) => {
    if (!enabled || code === edition) return;
    storeEdition(code);
    const params = new URLSearchParams(location.search);
    params.set('edicao', code);
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: false });
  }, [edition, enabled, location.hash, location.pathname, location.search, navigate]);

  return { edition, changeEdition };
}
