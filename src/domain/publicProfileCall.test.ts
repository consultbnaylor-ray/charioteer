import { readdirSync, readFileSync } from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const MIGRATIONS = 'supabase/migrations';
const CASTS = `${MIGRATIONS}/20261010310000_public_profile_casts.sql`;
const PHOTOS = `${MIGRATIONS}/20261010300000_profile_photos.sql`;

const CALLER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const TARGET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const PHOTO = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

const LABEL_APPENDS = [
  'Bio',
  'Town',
  'Stage',
  'Days sober and milestones',
  'Reasons',
  'Money saved and units avoided',
  'Mood streak',
  'Health headlines',
  'Progress photos',
  'Gratitude lines',
  'Gratitude photos',
  'Vision items',
  'Pinned quote',
  'Profile photos',
];

function latestPublicProfileMigration(): string {
  const names = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
  const definers = names.filter((name) => readFileSync(`${MIGRATIONS}/${name}`, 'utf8').includes('function public.public_profile'));
  return definers[definers.length - 1] ?? '';
}

function profileFunction(sql: string): string {
  const start = sql.indexOf('create or replace function public.public_profile');
  const end = sql.indexOf('revoke all on function public.public_profile');
  return sql.slice(start, end);
}

function sliceFunction(sql: string, name: string, nextName: string): string {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = sql.indexOf(`create or replace function public.${nextName}`);
  return sql.slice(start, end);
}

