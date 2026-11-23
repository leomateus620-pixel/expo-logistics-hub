import CommercialMapPage from '../CommercialMapPage';
import { CommercialMapShell } from '../components/shell/CommercialMapShell';
import { DIAGNOSTICS_MAP_DATA } from './commercialMapDiagnosticsData';

// DEV-only route: same UI, official reference fixture, read-only permissions.
export default function CommercialMapInterfaceDiagnosticsPage() {
  return <CommercialMapShell><CommercialMapPage previewData={DIAGNOSTICS_MAP_DATA}
    previewWebGLUnavailable={new URLSearchParams(window.location.search).get('webgl') === 'unavailable'} /></CommercialMapShell>;
}
