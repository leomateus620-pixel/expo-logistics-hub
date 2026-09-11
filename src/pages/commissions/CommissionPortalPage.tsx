import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowUpRight, LockKeyhole, ShieldCheck, X } from 'lucide-react';
import CommissionCard from '@/components/commissions/CommissionCard';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { FenasojaPortalHero } from '@/components/portal/FenasojaPortalHero';
import { PortalPrimaryEntry } from '@/components/portal/PortalPrimaryEntry';
import type { PortalAccessPresentation } from '@/components/portal/portalTypes';
import { useAuth } from '@/hooks/useAuth';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { resolveModuleAccess } from '@/hooks/useModuleAccess';
import { dismissAlvoradaIntro } from '@/features/alvorada/introSession';
import {
  ECOSYSTEM_CLOSE_LABEL,
  ECOSYSTEM_DIALOG_LABEL,
  ECOSYSTEM_OPEN_LABEL,
  ECOSYSTEM_PREPARING_LABEL,
} from '@/features/alvorada/ecosystemLabels';
import {
  consumeFenasojaCountdownLaunch,
  findFenasojaCountdownReturnFocus,
} from '@/lib/fenasoja-countdown-navigation';
import {
  SELECTED_COMMISSION_STORAGE_KEY,
  type CommissionModule,
} from '@/modules/commissions/commissionRegistry';
import {
  agendaFenasojaDestination,
  agendaVenueDestination,
  commercialMapDestination,
  financePortalModule,
  getCommissionDestination,
  getCommissionLoginPath,
  getPortalCommissionGroups,
  portalPrimaryEntries,
  type PortalDestination,
  type PortalEntryId,
} from '@/modules/portal/portalRegistry';
import { useCommissionPeople } from '@/hooks/useCommissionPeople';
import type { OfficialUnitEntry } from '@/modules/commissions/officialCommissionCatalog';
import { ChevronDown } from 'lucide-react';
import '@/styles/commission-portal.css';
import '@/styles/portal-access-navigation.css';
import '@/styles/portal-commission-groups.css';

const loadEcosystemExperience = () => import('@/features/alvorada/FenasojaEcosystemExperience');
const FenasojaEcosystemExperience = lazy(loadEcosystemExperience);

function saveSelectedModule(slug: string) {
  try {
    localStorage.setItem(SELECTED_COMMISSION_STORAGE_KEY, slug);
  } catch {
    return;
  }
}

function anonymousAccess(target: string): PortalAccessPresentation {
  return {
    state: 'login',
    label: 'Entrar para acessar',
    detail: 'Identificação necessária para continuar.',
    target,
  };
}

function loadingAccess(): PortalAccessPresentation {
  return {
    state: 'loading',
    label: 'Verificando perfil',
    detail: 'Aguarde enquanto confirmamos suas permissões.',
  };
}

function deniedAccess(detail: string): PortalAccessPresentation {
  return {
    state: 'denied',
    label: 'Sem permissão',
    detail,
  };
}

function allowedAccess(target: string): PortalAccessPresentation {
  return {
    state: 'allowed',
    label: 'Disponível para o seu perfil',
    target,
  };
}

function organizationSetupAccess(target: string): PortalAccessPresentation {
  return {
    state: 'setup',
    label: 'Configurar organização',
    detail: 'Conclua a criação da sua organização para continuar.',
    target,
  };
}

