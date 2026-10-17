import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { SCREEN_ERROR, clientAppBuild, sanitizeClientError } from './clientError';

describe('caught screen errors', () => {
  it('keeps a short line with no address, token, or stack', () => {
    const token = 'eyJabcdefgh.ijklmnop.qrstuvwx';
    expect(sanitizeClientError(new Error(`Failed for ada@example.com ${token} now`))).toBe('Failed for now');
    expect(sanitizeClientError('   ')).toBe('Unknown error');
    expect(sanitizeClientError({ message: 'hidden' })).toBe('Unknown error');
    expect(sanitizeClientError(new Error('x'.repeat(400)))).toHaveLength(300);
    expect(clientAppBuild({ buildNumber: '21', version: '1.0.0' })).toBe('21');
    expect(clientAppBuild({ buildNumber: '   ', version: '1.2.3' })).toBe('1.2.3');
    expect(clientAppBuild({ buildNumber: '   ', version: '   ' })).toBe('unknown');
    expect(SCREEN_ERROR).toBe('Something went wrong – Try again');
  });

  it('wraps profile and chat, and logs only the safe line', () => {
    const boundary = readFileSync('src/ui/ScreenBoundary.tsx', 'utf8');
    const sql = readFileSync('supabase/migrations/20261015061000_chat_reads_and_client_errors.sql', 'utf8');
    expect(boundary).toContain('{SCREEN_ERROR}');
    expect(boundary).toContain('sanitizeClientError');
    expect(boundary).toContain('logClientError');
    expect(boundary).toContain('minHeight: 44');
    expect(boundary).not.toContain('componentStack');
    expect(boundary).not.toContain('error.stack');
    expect(sql).toContain('screen text not null');
    expect(sql).toContain('message text not null check (char_length(message) between 1 and 300)');
    expect(sql).toContain('app_build text not null');
    expect(sql).toContain('created_at timestamptz not null default now()');
    expect(sql).toContain('for insert to authenticated');
    expect(sql).toContain('with check (user_id = auth.uid())');
  });

  it('logs a client error from the stored user without asking the server who they are', () => {
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    const method = repo.slice(repo.indexOf('async logClientError'), repo.indexOf('async saveDeviceToken'));
    expect(method).toContain("'no session'");
    expect(method).toContain('getSession()');
    expect(method).toContain("from('client_errors')");
    expect(method).not.toContain('this.userId()');
    expect(method).not.toContain('getUser(');
  });
});
