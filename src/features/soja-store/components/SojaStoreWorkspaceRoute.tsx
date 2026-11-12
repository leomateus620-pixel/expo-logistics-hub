import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { useSojaStoreAccess } from '../hooks/useSojaStoreAccess';
import { canOpenSojaStoreSection, SOJA_STORE_SECTIONS, type SojaStoreSection } from '../navigation';

const SojaStorePage = lazy(() => import('../pages/SojaStorePage'));

type Props = {
  section: SojaStoreSection;
  commissionId: string | null;
  identityLoading: boolean;
  accessQuery: Pick<ReturnType<typeof useSojaStoreAccess>, 'data' | 'isError' | 'isLoading' | 'refetch'>;
};

export function SojaStoreWorkspaceRoute({ section, commissionId, identityLoading, accessQuery }: Props) {
  const { detailId } = useParams();
  const title = SOJA_STORE_SECTIONS[section].label;
  const loading = <p className="px-4 py-8" role="status">Carregando {title.toLocaleLowerCase('pt-BR')}…</p>;

  if ((!commissionId && identityLoading) || accessQuery.isLoading) return loading;

  if (accessQuery.isError) {
    return (
      <section className="ws-panel grid justify-items-start gap-3 p-5" aria-labelledby="soja-access-title">
        <h1 id="soja-access-title" className="text-lg font-semibold">{title}</h1>
        <p role="alert">Não foi possível verificar o acesso a esta área.</p>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => void accessQuery.refetch()}>Tentar novamente</Button>
      </section>
    );
  }

  const access = accessQuery.data;
  if (!commissionId || !access?.enabled || !canOpenSojaStoreSection(access, section)) {
    return (
      <section className="ws-panel grid gap-3 p-5" aria-labelledby="soja-access-title">
        <h1 id="soja-access-title" className="text-lg font-semibold">{title}</h1>
        <p>{access?.enabled ? 'Seu perfil não tem acesso a esta área da Soja Store.' : 'Esta área da Soja Store ainda não está habilitada nesta organização.'}</p>
      </section>
    );
  }

  return (
    <Suspense fallback={loading}>
      <SojaStorePage key={`${commissionId}:${section}:${detailId ?? ''}`} section={section} commissionId={commissionId} detailId={detailId} access={access} />
    </Suspense>
  );
}
