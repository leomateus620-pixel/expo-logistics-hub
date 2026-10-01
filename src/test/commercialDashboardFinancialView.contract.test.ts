// @vitest-environment ./src/test/venueSqlNode.environment.ts

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const original = readFileSync('supabase/migrations/20260926082845_1ddb8e8c-6673-4949-b593-3f3752d7fdbd.sql', 'utf8').trim();
const migration = readFileSync('supabase/migrations/20261001193000_commercial_dashboard_financial_embed.sql', 'utf8');

describe('existing official pricing view embedded in the shared map read', () => {
  it('appends only the persisted entity FK and preserves all existing pricing columns, ordering and formulas', () => {
    const view = migration.slice(migration.indexOf('CREATE OR REPLACE VIEW'), migration.indexOf("NOTIFY pgrst"))
      .replace(' WITH (security_invoker = on)', '')
      .replace('l.project_id,l.entity_id,l.public_identifier', 'l.project_id,l.public_identifier')
      .replace('segunda_is_manual,entity_id FROM calc;', 'segunda_is_manual FROM calc;').trim();
    expect(view.replace(/\r\n/g, '\n')).toBe(original.replace(/\r\n/g, '\n'));
    expect(migration).toContain('l.id lot_id,l.project_id,l.entity_id,l.public_identifier');
    expect(migration).toContain('segunda_is_manual,entity_id FROM calc;');
    expect(migration).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|FUNCTION)|ALTER\s+TABLE|INSERT\s+INTO|UPDATE\s+public\./i);
  });

  it('keeps invoker permissions and reloads the PostgREST schema for the existing unique entity FK', () => {
    expect(migration).toContain('WITH (security_invoker = on)');
    expect(migration).toContain("NOTIFY pgrst, 'reload schema';");
    const schema = readFileSync('supabase/migrations/20260710010000_create_commercial_map.sql', 'utf8');
    expect(schema).toContain('entity_id uuid NOT NULL UNIQUE REFERENCES public.map_entities(id)');
    expect(migration).not.toMatch(/SECURITY\s+DEFINER|GRANT|CREATE\s+POLICY/i);
  });
});
