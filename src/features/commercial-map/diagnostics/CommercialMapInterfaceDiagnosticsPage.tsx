import CommercialMapPage from '../CommercialMapPage';
import { CommercialMapShell } from '../components/shell/CommercialMapShell';
import { OFFICIAL_REFERENCE_DATA } from '../data/officialReference2026';
import { presentCommercialMapData } from '../hooks/useCommercialMap';

// DEV-only route: same UI, official reference fixture, read-only permissions.
const PREVIEW_DATA = presentCommercialMapData(OFFICIAL_REFERENCE_DATA);
export default function CommercialMapInterfaceDiagnosticsPage() {
  return <CommercialMapShell><CommercialMapPage previewData={PREVIEW_DATA} /></CommercialMapShell>;
}
