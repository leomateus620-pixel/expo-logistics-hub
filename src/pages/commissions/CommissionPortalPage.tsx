import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import CommissionCard from '@/components/commissions/CommissionCard';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { FenasojaPortalWordmark } from '@/components/portal/FenasojaPortalWordmark';
import { PortalDestinationCard } from '@/components/portal/PortalDestinationCard';
import { PortalPrimaryEntry } from '@/components/portal/PortalPrimaryEntry';
import type { PortalAccessPresentation } from '@/components/portal/portalTypes';
import { useAuth } from '@/hooks/useAuth';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { resolveModuleAccess } from '@/hooks/useModuleAccess';
import {
  SELECTED_COMMISSION_STORAGE_KEY,
  type CommissionModule,
} from '@/modules/commissions/commissionRegistry';
import {
  commercialMapDestination,
  financePortalModule,
  getCommissionDestination,
  getCommissionLoginPath,
  getPortalCommissionModules,
  portalAgendaDestinations,
  portalPrimaryEntries,
  type PortalDestination,
  type PortalEntryId,
} from '@/modules/portal/portalRegistry';
import '@/styles/commission-portal.css';

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
    label: 'Acesso liberado',
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
  const entryButtonRefs = useRef<Partial<Record<PortalEntryId, HTMLButtonElement | null>>>({});
  const commissionModules = useMemo(() => getPortalCommissionModules(), []);
  const accessLoading = authLoading || capabilitiesLoading || orgLoading;
  const moduleAccessContext = { capSet, hasFullAccess, myRole };

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

  const mapAccess = resolveCapabilityAccess(commercialMapDestination);
  const financeAccess = resolveCommissionAccess(financePortalModule);
  const adminAccess = resolveAdminAccess();

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

  const toggleEntry = (entryId: PortalEntryId) => {
    setExpandedEntry((current) => (current === entryId ? null : entryId));
  };

  const getEntryAccess = (entryId: PortalEntryId): PortalAccessPresentation => {
    if (entryId === 'agenda') {
      return {
        state: 'group',
        label: expandedEntry === entryId ? 'Agenda aberta' : 'Explorar agenda',
      };
    }
    if (entryId === 'comissoes') {
      return {
        state: 'group',
        label: expandedEntry === entryId ? 'Comissões abertas' : 'Ver comissões',
      };
    }
    return entryId === 'mapa-comercial' ? mapAccess : financeAccess;
  };

  const getEntrySelection = (entryId: PortalEntryId) => {
    if (entryId === 'mapa-comercial') return () => saveSelectedModule(commercialMapDestination.storageSlug);
    if (entryId === 'financeiro') return () => saveSelectedModule(financePortalModule.slug);
    return undefined;
  };

  return (
    <div className="fenasoja-portal">
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
          <FenasojaBrand
            className="fenasoja-portal__brand-standard"
            subtitle="Sistema integrado de gestão"
            tone="dark"
          />
          <FenasojaBrand className="fenasoja-portal__brand-compact" compact tone="dark" />

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

        <section className="fenasoja-portal__hero portal-reveal" aria-labelledby="portal-title">
          <div className="fenasoja-portal__hero-frame">
            <FenasojaPortalWordmark />
          </div>
        </section>

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
              {entry.id === 'agenda' && (
                <div className="portal-agenda-grid" aria-label="Destinos da Agenda">
                  {portalAgendaDestinations.map((destination) => (
                    <PortalDestinationCard
                      key={destination.id}
                      destination={destination}
                      access={resolveCapabilityAccess(destination)}
                      onSelect={() => saveSelectedModule(destination.storageSlug)}
                    />
                  ))}
                </div>
              )}

              {entry.id === 'comissoes' && (
                <div className="portal-commissions-panel">
                  <div className="portal-commissions-panel__intro">
                    <div>
                      <span>Frentes registradas</span>
                      <p>Disponibilidade operacional e permissão são apresentadas separadamente.</p>
                    </div>
                    <strong>{commissionModules.length}</strong>
                  </div>
                  <div className="portal-commissions-grid" aria-label="Comissões disponíveis no portal">
                    {commissionModules.map((module, moduleIndex) => (
                      <CommissionCard
                        key={module.slug}
                        module={module}
                        index={moduleIndex}
                        access={resolveCommissionAccess(module)}
                        onSelect={() => saveSelectedModule(module.slug)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </PortalPrimaryEntry>
          ))}
        </nav>

        <footer className="fenasoja-portal__footer portal-reveal">
          <ShieldCheck aria-hidden="true" />
          <span>Autenticação, organização e permissões validadas em cada destino.</span>
        </footer>
      </main>
    </div>
  );
}