export default function CommissionPortalPage() {
  const { user, loading: authLoading } = useAuth();
  const {
    capSet,
    hasCapability,
    hasFullAccess,
    isLoading: capabilitiesLoading,
  } = useCapabilities();
  const { hasOrg, myRole, isLoading: orgLoading } = useCurrentOrg();
  const [expandedEntry, setExpandedEntry] = useState<PortalEntryId | null>(null);
  const [ecosystemOpen, setEcosystemOpen] = useState(false);
  const portalRef = useRef<HTMLDivElement>(null);
  const ecosystemLauncherRef = useRef<HTMLButtonElement>(null);
  const ecosystemSuspenseCloseRef = useRef<HTMLButtonElement>(null);
  const entryButtonRefs = useRef<Partial<Record<PortalEntryId, HTMLButtonElement | null>>>({});
  const pendingEntryPosition = useRef<{ entryId: PortalEntryId; top: number } | null>(null);
  const commissionGroups = useMemo(() => getPortalCommissionGroups(), []);
  const { byUnit, memberUnitSlugs } = useCommissionPeople();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const accessLoading = authLoading || capabilitiesLoading || orgLoading;
  const moduleAccessContext = { capSet, hasFullAccess, myRole, memberUnitSlugs };

  const fallbackPeople = (entry: OfficialUnitEntry) => {
    const role = entry.responsibleRole ?? 'Responsável';
    const names = entry.responsibles && entry.responsibles.length > 0
      ? entry.responsibles
      : [entry.responsible];
    const leads = names.map((name, index) => ({
      id: `${entry.id}-fallback-${index}`,
      name,
      role,
    }));
    return { responsible: leads[0], leads, members: [] };
  };

  const resolveCapabilityAccess = (destination: PortalDestination): PortalAccessPresentation => {
    if (authLoading) return loadingAccess();
    if (!user) return anonymousAccess(destination.loginPath);
    if (accessLoading) return loadingAccess();
    if (!hasOrg) return organizationSetupAccess(destination.route);
    if (hasCapability(destination.capability)) return allowedAccess(destination.route);
    return deniedAccess('Seu perfil ou organização não possui a permissão necessária para este destino.');
  };

  const resolveCommissionAccess = (module: CommissionModule): PortalAccessPresentation => {
    if (authLoading) return loadingAccess();
    if (!user) return anonymousAccess(getCommissionLoginPath(module));
    if (accessLoading) return loadingAccess();
    if (!hasOrg) return organizationSetupAccess(getCommissionDestination(module));

    const { canAccess } = resolveModuleAccess(module, false, moduleAccessContext);
    if (canAccess) return allowedAccess(getCommissionDestination(module));

    return deniedAccess(
      module.sensitive
        ? 'Os dados financeiros permanecem protegidos para perfis expressamente autorizados.'
        : 'Esta frente está registrada, mas o seu perfil não possui acesso ao módulo.',
    );
  };

  const resolveAdminAccess = (): PortalAccessPresentation => {
    if (authLoading) return loadingAccess();
    if (!user) return anonymousAccess('/login/admin');
    if (accessLoading) return loadingAccess();
    if (!hasOrg) return organizationSetupAccess('/admin');
    const { canAccess } = resolveModuleAccess(undefined, true, moduleAccessContext);
    return canAccess
      ? allowedAccess('/admin')
      : deniedAccess('Área administrativa disponível somente para perfis autorizados.');
  };

  const agendaFenasojaAccess = resolveCapabilityAccess(agendaFenasojaDestination);
  const agendaVenueAccess = resolveCapabilityAccess(agendaVenueDestination);
  const mapAccess = resolveCapabilityAccess(commercialMapDestination);
  const financeAccess = resolveCommissionAccess(financePortalModule);
  const adminAccess = resolveAdminAccess();

  useEffect(() => {
    const launchContext = consumeFenasojaCountdownLaunch();
    if (!launchContext) return;

    let focusFrame = 0;
    const scrollFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        window.scrollTo({
          left: launchContext.scrollX,
          top: launchContext.scrollY,
          behavior: 'auto',
        });
        findFenasojaCountdownReturnFocus(launchContext.focusId)?.focus({
          preventScroll: true,
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(scrollFrame);
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
    };
  }, []);

  useEffect(() => {
    if (!expandedEntry) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        entryButtonRefs.current[expandedEntry]?.focus();
        setExpandedEntry(null);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expandedEntry]);

  useLayoutEffect(() => {
    const pending = pendingEntryPosition.current;
    pendingEntryPosition.current = null;
    if (!pending) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const stabilizationDuration = reducedMotion ? 0 : 280;
    const startedAt = performance.now();
    let animationFrame = 0;

    const stabilizeControl = (timestamp = startedAt) => {
      const control = entryButtonRefs.current[pending.entryId];
      if (!control) return;

      const offset = control.getBoundingClientRect().top - pending.top;
      if (Math.abs(offset) > 1) {
        window.scrollBy({ top: offset, left: 0, behavior: 'auto' });
      }

      if (timestamp - startedAt < stabilizationDuration) {
        animationFrame = window.requestAnimationFrame(stabilizeControl);
      }
    };

    stabilizeControl();
    return () => window.cancelAnimationFrame(animationFrame);
  }, [expandedEntry]);

  const toggleEntry = (entryId: PortalEntryId) => {
    const control = entryButtonRefs.current[entryId];
    if (control) {
      pendingEntryPosition.current = {
        entryId,
        top: control.getBoundingClientRect().top,
      };
    }
    setExpandedEntry((current) => (current === entryId ? null : entryId));
  };

  const preloadEcosystem = useCallback(() => {
    void loadEcosystemExperience();
  }, []);

  const openEcosystem = useCallback(() => {
    // The ecosystem takes priority over the embedded intro still playing in
    // the countdown card: the card reveals the countdown and stops rendering.
    dismissAlvoradaIntro();
    preloadEcosystem();
    setEcosystemOpen(true);
  }, [preloadEcosystem]);

  const closeEcosystem = useCallback(() => {
    setEcosystemOpen(false);
    window.requestAnimationFrame(() => {
      ecosystemLauncherRef.current?.focus({ preventScroll: true });
    });
  }, []);

  useLayoutEffect(() => {
    if (!ecosystemOpen) return undefined;

    const portal = portalRef.current;
    const bodyOverflow = document.body.style.overflow;
    const documentOverflow = document.documentElement.style.overflow;
    const documentScrollbarGutter = document.documentElement.style.scrollbarGutter;
    const previousAriaHidden = portal?.getAttribute('aria-hidden');
    const hadInert = portal?.hasAttribute('inert') ?? false;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.scrollbarGutter = 'auto';
    portal?.setAttribute('aria-hidden', 'true');
    portal?.setAttribute('inert', '');

    const focusFrame = window.requestAnimationFrame(() => {
      ecosystemSuspenseCloseRef.current?.focus({ preventScroll: true });
    });

    const containSuspenseKeyboard = (event: KeyboardEvent) => {
      if (document.querySelector('.alvorada-overlay')) return;
      if (event.key === 'Tab') {
        event.preventDefault();
        ecosystemSuspenseCloseRef.current?.focus({ preventScroll: true });
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeEcosystem();
      }
    };

    window.addEventListener('keydown', containSuspenseKeyboard, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', containSuspenseKeyboard, true);
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = documentOverflow;
      document.documentElement.style.scrollbarGutter = documentScrollbarGutter;
      if (previousAriaHidden === null) portal?.removeAttribute('aria-hidden');
      else portal?.setAttribute('aria-hidden', previousAriaHidden);
      if (!hadInert) portal?.removeAttribute('inert');
    };
  }, [ecosystemOpen, closeEcosystem]);

  const getEntryAccess = (entryId: PortalEntryId): PortalAccessPresentation => {
    if (entryId === 'comissoes') {
      return {
        state: 'group',
        label: 'Grupo de comissões operacionais',
      };
    }
    if (entryId === 'agenda-fenasoja') return agendaFenasojaAccess;
    if (entryId === 'agenda-restaurante-arena') return agendaVenueAccess;
    return entryId === 'mapa-comercial' ? mapAccess : financeAccess;
  };

  const getEntrySelection = (entryId: PortalEntryId) => {
    if (entryId === 'agenda-fenasoja') {
      return () => saveSelectedModule(agendaFenasojaDestination.storageSlug);
    }
    if (entryId === 'agenda-restaurante-arena') {
      return () => saveSelectedModule(agendaVenueDestination.storageSlug);
    }
    if (entryId === 'mapa-comercial') return () => saveSelectedModule(commercialMapDestination.storageSlug);
    if (entryId === 'financeiro') return () => saveSelectedModule(financePortalModule.slug);
    return undefined;
  };


  return (
    <div ref={portalRef} className="fenasoja-portal">
      <div className="fenasoja-portal__atmosphere" aria-hidden="true">
        <picture>
          <source
            media="(max-width: 900px) and (orientation: portrait)"
            type="image/avif"
            srcSet="/portal/soybean-atmosphere-2028-portrait.avif"
          />
          <source
            media="(max-width: 900px) and (orientation: portrait)"
            type="image/webp"
            srcSet="/portal/soybean-atmosphere-2028-portrait.webp"
          />
          <source
            media="(max-width: 900px) and (orientation: portrait)"
            srcSet="/portal/soybean-atmosphere-2028-portrait.jpg"
          />
          <source type="image/avif" srcSet="/portal/soybean-atmosphere-2028-landscape.avif" />
          <source type="image/webp" srcSet="/portal/soybean-atmosphere-2028-landscape.webp" />
          <img
            src="/portal/soybean-atmosphere-2028-landscape.jpg"
            alt=""
            decoding="async"
          />
        </picture>
      </div>

      <main className="fenasoja-portal__shell">
        <header className="fenasoja-portal__header portal-reveal">
          <h1 className="sr-only">FENASOJA 2028</h1>
          <button
            ref={ecosystemLauncherRef}
            type="button"
            className="fenasoja-portal__alvorada-launcher"
            data-testid="portal-ecosystem-launcher"
            aria-label={ECOSYSTEM_OPEN_LABEL}
            aria-haspopup="dialog"
            aria-expanded={ecosystemOpen}
            onClick={openEcosystem}
            onFocus={preloadEcosystem}
            onPointerEnter={preloadEcosystem}
            onTouchStart={preloadEcosystem}
          >
            <FenasojaBrand
              className="fenasoja-portal__brand-standard"
              subtitle="Sistema integrado de gestão"
              tone="dark"
            />
            <FenasojaBrand className="fenasoja-portal__brand-compact" compact tone="dark" />
          </button>

          {adminAccess.target ? (
            <Link
              to={adminAccess.target}
              onClick={() => saveSelectedModule('admin')}
              className="fenasoja-portal__admin"
              aria-label="Acessar área administrativa"
            >
              <ShieldCheck aria-hidden="true" />
              <span>Administrador</span>
              <ArrowUpRight aria-hidden="true" />
            </Link>
          ) : (
            <div
              className="fenasoja-portal__admin fenasoja-portal__admin--locked"
              aria-label={`Administrador. ${adminAccess.label}. ${adminAccess.detail ?? ''}`}
            >
              <LockKeyhole aria-hidden="true" />
              <span>Administrador</span>
              <span className="fenasoja-portal__admin-status">{adminAccess.label}</span>
            </div>
          )}
        </header>

        <FenasojaPortalHero />

        <p
          className="portal-access-sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {accessLoading ? 'Verificando os acessos disponíveis para o seu perfil.' : ''}
        </p>

        <nav className="fenasoja-portal__hub portal-reveal" aria-label="Áreas do sistema Fenasoja 2028">
          {portalPrimaryEntries.map((entry, index) => (
            <PortalPrimaryEntry
              key={entry.id}
              entry={entry}
              index={index}
              controlRef={entry.kind === 'expandable'
                ? (node) => {
                    entryButtonRefs.current[entry.id] = node;
                  }
                : undefined}
              expanded={expandedEntry === entry.id}
              access={getEntryAccess(entry.id)}
              onToggle={entry.kind === 'expandable' ? () => toggleEntry(entry.id) : undefined}
              onSelect={getEntrySelection(entry.id)}
            >
              {entry.id === 'comissoes' && (
                <div className="portal-commissions-panel">
                  {commissionGroups.map((group) => {
                    const open = !collapsedGroups[group.type];
                    return (
                      <section
                        key={group.type}
                        className="portal-commission-group"
                        data-open={open}
                        aria-label={group.label}
                      >
                        <button
                          type="button"
                          className="portal-commission-group__header"
                          aria-expanded={open}
                          onClick={() => setCollapsedGroups((current) => ({
                            ...current,
                            [group.type]: open,
                          }))}
                        >
                          <span className="portal-commission-group__title">{group.label}</span>
                          <span className="portal-commission-group__count">{group.items.length}</span>
                          <ChevronDown className="portal-commission-group__chevron" aria-hidden="true" />
                        </button>
                        {open && (
                          <div className="portal-commissions-grid" aria-label={`${group.label} disponíveis no portal`}>
                            {group.items.map(({ entry: unit, module }) => {
                              const people = byUnit.get(unit.id) ?? fallbackPeople(unit);
                              return (
                                <CommissionCard
                                  key={unit.id}
                                  module={module}
                                  access={resolveCommissionAccess(module)}
                                  onSelect={saveSelectedModule}
                                  responsible={people.responsible ?? fallbackPeople(unit).responsible}
                                  leads={people.leads}
                                  members={people.members}
                                />
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </PortalPrimaryEntry>
          ))}
        </nav>
      </main>

      {ecosystemOpen && (
        <Suspense
          fallback={createPortal((
            <section
              className="fenasoja-portal__alvorada-suspense"
              role="dialog"
              aria-modal="true"
              aria-label={ECOSYSTEM_DIALOG_LABEL}
            >
              <span aria-hidden="true" />
              <p>{ECOSYSTEM_PREPARING_LABEL}</p>
              <button
                ref={ecosystemSuspenseCloseRef}
                type="button"
                className="fenasoja-portal__alvorada-suspense-close"
                aria-label={ECOSYSTEM_CLOSE_LABEL}
                onClick={closeEcosystem}
              >
                <X aria-hidden="true" />
              </button>
            </section>
          ), document.body)}
        >
          <FenasojaEcosystemExperience onComplete={closeEcosystem} />
        </Suspense>
      )}
    </div>
  );
}
