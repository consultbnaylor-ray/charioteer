import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261010130000_tighten_grants.sql', 'utf8');
const init = readFileSync('supabase/migrations/20261010120000_init.sql', 'utf8');

function updateColumns(table: string): string[] {
  const match = sql.match(new RegExp(`grant update \\(([^)]+)\\) on public\\.${table} to authenticated`, 'i'));
  if (!match) return [];
  return match[1].split(',').map((column) => column.trim()).filter(Boolean);
}

describe('tighten_grants migration', () => {
  it('revokes broad client privileges before granting the app back what it uses', () => {
    expect(sql.toLowerCase()).toContain('revoke all privileges on all tables in schema public from public, anon, authenticated');
    expect(sql.toLowerCase()).not.toMatch(/grant all\b/);
  });

  it('lets a user edit their profile and never is_moderator', () => {
    expect(updateColumns('profiles')).toEqual([
      'display_name',
      'sobriety_started_at',
      'weekly_spend_gbp',
      'weekly_units',
      'town',
      'age_confirmed_18',
      'community_visible',
      'consent_health',
      'consent_ai',
      'onboarding_complete',
      'text_scale',
      'theme_preference',
    ]);
    expect(updateColumns('profiles')).not.toContain('is_moderator');
    expect(sql).toContain("column_name in ('is_moderator', 'id', 'created_at', 'updated_at')");
    expect(sql).toContain('a protected profile column is still updatable');
  });

  it('limits connection, report, and health updates to the columns the app writes', () => {
    expect(updateColumns('connections')).toEqual(['status']);
    expect(updateColumns('reports')).toEqual(['status']);
    expect(updateColumns('health_samples')).toEqual(['value', 'unit']);
  });

  it('lets a signed-out person read helplines', () => {
    expect(sql.toLowerCase()).toContain('grant select on public.resources to anon');
    expect(sql).toContain("using (category = 'helplines')");
    expect(sql).toContain('resources_read_anon');
  });

  it('documents the init migration intent without replacing its statements', () => {
    expect(init).toContain('20261010130000_tighten_grants.sql');
    expect(init).toContain('revoke all on public.profiles from anon');
    expect(init).not.toContain('revoke all privileges on all tables in schema public from public, anon, authenticated');
  });
});
