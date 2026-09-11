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

export function resolveWorkspaceSection(pathname: string, basePath: string): CommissionWorkspaceSection {
  const relative = pathname.replace(basePath, '').replace(/^\/+/, '').split('/')[0] ?? '';
  const match = (Object.entries(WORKSPACE_SECTION_PATHS) as Array<[CommissionWorkspaceSection, string]>)
    .find(([, path]) => path === relative);
  return match?.[0] ?? 'overview';
}

export function unitArticleLabel(type: 'comissao' | 'assessoria') {
  return type === 'assessoria' ? 'da assessoria' : 'da comissão';
}

export function unitTypeLabel(type: 'comissao' | 'assessoria') {
  return type === 'assessoria' ? 'Assessoria' : 'Comissão';
}
