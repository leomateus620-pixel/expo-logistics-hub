export type PortalAccessState = 'group' | 'login' | 'setup' | 'allowed' | 'denied' | 'loading';

export interface PortalAccessPresentation {
  state: PortalAccessState;
  label: string;
  detail?: string;
  target?: string;
}
