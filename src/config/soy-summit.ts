/** Confirmed by the event brief. Never reinterpret this instant in device time. */
export const SOY_SUMMIT = {
  id: 'soy-summit-2027',
  title: 'SOY SUMMIT 2027',
  timeZone: 'America/Sao_Paulo',
  startsAt: '2027-04-20T07:30:00-03:00',
  startsAtUTC: '2027-04-20T10:30:00Z',
  venue: 'Centro Cívico Cultural Antônio Carlos Borges',
  city: 'Santa Rosa/RS',
} as const;

export const SOY_SUMMIT_ROUTE = '/comissoes/soy-summit/centro-civico-3d';
export const SOY_SUMMIT_HOME = '/comissoes/soy-summit/dashboard';
export const SOY_SUMMIT_DATE_LABEL = `${new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: SOY_SUMMIT.timeZone,
}).format(new Date(SOY_SUMMIT.startsAt))} • ${new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: SOY_SUMMIT.timeZone,
}).format(new Date(SOY_SUMMIT.startsAt)).replace(':', 'h')}`;

/** Also consumed by the deterministic asset exporter. No graphics dependency. */
export const SOY_SUMMIT_IDENTITY = {
  cream: '#f5f1e5', green: '#073d32', gold: '#d8a52d', curve: '#e8e8cf',
  goldLight: '#fff1b3', goldDark: '#a26b18', cardShadow: '#021e19',
  displayFont: 'Archivo Black', bodyFont: 'Hind', transitionMs: 180,
  mark: '/alvorada/fenasoja-symbol-official.png',
} as const;
