import CommercialMapWorkspace from '@/features/commercial-map/CommercialMapPage';
import { CommercialMapShell } from '@/features/commercial-map/components/shell/CommercialMapShell';

export default function CommercialMapPage() {
  return (
    <CommercialMapShell>
      <CommercialMapWorkspace />
    </CommercialMapShell>
  );
}
