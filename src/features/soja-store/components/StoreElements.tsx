import type { ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StoreHeading({ title, description, action }: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="ss-heading">
      <div className="min-w-0">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
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
