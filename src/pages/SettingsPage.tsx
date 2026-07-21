import { useState } from 'react';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings, Users, Shield, ShieldCheck, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import NotificationRecipientsSection from '@/components/settings/NotificationRecipientsSection';

import { presentFenasojaProductName } from '@/lib/fenasoja-brand';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  operador: 'Operador',
  leitura: 'Somente Leitura',
};

const severityColors: Record<string, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-destructive/80 text-destructive-foreground',
  medium: 'bg-warning text-warning-foreground',
  low: 'bg-info text-info-foreground',
  info: 'bg-muted text-muted-foreground',
};

const severityLabels: Record<string, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
  info: 'Info',
};

interface AuditSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

interface AuditFinding {
  id: string;
  module: string;
  title: string;
  severity: string;
  risk: string;
  evidence: Record<string, unknown>;
  recommendation: string;
}

export default function SettingsPage() {
  const { orgId, orgName, myRole } = useCurrentOrg();
  const { members } = useOrgMembers();
  const { user } = useAuth();
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);
  const [auditReportId, setAuditReportId] = useState<string | null>(null);
  const [findings, setFindings] = useState<AuditFinding[] | null>(null);
  const [showFindings, setShowFindings] = useState(false);
  const [loadingFindings, setLoadingFindings] = useState(false);

  const isAdmin = myRole === 'admin';
  const canSeeAudit = myRole === 'admin' || myRole === 'operador';

  const runAudit = async () => {
    if (!orgId) return;
    setAuditLoading(true);
    setAuditSummary(null);
    setAuditReportId(null);
    setFindings(null);
    setShowFindings(false);

    try {
      const { data, error } = await supabase.functions.invoke('security-audit-selfcheck', {
        body: { scope: 'full', orgId },
      });
      if (error) throw error;
      setAuditSummary(data.summary);
      setAuditReportId(data.reportId);
      toast.success('Auditoria concluída');
    } catch (err: any) {
      toast.error('Erro ao executar auditoria: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setAuditLoading(false);
    }
  };

  const loadFindings = async () => {
    if (!auditReportId) return;
    if (findings) {
      setShowFindings(!showFindings);
      return;
    }
    setLoadingFindings(true);
    try {
      const { data, error } = await (supabase as any)
        .from('security_audit_reports')
        .select('findings')
        .eq('id', auditReportId)
        .single();
      if (error) throw error;
      setFindings(data.findings as AuditFinding[]);
      setShowFindings(true);
    } catch (err: any) {
      toast.error('Erro ao carregar relatório');
    } finally {
      setLoadingFindings(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5" /> Configurações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Gerenciar organização e permissões</p>
      </div>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-primary" /> Organização
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nome</span>
            <span className="font-medium">{presentFenasojaProductName(orgName)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Seu papel</span>
            <Badge variant="outline">{roleLabels[myRole || ''] || myRole}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">E-mail</span>
            <span className="text-xs">{user?.email}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-primary" /> Membros ({members.length})
        </h2>
        <div className="space-y-2">
          {members.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="text-sm font-medium">{m.nome_exibicao || 'Sem nome'}</p>
                <p className="text-xs text-muted-foreground">{m.cargo || 'Sem cargo'}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{roleLabels[m.role] || m.role}</Badge>
            </div>
          ))}
        </div>
      </div>

      <NotificationRecipientsSection />

      {canSeeAudit && (
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-primary" /> Auditoria de Segurança
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Executa verificações não destrutivas (read-only) de RLS, RBAC, exposição de PII e consistência de dados.
          </p>

          <Button onClick={runAudit} disabled={auditLoading} size="sm">
            {auditLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Executando...</> : 'Executar Auditoria'}
          </Button>

          {auditSummary && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {(['critical', 'high', 'medium', 'low', 'info'] as const).map((sev) => (
                  <Badge key={sev} className={severityColors[sev]}>
                    {severityLabels[sev]}: {auditSummary[sev]}
                  </Badge>
                ))}
                <Badge variant="outline">Total: {auditSummary.total}</Badge>
              </div>

              {auditReportId && (
                <Button variant="ghost" size="sm" onClick={loadFindings} disabled={loadingFindings}>
                  {loadingFindings ? <Loader2 className="w-3 h-3 animate-spin" /> : showFindings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showFindings ? 'Ocultar detalhes' : 'Ver relatório completo'}
                </Button>
              )}

              {showFindings && findings && (
                <div className="space-y-2 mt-2">
                  {findings.map((f) => (
                    <div key={f.id} className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={`${severityColors[f.severity]} text-[10px]`}>{f.severity.toUpperCase()}</Badge>
                        <span className="text-xs text-muted-foreground font-mono">{f.id}</span>
                        <span className="text-xs text-muted-foreground">• {f.module}</span>
                      </div>
                      <p className="text-sm font-medium">{f.title}</p>
                      <p className="text-xs text-muted-foreground">{f.risk}</p>
                      <div className="text-xs font-mono bg-muted/50 rounded p-2">
                        {JSON.stringify(f.evidence)}
                      </div>
                      <p className="text-xs text-primary">💡 {f.recommendation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
