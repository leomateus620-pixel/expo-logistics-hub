import { CalendarDays, FileText, LayoutDashboard, ListChecks, Users } from 'lucide-react';
import type { CommissionWorkspaceNavItem, CommissionWorkspaceSection } from '../types';

export const WORKSPACE_SECTION_PATHS: Record<CommissionWorkspaceSection, string> = {
  overview: 'dashboard',
  agenda: 'agenda',
  documents: 'documentos',
  team: 'equipe',
  tasks: 'tarefas',
};

export function buildWorkspaceNavigation(
  basePath: string,
  counts: Partial<Record<CommissionWorkspaceSection, number>> = {},
): CommissionWorkspaceNavItem[] {
  const route = (section: CommissionWorkspaceSection) => `${basePath}/${WORKSPACE_SECTION_PATHS[section]}`;
  return [
    { id: 'overview', label: 'Visão geral', shortLabel: 'Geral', path: route('overview'), icon: LayoutDashboard },
    { id: 'agenda', label: 'Agenda', shortLabel: 'Agenda', path: route('agenda'), icon: CalendarDays, count: counts.agenda },
    { id: 'documents', label: 'Documentos', shortLabel: 'Docs', path: route('documents'), icon: FileText, count: counts.documents },
    { id: 'team', label: 'Equipe', shortLabel: 'Equipe', path: route('team'), icon: Users, count: counts.team },
    { id: 'tasks', label: 'Tarefas', shortLabel: 'Tarefas', path: route('tasks'), icon: ListChecks },
  ];
}

export function resolveWorkspaceSection<Extension extends string = never>(
  pathname: string,
  basePath: string,
  extensionPaths?: Readonly<Record<Extension, string>>,
): CommissionWorkspaceSection | Extension {
  if (!pathname.startsWith(`${basePath}/`)) return 'overview';
  const relative = pathname.slice(basePath.length).replace(/^\/+/, '').split('/')[0];
  const match = (Object.entries(WORKSPACE_SECTION_PATHS) as Array<[CommissionWorkspaceSection, string]>)
    .find(([, path]) => path === relative);
  if (match) return match[0];
  const extension = extensionPaths && (Object.keys(extensionPaths) as Extension[])
    .find((id) => extensionPaths[id] === relative);
  return extension ?? 'overview';
}

export function unitArticleLabel(type: 'comissao' | 'assessoria') {
  return type === 'assessoria' ? 'da assessoria' : 'da comissão';
}

export function unitTypeLabel(type: 'comissao' | 'assessoria') {
  return type === 'assessoria' ? 'Assessoria' : 'Comissão';
}
