export type AuthorityLevel = 1 | 2 | 3 | 4 | 5;

export type OrgNodeType =
  | 'ccp'
  | 'executive'
  | 'central-commission'
  | 'commission'
  | 'advisory'
  | 'volunteer';

export interface OrgPerson {
  /** Canonical graph identity. Never expose this value as account information. */
  id: string;
  userId: string | null;
  fullName: string;
  avatarUrl: string | null;
  roles: string[];
  highestAuthorityLevel: AuthorityLevel;
  sourceIds: string[];
}

export interface OrgNodeResponsibility {
  id: string;
  personId: string | null;
  displayName: string;
  responsibleType: 'pessoa' | 'equipe';
  relationshipRole: string;
  isPrimary: boolean;
}

export interface OrgNode {
  id: string;
  type: OrgNodeType;
  authorityLevel: AuthorityLevel;
  title: string;
  subtitle: string | null;
  personIds: string[];
  parentIds: string[];
  childIds: string[];
  commissionId: string | null;
  advisoryId: string | null;
  sortOrder: number;
  /** Level 5 is modeled now, but deliberately excluded from the current renderer. */
  isRenderable: boolean;
  responsibilities: OrgNodeResponsibility[];
  metadata: Record<string, unknown>;
}

export interface OrgEdge {
  id: string;
  sourceId: string;
  targetId: string;
  authorityLevel: AuthorityLevel;
}

export type OrgDataAnomalyCode =
  | 'duplicate-person'
  | 'conflicting-person-name'
  | 'missing-person-name'
  | 'missing-avatar'
  | 'missing-ccp-member'
  | 'missing-president'
  | 'missing-vice-president'
  | 'executive-cardinality'
  | 'missing-central-commission'
  | 'excluded-unit'
  | 'orphan-volunteer';

export interface OrgDataAnomaly {
  code: OrgDataAnomalyCode;
  severity: 'info' | 'warning';
  message: string;
  entityIds: string[];
}

export interface OrganizationalGraph {
  people: Record<string, OrgPerson>;
  nodes: OrgNode[];
  edges: OrgEdge[];
  anomalies: OrgDataAnomaly[];
  rootNodeId: string;
  /** Explicit allow-list for the active Levels 1-4 renderer. */
  renderableNodeIds: string[];
}

export interface OrganizationalMemberRecord {
  id?: string | null;
  user_id?: string | null;
  nome_exibicao?: string | null;
  cargo?: string | null;
  role?: string | null;
  commission_id?: string | null;
  commission_nome?: string | null;
  is_active?: boolean | null;
  avatar_url?: string | null;
  photo_url?: string | null;
}

export interface OrganizationalResponsibleRecord {
  id: string;
  displayName: string;
  responsibleType: 'pessoa' | 'equipe';
  relationshipRole: string;
  isPrimary: boolean;
  userId: string | null;
}

export interface OrganizationalUnitRecord {
  id: string;
  name: string;
  slug: string;
  type: 'comissao' | 'assessoria' | 'externo';
  displayOrder: number;
  isOfficial: boolean;
  isLegacy: boolean;
  responsibles: OrganizationalResponsibleRecord[];
}

/**
 * Forward-compatible input only. The live hook does not infer or manufacture
 * volunteers; Level 5 nodes appear only when an explicit real source supplies them.
 */
export interface OrganizationalVolunteerRecord {
  id: string;
  fullName: string;
  parentCommissionId: string;
  userId?: string | null;
  avatarUrl?: string | null;
  roles?: string[];
}

export interface OrganizationalRawData {
  members: readonly OrganizationalMemberRecord[];
  units: readonly OrganizationalUnitRecord[];
  volunteers?: readonly OrganizationalVolunteerRecord[];
}

export interface OrganizationalEcosystemDataResult {
  graph: OrganizationalGraph;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}