describe('public_profile label casts and directory sync', () => {
  const sql = readFileSync(CASTS, 'utf8');
  const photos = readFileSync(PHOTOS, 'utf8');
  const profile = profileFunction(sql);

  it('keeps the text casts on the latest public_profile and watches bio', () => {
    expect(latestPublicProfileMigration()).toBe('20261010310000_public_profile_casts.sql');
    expect(profile).toContain('I’ve stopped');
    expect(profile).not.toContain('storage_path');
    const appends = profile.split('\n').filter((line) => /(?:shared|hidden)_labels := /.test(line) && line.includes('||'));
    expect(appends).toHaveLength(LABEL_APPENDS.length * 2);
    for (const label of LABEL_APPENDS) {
      expect(appends.filter((line) => line.includes(`'${label}'::text`))).toHaveLength(2);
    }
    expect(profile).not.toMatch(/\|\| '[^']+';/);
    expect(sql).toContain('after insert or update of display_name, town, community_visible, age_confirmed_18, bio');
    expect(sql).toContain('profile_photos_sync_avatar');
    const town = sliceFunction(photos, 'sync_directory_town()', 'sync_directory_avatar()');
    expect(town).toContain('btrim(p.bio)');
    expect(town).toContain('return new;');
    expect(photos).toContain('create trigger profile_photos_sync_avatar');
    expect(photos).toContain('after insert or update or delete on public.profile_photos');
  });

  it('calls public_profile and returns labels instead of a malformed array', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create schema if not exists auth;
        create or replace function auth.uid() returns uuid
        language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
        $$;
        create role anon nologin;
        create role authenticated nologin;
        create table public.profiles (
          id uuid primary key,
          display_name text not null default '',
          bio text,
          town text,
          stage text not null default 'exploring',
          sobriety_started_at timestamptz,
          weekly_spend_gbp numeric,
          weekly_units numeric,
          community_visible boolean not null default false,
          age_confirmed_18 boolean not null default false,
          pinned_quote_id text
        );
        create table public.blocks (blocker_id uuid, blocked_id uuid);
        create table public.profile_sharing (user_id uuid primary key, settings jsonb not null default '{}'::jsonb);
        create table public.interests (id uuid primary key, label text not null);
        create table public.profile_interests (user_id uuid, interest_id uuid);
        create table public.reasons (user_id uuid, body text, sort_order int);
        create table public.check_ins (user_id uuid, created_at timestamptz);
        create table public.health_samples (user_id uuid, kind text, value numeric, recorded_on date);
        create table public.progress_photos (id uuid, user_id uuid, caption text, taken_on date, month_index int, visibility text);
        create table public.gratitude_entries (id uuid, user_id uuid, body text, entry_date date);
        create table public.gratitude_photos (id uuid, user_id uuid, caption text, created_at timestamptz);
        create table public.vision_board_items (id uuid, user_id uuid, caption text, area text, position int);
        create table public.profile_photos (id uuid, user_id uuid, role text, caption text, position int, created_at timestamptz not null default now());
      `);

      let untypedFailed = false;
      try {
        await db.exec(`
          do $$
          declare labels text[] := array['Name', 'Interests'];
          begin
            labels := labels || 'Bio';
          end $$;
        `);
      } catch (error) {
        untypedFailed = true;
        expect(String(error)).toContain('malformed array literal');
        expect(String(error)).toContain('Bio');
      }
      expect(untypedFailed).toBe(true);

      await db.exec(`
        do $$
        declare labels text[] := array['Name', 'Interests'];
        begin
          labels := labels || 'Bio'::text;
        end $$;
      `);

      await db.exec(sql.slice(0, sql.indexOf('drop trigger if exists profiles_sync_directory')));
      await db.exec(`
        insert into public.profiles (id, display_name, bio, community_visible, age_confirmed_18)
        values ('${TARGET}', 'Sam Okonkwo', 'Out walking.', true, true);
        insert into public.profile_photos (id, user_id, role, caption, position)
        values ('${PHOTO}', '${TARGET}', 'avatar', 'Morning light.', 0);
      `);
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [CALLER]);

      const shown = await db.query<{ profile: { displayName: string; bio: string; sharedLabels: string[]; hiddenLabels: string[]; profilePhotos: { id: string; caption: string }[] } }>(
        `select public.public_profile($1::uuid) as profile`,
        [TARGET],
      );
      const view = shown.rows[0]?.profile;
      expect(view?.displayName).toBe('Sam Okonkwo');
      expect(view?.bio).toBe('Out walking.');
      expect(view?.sharedLabels).toEqual(expect.arrayContaining(['Name', 'Interests', 'Bio', 'Profile photos']));
      expect(view?.hiddenLabels).not.toContain('Bio');
      expect(view?.profilePhotos).toEqual([{ id: PHOTO, role: 'avatar', caption: 'Morning light.', position: 0 }]);
      expect(JSON.stringify(view)).not.toContain('storage_path');

      await db.exec(`
        update public.profiles set bio = null where id = '${TARGET}';
        delete from public.profile_photos where user_id = '${TARGET}';
      `);
      const hidden = await db.query<{ profile: { sharedLabels: string[]; hiddenLabels: string[] } }>(
        `select public.public_profile($1::uuid) as profile`,
        [TARGET],
      );
      expect(hidden.rows[0]?.profile.sharedLabels).toEqual(['Name', 'Interests']);
      expect(hidden.rows[0]?.profile.hiddenLabels).toEqual(expect.arrayContaining(['Bio', 'Profile photos', 'Town']));

      await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
      await expect(db.query(`select public.public_profile($1::uuid)`, [TARGET])).rejects.toThrow(/Sign in first/);
    } finally {
      await db.close();
    }
  }, 30_000);

  it('copies bio on a bio-only update and avatar from the photo trigger', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create table public.profiles (
          id uuid primary key,
          display_name text not null default '',
          town text,
          bio text,
          community_visible boolean not null default false,
          age_confirmed_18 boolean not null default false
        );
        create table public.directory (
          user_id uuid primary key,
          display_name text not null default '',
          town text,
          bio text,
          avatar_photo_id uuid,
          visible boolean not null default false,
          age_confirmed_18 boolean not null default false
        );
        create table public.profile_sharing (
          user_id uuid primary key,
          settings jsonb not null default '{}'::jsonb
        );
        create table public.profile_photos (
          id uuid primary key,
          user_id uuid not null,
          role text not null,
          caption text not null default '',
          position integer not null default 0
        );
      `);
      await db.exec(sliceFunction(photos, 'sync_directory()', 'sync_directory_town()'));
      await db.exec(`
        create trigger profiles_sync_directory
          after insert or update of display_name, town, community_visible, age_confirmed_18
          on public.profiles
          for each row execute function public.sync_directory();
      `);
      await db.exec(`
        insert into public.profiles (id, display_name, bio, community_visible, age_confirmed_18)
        values ('${TARGET}', 'Sam Okonkwo', 'First line.', true, true);
      `);
      const inserted = await db.query<{ bio: string }>(`select bio from public.directory where user_id = '${TARGET}'`);
      expect(inserted.rows[0]?.bio).toBe('First line.');

      await db.exec(`update public.profiles set bio = 'Late line.' where id = '${TARGET}'`);
      const stale = await db.query<{ bio: string }>(`select bio from public.directory where user_id = '${TARGET}'`);
      expect(stale.rows[0]?.bio).toBe('First line.');

      await db.exec(sql.slice(sql.indexOf('drop trigger if exists profiles_sync_directory')));
      await db.exec(`update public.profiles set bio = 'Current line.' where id = '${TARGET}'`);
      const fresh = await db.query<{ bio: string }>(`select bio from public.directory where user_id = '${TARGET}'`);
      expect(fresh.rows[0]?.bio).toBe('Current line.');

      const avatarFn = photos.slice(
        photos.indexOf('create or replace function public.sync_directory_avatar()'),
        photos.indexOf('revoke all on function public.sync_directory_avatar()'),
      );
      await db.exec(avatarFn);
      await db.exec(`
        create trigger profile_photos_sync_avatar
          after insert or update or delete on public.profile_photos
          for each row execute function public.sync_directory_avatar();
        insert into public.profile_photos (id, user_id, role, caption, position)
        values ('${PHOTO}', '${TARGET}', 'avatar', 'Morning light.', 0);
      `);
      const avatar = await db.query<{ avatar_photo_id: string }>(`select avatar_photo_id from public.directory where user_id = '${TARGET}'`);
      expect(avatar.rows[0]?.avatar_photo_id).toBe(PHOTO);
    } finally {
      await db.close();
    }
  }, 30_000);
});
