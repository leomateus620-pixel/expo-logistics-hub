import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SOJA_STORE_UNIT } from '../navigation';

export function SojaStoreRouteNotice({ imports = false }: { imports?: boolean }) {
  return (
    <section className="ws-panel grid justify-items-start gap-3 p-5" aria-labelledby="soja-route-title">
      <h1 id="soja-route-title" className="text-lg font-semibold">
        {imports ? 'Importações' : 'Página da loja indisponível'}
      </h1>
      <p>
        {imports
          ? 'Importações não fazem parte da operação da Soja Store.'
          : 'Confira o endereço ou abra uma das áreas disponíveis no menu.'}
      </p>
      <Button asChild variant="outline" className="min-h-11">
        <Link to={`/comissoes/${SOJA_STORE_UNIT}/dashboard`}>Voltar à visão geral</Link>
      </Button>
    </section>
  );
}
