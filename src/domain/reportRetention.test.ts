import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('reports about a deleted account', () => {
  it('stamps the deletion and purges those reports after 12 months', () => {
    const sql = readFileSync('supabase/migrations/20261021230000_deleted_account_reports.sql', 'utf8');
    const job = readFileSync('supabase/functions/privacy-purge/index.ts', 'utf8');
    expect(sql).toContain('Not applied from this repo');
    expect(sql).toContain('subject_deleted_at timestamptz');
    expect(sql).toContain('before delete on public.profiles');
    expect(sql).toContain('reported_user_id = old.id');
    expect(sql).toContain("subject_deleted_at < now() - interval '12 months'");
    expect(sql).toContain('purge_deleted_account_reports');
    expect(sql).toContain('grant execute on function public.purge_deleted_account_reports() to service_role');
    expect(sql).not.toMatch(/grant execute on function public\.purge_deleted_account_reports\(\) to authenticated/i);
    expect(job).toContain("rpc('purge_deleted_account_reports')");
    expect(job).toContain("rpc('purge_client_errors')");
  });
});
