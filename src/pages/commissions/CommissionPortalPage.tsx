import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import CommissionCard from '@/components/commissions/CommissionCard';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { CronogramaPortalCard } from '@/components/cronograma-eventos/CronogramaPortalCard';
import '@/styles/commission-portal.css';
import {
  SELECTED_COMMISSION_STORAGE_KEY,
  getPublicCommissionModules,
  type CommissionModule,
  type CommissionStatus,
} from '@/modules/commissions/commissionRegistry';

function saveSelectedModule(slug: string) {
  try {
    localStorage.setItem(SELECTED_COMMISSION_STORAGE_KEY, slug);
  } catch {
    return;
  }
}

interface CommissionAccessGroup {
  status: CommissionStatus;
  title: string;
  description: string;
  icon: LucideIcon;
  modules: CommissionModule[];
}

export default function CommissionPortalPage() {
  const navigate = useNavigate();
  const modules = getPublicCommissionModules();
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const gridRef = useRef<HTMLElement>(null);

  const accessGroups: CommissionAccessGroup[] = [
    {
      status: 'active',
      title: 'Disponível agora',
      description: 'Operação habilitada conforme as permissões do seu perfil.',
      icon: CheckCircle2,
      modules: modules.filter((module) => module.status === 'active'),
    },
    {
      status: 'structuring',
      title: 'Em estruturação',
      description: 'Frentes com escopo consultável e ambiente em evolução.',
      icon: Clock3,
      modules: modules.filter((module) => module.status === 'structuring'),
    },
    {
      status: 'restricted',
      title: 'Acesso restrito',
      description: 'Dados sensíveis disponíveis somente para perfis autorizados.',
      icon: LockKeyhole,
      modules: modules.filter((module) => module.status === 'restricted'),
    },
  ];

  const accessModule = (slug: string) => {
    saveSelectedModule(slug);
    navigate(`/login/${slug}`);
  };

  const accessCronograma = () => {
    saveSelectedModule('cronograma-eventos');
    navigate('/login/cronograma-eventos');
  };

  const accessAdmin = () => {
    saveSelectedModule('admin');
    navigate('/login/admin');
  };

  useEffect(() => {
    if (!expandedSlug) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedSlug(null);
    };
    const closeOutside = (event: MouseEvent) => {
      if (gridRef.current && !gridRef.current.contains(event.target as Node)) {
        setExpandedSlug(null);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('mousedown', closeOutside);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('mousedown', closeOutside);
    };
  }, [expandedSlug]);

  return (
    <div className="fenasoja-portal">
      <div className="fenasoja-portal__atmosphere" aria-hidden="true">
        <picture>
          <source
            media="(max-width: 900px) and (orientation: portrait)"
            srcSet="/portal/soybean-atmosphere-portrait.jpg"
          />
          <img
            src="/portal/soybean-atmosphere-landscape.jpg"
            alt=""
            decoding="async"
          />
        </picture>
      </div>

      <main className="fenasoja-portal__shell">
        <header className="fenasoja-portal__header portal-reveal">
          <FenasojaBrand className="fenasoja-portal__brand-standard" subtitle="Sistema integrado de gestão" tone="dark" />
          <FenasojaBrand className="fenasoja-portal__brand-compact" compact tone="dark" />
          <button
            type="button"
            onClick={accessAdmin}
            className="fenasoja-portal__admin"
            aria-label="Acessar área administrativa"
          >
            <ShieldCheck aria-hidden="true" />
            <span className="hidden sm:inline">Administrador</span>
            <span className="sm:hidden">Admin</span>
            <ArrowRight aria-hidden="true" />
          </button>
        </header>

        <section className="fenasoja-portal__hero portal-reveal" aria-labelledby="portal-title">
          <p className="fenasoja-portal__eyebrow">
            <span aria-hidden="true" />
            Portal das comissões · edição 2028
          </p>
          <h1 id="portal-title" className="fenasoja-portal__headline">
            <span>Operação conectada para construir</span>{' '}
            <span className="fenasoja-portal__headline-accent">a próxima Fenasoja.</span>
          </h1>
        </section>

        <section aria-label="Acesso principal ao Cronograma e Eventos" className="fenasoja-portal__primary portal-reveal">
          <CronogramaPortalCard onAccess={accessCronograma} />
        </section>

        <section ref={gridRef} aria-labelledby="commission-list-title" className="fenasoja-portal__commissions portal-reveal">
          <header className="fenasoja-portal__section-header">
            <div>
              <p className="fenasoja-portal__section-kicker">Acessos operacionais</p>
              <h2 id="commission-list-title">Frentes de trabalho</h2>
            </div>
            <p className="fenasoja-portal__profile-note">
              <ShieldCheck aria-hidden="true" />
              Acesso conforme perfil
            </p>
          </header>

          <div className="fenasoja-portal__groups">
            {accessGroups.map((group) => {
              const GroupIcon = group.icon;
              const groupId = `commission-group-${group.status}`;

              return (
                <section
                  key={group.status}
                  className="commission-access-group"
                  data-status={group.status}
                  aria-labelledby={groupId}
                >
                  <header className="commission-access-group__header">
                    <span className="commission-access-group__icon" aria-hidden="true">
                      <GroupIcon />
                    </span>
                    <div>
                      <h3 id={groupId}>{group.title}</h3>
                      <p>{group.description}</p>
                    </div>
                    <span
                      className="commission-access-group__count"
                      aria-label={`${group.modules.length} ${group.modules.length === 1 ? 'frente' : 'frentes'}`}
                    >
                      {group.modules.length}
                    </span>
                  </header>

                  <div className="commission-access-group__grid">
                    {group.modules.map((module, index) => (
                      <CommissionCard
                        key={module.slug}
                        module={module}
                        index={index}
                        expanded={expandedSlug === module.slug}
                        onToggle={() => setExpandedSlug((current) => (current === module.slug ? null : module.slug))}
                        onAccess={() => accessModule(module.slug)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
