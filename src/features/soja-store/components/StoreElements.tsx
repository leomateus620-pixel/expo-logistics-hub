import { useId, useState, type ReactNode } from "react";
import { AlertCircle, Loader2, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import "../soja-store.css";

export function StoreHeading({ title, description, action, icon: Icon, controls, level = 1, eyebrow }: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  controls?: ReactNode;
  level?: 1 | 2;
  eyebrow?: string;
}) {
  const Title = level === 1 ? "h1" : "h2";
  return (
    <header className="ss-heading">
      <div className="ss-heading-row">
        <div className="ss-heading-identity">
          {Icon && <span className="ss-section-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>}
          <div className="min-w-0">
            {eyebrow && <span className="ss-heading-eyebrow">{eyebrow}</span>}
            <Title className={level === 2 ? "ss-subheading-title" : undefined} tabIndex={-1}>{title}</Title>
            {description && <p>{description}</p>}
          </div>
        </div>
        {action && <div className="ss-heading-action">{action}</div>}
      </div>
      {controls && <div className="ss-heading-controls">{controls}</div>}
    </header>
  );
}

export function StoreFilters({ children, count = 0, onClear }: {
  children: ReactNode;
  count?: number;
  onClear?: () => void;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="ss-filters" data-expanded={expanded}>
      <Button type="button" variant="outline" className="ss-filters-toggle" aria-expanded={expanded}
        aria-controls={id} onClick={() => setExpanded(!expanded)}>
        <SlidersHorizontal size={16} aria-hidden="true" /> Filtros{count > 0 && <span aria-label={`${count} ativos`}>{count}</span>}
      </Button>
      <div id={id} className="ss-filter-fields">
        {children}
        {count > 0 && onClear && <Button type="button" variant="ghost" onClick={onClear}>Limpar filtros</Button>}
      </div>
    </div>
  );
}

export function StoreState({ title, description, action, busy = false }: {
  title: string;
  description?: string;
  action?: ReactNode;
  busy?: boolean;
}) {
  return (
    <div className="ss-state" role="status">
      {busy && <Loader2 className="motion-safe:animate-spin" aria-hidden="true" size={22} />}
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StoreFailure({ message, retry, retryLabel = "Tentar novamente" }: {
  message: string;
  retry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="ss-failure" role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <p>{message}</p>
      {retry && <Button type="button" variant="outline" onClick={retry}>{retryLabel}</Button>}
    </div>
  );
}

export function StoreField({ id, label, error, children }: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="ss-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && <p id={`${id}-error`} className="ss-field-error">{error}</p>}
    </div>
  );
}

export function fieldError(id: string, message?: string) {
  return { id, "aria-invalid": !!message, "aria-describedby": message ? `${id}-error` : undefined };
}
