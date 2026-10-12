import symbolSrc from '@/assets/brand/fenasoja-symbol-144.webp';
import { cn } from '@/lib/utils';
import {
  FALLBACK_ORG_UNIT_ICON,
  getOrgUnitIdentity,
  type OrgUnitKind,
} from './registry';

interface OrgUnitIdentityBadgeProps {
  /** Id estável vindo de `resolveOrgUnitIdentity`; ausente para unidades ainda não mapeadas. */
  identityId?: string | null;
  kind?: OrgUnitKind | null;
  className?: string;
}

/** Símbolo decorativo da unidade; o nome textual continua sendo o rótulo acessível. */
export function OrgUnitIdentityBadge({ identityId, kind, className }: OrgUnitIdentityBadgeProps) {
  const identity = getOrgUnitIdentity(identityId);
  const resolvedKind = identity?.kind ?? kind ?? 'comissao';
  const Icon = identity?.icon ?? FALLBACK_ORG_UNIT_ICON;

  return (
    <span
      className={cn('org-unit-identity', className)}
      data-kind={resolvedKind}
      data-identity={identity?.id ?? 'fallback'}
      aria-hidden="true"
    >
      {identity?.symbol === 'fenasoja' ? (
        <img
          className="org-unit-identity__symbol"
          src={symbolSrc}
          alt=""
          width={144}
          height={144}
          decoding="async"
          draggable={false}
        />
      ) : (
        <Icon className="org-unit-identity__glyph" strokeWidth={1.85} />
      )}
    </span>
  );
}
