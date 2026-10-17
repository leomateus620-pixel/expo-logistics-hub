import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('edge auth-failure copy', () => {
  it('stays identical to the frontend source', () => {
    expect(readFileSync('supabase/functions/_shared/workers/auth-failure.ts', 'utf8'))
      .toBe(readFileSync('src/lib/workers/auth-failure.ts', 'utf8'));
  });
});
