import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const source = readFileSync('supabase/migrations/20261020110000_commercial_revision_order_contracts.sql', 'utf8');
describe('project revision observes order documents without changing commercial data', () => {
  it('ships the same read-only function through both supported migration paths', () => {
    expect(readFileSync('drizzle/migrations/0024_commercial_revision_order_contracts.sql', 'utf8')).toBe(source);
    const journal = JSON.parse(readFileSync('drizzle/migrations/meta/_journal.json', 'utf8'));
    expect(journal.entries.at(-1).tag).toBe('0024_commercial_revision_order_contracts');
    expect(source).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|ALTER TABLE|CREATE TABLE)\b/gmi);
  });
  it('retains authenticated map authorization, safe search path and no public execution', () => {
    expect(source).toContain('IF auth.uid() IS NULL');
    expect(source).toContain('NOT public.can_view_commercial_map(v_org)');
    expect(source).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(source).toContain('REVOKE ALL ON FUNCTION public.commercial_map_revision(uuid) FROM PUBLIC, anon');
    expect(source).toContain('GRANT EXECUTE ON FUNCTION public.commercial_map_revision(uuid) TO authenticated');
  });
});
