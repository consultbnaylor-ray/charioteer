import { readdirSync, readFileSync } from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { describe, expect, it } from 'vitest';

const MIGRATIONS = 'supabase/migrations';

// Objects the hosted project already has before the first migration.
// The migration files themselves are applied unchanged.
const PLATFORM = `
  create schema if not exists extensions;
  create schema if not exists auth;
  create schema if not exists storage;

  create role anon nologin;
  create role authenticated nologin;

  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb
  );

  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;

  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean,
    file_size_limit bigint,
    allowed_mime_types text[]
  );

  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text,
    name text
  );

  create or replace function storage.foldername(name text)
  returns text[]
  language sql immutable as $$
    select string_to_array(name, '/');
  $$;
`;

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
}

describe('migration parse', () => {
  it('quotes position in shared_profile_photos and applies every migration', async () => {
    const files = migrationFiles();
    expect(files[0]).toBe('20261010120000_init.sql');
    expect(files).toContain('20261010300000_profile_photos.sql');
    expect(files).toContain('20261010310000_public_profile_casts.sql');

    const photos = readFileSync(`${MIGRATIONS}/20261010300000_profile_photos.sql`, 'utf8');
    const shared = photos.slice(
      photos.indexOf('function public.shared_profile_photos'),
      photos.indexOf('alter table public.directory'),
    );
    expect(shared).toContain('"position" integer');
    expect(shared).not.toMatch(/^\s+position integer,/m);

    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(PLATFORM);
      for (const name of files) {
        try {
          await db.exec(readFileSync(`${MIGRATIONS}/${name}`, 'utf8'));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`${name} failed to apply: ${message}`);
        }
      }

      const signature = await db.query<{ result: string }>(`
        select pg_get_function_result(p.oid) as result
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'shared_profile_photos'
      `);
      expect(signature.rows[0]?.result).toContain('"position" integer');
      const rows = await db.query(`select * from public.shared_profile_photos('{}'::uuid[])`);
      expect(rows.rows).toEqual([]);
    } finally {
      await db.close();
    }
  }, 60_000);
});
