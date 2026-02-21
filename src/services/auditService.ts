import { supabase } from '@/integrations/supabase/client';

export async function logAudit(params: {
  orgId: string;
  entity: string;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'status_change' | 'import';
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await (supabase as any).from('audit_log').insert({
    org_id: params.orgId,
    actor_user_id: user.id,
    entity: params.entity,
    entity_id: params.entityId,
    action: params.action,
    before_data: params.before || null,
    after_data: params.after || null,
  });
}
