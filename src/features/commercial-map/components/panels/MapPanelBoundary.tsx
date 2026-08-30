import { Component, type ReactNode } from 'react';

/** A failed detail widget must never take the persistent map down with it. */
export class MapPanelBoundary extends Component<{
  resetKey: string;
  children: ReactNode;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: Readonly<{ resetKey: string; children: ReactNode }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <aside className="commercial-map-panel commercial-map-details-panel commercial-map-details-skeleton" role="status">
        <div className="commercial-map-panel-header">
          <div><span>Estrutura selecionada</span><h2>Detalhes indisponíveis</h2></div>
        </div>
        <p>O mapa continua disponível. Você pode navegar ou selecionar outra estrutura.</p>
        <button type="button" onClick={() => this.setState({ failed: false })}>Tentar novamente</button>
      </aside>
    );
  }
}
