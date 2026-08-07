import type { CSSProperties } from 'react';
import {
  CalendarRange,
  ClipboardCheck,
  ShieldCheck,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { AgendaWordmark } from '@/components/brand/AgendaWordmark';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';

interface VenueCapability {
  icon: LucideIcon;
  label: string;
  description: string;
}

const venueCapabilities: VenueCapability[] = [
  {
    icon: UtensilsCrossed,
    label: 'Restaurante e Arena',
    description: 'Reservas coordenadas',
  },
  {
    icon: CalendarRange,
    label: 'Conflitos em tempo real',
    description: 'Agenda e capacidade',
  },
  {
    icon: ClipboardCheck,
    label: 'Operação rastreável',
    description: 'Aprovações e recursos',
  },
  {
    icon: ShieldCheck,
    label: 'Contrapartidas seguras',
    description: 'Consumo transacional',
  },
];

export function VenueEventsLoginHero() {
  return (
    <section className="auth-hero auth-hero--venue" aria-labelledby="login-hero-title">
      <FenasojaBrand
        className="auth-hero__brand"
        scale="display"
        showEdition={false}
        subtitle="Operação de espaços"
        tone="dark"
      />

      <div className="auth-hero__title-group">
        <h1 id="login-hero-title" className="auth-hero__title auth-hero__title--venue">
          <AgendaWordmark variant="venue" scale="display" />
        </h1>
        <p className="auth-hero__subtitle">
          Reservas, aprovações e contrapartidas do Restaurante e da Arena em um ambiente único.
        </p>
      </div>

      <ul className="auth-capabilities" aria-label="Capacidades da Agenda Restaurante e Arena">
        {venueCapabilities.map(({ description, icon: Icon, label }, index) => (
          <li
            key={label}
            className="auth-capability"
            style={{ '--capability-index': index } as CSSProperties}
          >
            <span className="auth-capability__icon" aria-hidden="true">
              <Icon />
            </span>
            <span className="auth-capability__copy">
              <strong>{label}</strong>
              <span>{description}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
