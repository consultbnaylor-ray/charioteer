import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261010130000_tighten_grants.sql', 'utf8');
const init = readFileSync('supabase/migrations/20261010120000_init.sql', 'utf8');
const healthUpsert = readFileSync('supabase/migrations/20261010140000_health_upsert_grant.sql', 'utf8');
const addInterest = readFileSync('supabase/migrations/20261010150000_add_interest.sql', 'utf8');
const consentReread = readFileSync('supabase/migrations/20261010160000_consent_reread.sql', 'utf8');
const profileStage = readFileSync('supabase/migrations/20261010170000_profile_stage.sql', 'utf8');
const profileHeight = readFileSync('supabase/migrations/20261010240000_profile_height.sql', 'utf8');
const profileVision = readFileSync('supabase/migrations/20261010250000_vision_board.sql', 'utf8');
const profileBio = readFileSync('supabase/migrations/20261010290000_profile_bio_captions.sql', 'utf8');
const messagePush = readFileSync('supabase/migrations/20261010350000_message_push.sql', 'utf8');
const movementReminder = readFileSync('supabase/migrations/20261014190000_thumos_motivation.sql', 'utf8');
const progressPhotos = readFileSync('supabase/migrations/20261010180000_progress_photos.sql', 'utf8');
const progressVisibility = readFileSync('supabase/migrations/20261010190000_progress_photo_visibility.sql', 'utf8');

function updateColumnsIn(source: string, table: string): string[] {
  const match = source.match(new RegExp(`grant update \\(([^)]+)\\) on public\\.${table} to authenticated`, 'i'));
  if (!match) return [];
  return match[1].split(',').map((column) => column.trim()).filter(Boolean);
}

function updateColumns(table: string): string[] {
  return updateColumnsIn(sql, table);
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

describe('client writes against the live grants', () => {
  const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');

  it('lets onboarding insert consents without reading them back', () => {
    const method = repo.slice(repo.indexOf('private async insertConsents'), repo.indexOf('function mapInterest'));
    expect(method).toContain(".from('consents').insert(");
    expect(method).not.toContain('.select(');
    expect(method).not.toMatch(/\bid:/);
  });

  it('only updates profile columns the signed-in user may write', () => {
    const granted = new Set([
      ...updateColumns('profiles'),
      ...updateColumnsIn(profileStage, 'profiles'),
      ...updateColumnsIn(profileHeight, 'profiles'),
      ...updateColumnsIn(profileVision, 'profiles'),
      ...updateColumnsIn(profileBio, 'profiles'),
      ...updateColumnsIn(messagePush, 'profiles'),
      ...updateColumnsIn(movementReminder, 'profiles'),
    ]);
    const written = [
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
      'stage',
      'planned_quit_at',
      'weekly_units_goal',
      'drink_free_days_goal',
      'drink_free_on',
      'height_cm',
      'vision_statement',
      'vision_started_on',
      'bio',
      'message_notifications',
      'notify_sender_name',
      'movement_reminder',
      'movement_reminder_minute',
    ];
    for (const column of written) expect(granted.has(column)).toBe(true);
    expect(granted.has('is_moderator')).toBe(false);
  });

  it('covers every column the health upsert sends', () => {
    const granted = new Set([...updateColumns('health_samples'), ...updateColumnsIn(healthUpsert, 'health_samples')]);
    for (const column of ['user_id', 'kind', 'value', 'unit', 'recorded_on', 'source']) {
      expect(granted.has(column)).toBe(true);
    }
  });
});

describe('consent reread', () => {
  it('lets the signed-in user read their own rows and ignore a repeat insert', () => {
    expect(consentReread).toContain('grant select on public.consents to authenticated');
    expect(consentReread).toContain('consents_user_kind_version_key');
    expect(consentReread).toContain('on public.consents (user_id, kind, version)');
    expect(consentReread.toLowerCase()).not.toContain('grant update');
  });
});

describe('profile height', () => {
  it('grants column update only and does not copy height into the directory', () => {
    expect(updateColumnsIn(profileHeight, 'profiles')).toEqual(['height_cm']);
    expect(profileHeight.toLowerCase()).not.toMatch(/grant update on public\.profiles/i);
    expect(profileHeight).not.toContain('public.directory');
    expect(profileHeight).toContain('height_cm >= 50');
  });
});

describe('vision board', () => {
  it('grants column update only and keeps the pictures private', () => {
    expect(updateColumnsIn(profileVision, 'profiles')).toEqual(['vision_statement', 'vision_started_on']);
    expect(updateColumnsIn(profileVision, 'vision_board_items')).toEqual(['caption', 'area', 'size', 'position']);
    expect(profileVision.toLowerCase()).not.toMatch(/grant update on public\.profiles/i);
    expect(profileVision.toLowerCase()).not.toMatch(/grant update on public\.vision_board_items/i);
    expect(profileVision).toContain('revoke all on table public.vision_board_items from public, anon, authenticated');
    expect(profileVision).toContain("values ('vision-board', 'vision-board', false, 2097152");
    expect(profileVision).toContain('set public = false');
    expect(profileVision).not.toContain('public.directory');
    expect(profileVision).not.toMatch(/visibility/);
    expect(profileVision).toContain("'vision_board_items'");
  });
});

describe('profile stage', () => {
  it('backfills stopped when a sober date exists and grants only the new columns', () => {
    expect(profileStage).toContain("stage in ('stopped', 'trying_to_stop', 'cutting_down', 'exploring')");
    expect(profileStage).toContain('set stage = \'stopped\'');
    expect(profileStage).toContain('sobriety_started_at is not null');
    expect(updateColumnsIn(profileStage, 'profiles')).toEqual([
      'stage',
      'planned_quit_at',
      'weekly_units_goal',
      'drink_free_days_goal',
      'drink_free_on',
    ]);
    expect(profileStage.toLowerCase()).not.toMatch(/grant update on public\.profiles/i);
  });
});

describe('set reasons function', () => {
  const setReasons = readFileSync('supabase/migrations/20261010260000_set_reasons.sql', 'utf8');

  it('replaces the caller’s rows in one function and does not add a unique index', () => {
    expect(setReasons).toContain('create or replace function public.set_reasons(bodies text[])');
    expect(setReasons).toContain('security definer');
    expect(setReasons).toContain('auth.uid()');
    expect(setReasons).toContain('delete from public.reasons where user_id = uid');
    expect(setReasons).toContain('distinct on (lower(clean.body))');
    expect(setReasons.toLowerCase()).toContain('revoke all on function public.set_reasons(text[]) from public, anon, authenticated');
    expect(setReasons.toLowerCase()).toContain('grant execute on function public.set_reasons(text[]) to authenticated');
    expect(setReasons.toLowerCase()).not.toMatch(/create unique index|unique \(/);
    expect(setReasons).not.toMatch(/visibility/);
  });
});

describe('add interest function', () => {
  it('reuses a slug, attaches it to the caller, and grants execute only to signed-in users', () => {
    expect(addInterest).toContain('create or replace function public.add_interest(label text)');
    expect(addInterest).toContain('security definer');
    expect(addInterest).toContain('set search_path = public');
    expect(addInterest).toContain('on conflict (slug) do nothing');
    expect(addInterest).toContain('insert into public.profile_interests (user_id, interest_id)');
    expect(addInterest).toContain('auth.uid()');
    expect(addInterest.toLowerCase()).toContain('revoke all on function public.add_interest(text) from public, anon, authenticated');
    expect(addInterest.toLowerCase()).toContain('grant execute on function public.add_interest(text) to authenticated');
    expect(addInterest.toLowerCase()).not.toContain('grant execute on function public.add_interest(text) to anon');
  });
});

describe('client interest write', () => {
  const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');

  it('calls add_interest once and does not insert the slug or reload the account', () => {
    const method = repo.slice(repo.indexOf('async addCustomInterest'), repo.indexOf('async requestConnection'));
    expect(method).toContain("rpc('add_interest'");
    expect(method).not.toContain(".from('interests').insert");
    expect(method).not.toContain('this.refresh()');
    expect(method).not.toContain('replaceInterests');
    expect(method).toContain('interestWrites');
  });
});

describe('progress photos', () => {
  it('keeps the bucket private and grants the owner columns only', () => {
    expect(progressPhotos).toContain('create table public.progress_photos');
    expect(progressPhotos).toContain("storage_path = user_id::text || '/' || id::text || '.jpg'");
    expect(progressPhotos).toContain("values ('progress-photos', 'progress-photos', false, 2097152");
    expect(progressPhotos).toContain('set public = false');
    expect(progressPhotos).toContain('progress_photos_storage_read');
    expect(progressPhotos).toContain('progress_photos_storage_insert');
    expect(progressPhotos).toContain('progress_photos_storage_delete');
    expect(progressPhotos).toContain('for select to authenticated');
    expect(progressPhotos).toContain('for insert to authenticated');
    expect(progressPhotos).toContain('for delete to authenticated');
    expect(progressPhotos).not.toMatch(/to anon/);
    expect(progressPhotos).toContain('grant select (id, user_id, taken_on, month_index, note, storage_path, created_at) on public.progress_photos to authenticated');
    expect(progressPhotos).toContain('grant insert (id, user_id, taken_on, month_index, note, storage_path) on public.progress_photos to authenticated');
    expect(progressPhotos).toContain('grant delete on public.progress_photos to authenticated');
    expect(progressPhotos.toLowerCase()).not.toMatch(/grant update/);
    expect(progressPhotos).toContain("'progress_photos'");
    expect(progressPhotos).not.toMatch(/grant update on public\.progress_photos/i);
  });

  it('lets the owner change visibility and lets everyone else read only a shared row', () => {
    expect(progressVisibility).toContain("default 'private'");
    expect(progressVisibility).toContain("visibility in ('private', 'community')");
    expect(progressVisibility).toContain('for select to authenticated');
    expect(progressVisibility).toContain("using (visibility = 'community')");
    expect(progressVisibility).toContain('grant update (visibility) on public.progress_photos to authenticated');
    expect(progressVisibility).not.toMatch(/grant update on public\.progress_photos/i);
    expect(progressVisibility).not.toContain('storage.objects');
  });
});

describe('health upsert grant', () => {
  it('adds the conflict columns and checks the full set plus health_own', () => {
    expect(updateColumns('health_samples')).toEqual(['value', 'unit']);
    expect(updateColumnsIn(healthUpsert, 'health_samples')).toEqual(['user_id', 'kind', 'recorded_on', 'source']);
    expect(healthUpsert).not.toMatch(/grant update on public\.health_samples/i);
    expect(healthUpsert).toContain("column_name in ('user_id', 'kind', 'recorded_on', 'source', 'value', 'unit')");
    expect(healthUpsert).toContain("column_name in ('id', 'created_at')");
    expect(healthUpsert).toContain('health_own');
    expect(healthUpsert).toContain('user_id = auth.uid()');
    expect(healthUpsert).toContain('health_samples still has table-level UPDATE');
    const intended = [...updateColumns('health_samples'), ...updateColumnsIn(healthUpsert, 'health_samples')].sort();
    expect(intended).toEqual(['kind', 'recorded_on', 'source', 'unit', 'user_id', 'value']);
  });
});

/** Tables authenticated can read after every migration, in filename order. */
function authenticatedSelectTables(): Set<string> {
  const granted = new Set<string>();
  const files = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  for (const name of files) {
    const sql = readFileSync(`supabase/migrations/${name}`, 'utf8');
    for (const statement of sql.split(';')) {
      if (/revoke all privileges on all tables in schema public/i.test(statement) && /\bauthenticated\b/i.test(statement)) {
        granted.clear();
        continue;
      }
      if (/\bon\s+function\b/i.test(statement)) continue;
      const revoke = /revoke all on (?:table\s+)?public\.([a-z_]+)\s+from\s+([^;]+)/i.exec(statement);
      if (revoke && /\bauthenticated\b/i.test(revoke[2])) {
        granted.delete(revoke[1]);
        continue;
      }
      const grant = /grant\s+([\s\S]+?)\s+on\s+(?:table\s+)?public\.([a-z_]+)\s+to\s+([^;]+)/i.exec(statement);
      if (grant && /\bauthenticated\b/i.test(grant[3]) && /\bselect\b/i.test(grant[1])) granted.add(grant[2]);
    }
  }
  return granted;
}

function clientSelectTables(source: string): string[] {
  const tables = new Set<string>();
  const re = /\.from\('([a-z_]+)'\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const after = source.slice(match.index + match[0].length, match.index + match[0].length + 320);
    const selectAt = after.search(/\.select\s*\(/);
    if (selectAt < 0) continue;
    if (/\.from\(/.test(after.slice(0, selectAt))) continue;
    tables.add(match[1]);
  }
  return [...tables].sort();
}

type UpsertGrant = { tableLevel: boolean; columns: Set<string> };

function splitPrivileges(list: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (const char of list) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Column and table UPDATE grants after every migration, in filename order. */
function authenticatedUpdateGrants(): Map<string, UpsertGrant> {
  const tables = new Map<string, UpsertGrant>();
  const files = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  const grantRe = /grant\s+([\s\S]+?)\s+on\s+(?:table\s+)?public\.([a-z_]+)\s+to\s+authenticated\b/gi;
  const revokeAllRe = /revoke\s+all\s+privileges\s+on\s+all\s+tables\s+in\s+schema\s+public\s+from\s+[^;]*\bauthenticated\b/gi;
  const revokeTableRe = /revoke\s+all\s+on\s+(?:table\s+)?public\.([a-z_]+)\s+from\s+([^;]+)/gi;
  for (const name of files) {
    const source = readFileSync(`supabase/migrations/${name}`, 'utf8').replace(/--[^\n]*/g, ' ');
    const events: { at: number; apply: () => void }[] = [];
    for (const match of source.matchAll(revokeAllRe)) {
      events.push({ at: match.index ?? 0, apply: () => tables.clear() });
    }
    for (const match of source.matchAll(revokeTableRe)) {
      if (!/\bauthenticated\b/i.test(match[2])) continue;
      const table = match[1];
      events.push({ at: match.index ?? 0, apply: () => tables.delete(table) });
    }
    for (const match of source.matchAll(grantRe)) {
      const privileges = splitPrivileges(match[1]);
      const table = match[2];
      events.push({
        at: match.index ?? 0,
        apply: () => {
          const state = tables.get(table) ?? { tableLevel: false, columns: new Set<string>() };
          for (const privilege of privileges) {
            const columns = /^update\s*\(([^)]+)\)$/i.exec(privilege);
            if (columns) {
              for (const column of columns[1].split(',')) {
                const name = column.trim();
                if (name) state.columns.add(name);
              }
            } else if (/^update$/i.test(privilege)) {
              state.tableLevel = true;
            }
          }
          tables.set(table, state);
        },
      });
    }
    events.sort((left, right) => left.at - right.at);
    for (const event of events) event.apply();
  }
  return tables;
}

function updateCovers(grants: Map<string, UpsertGrant>, table: string, column: string): boolean {
  const state = grants.get(table);
  return Boolean(state && (state.tableLevel || state.columns.has(column)));
}

function upsertArgument(source: string, table: string): string {
  const needle = `.from('${table}').upsert(`;
  const start = source.indexOf(needle);
  if (start < 0) return '';
  let depth = 1;
  const open = start + needle.length;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0) return source.slice(open, index);
  }
  return '';
}

describe('client upsert update grants', () => {
  const grants = authenticatedUpdateGrants();
  const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
  const added = readFileSync('supabase/migrations/20261015230000_upsert_update_grants.sql', 'utf8');

  const sent: Record<string, { columns: string[]; withheld: string[] }> = {
    health_samples: {
      columns: ['user_id', 'kind', 'value', 'unit', 'recorded_on', 'source'],
      withheld: ['id', 'created_at'],
    },
    device_tokens: {
      columns: ['user_id', 'expo_push_token', 'platform', 'updated_at'],
      withheld: ['id', 'created_at'],
    },
    user_quotes: {
      columns: ['user_id', 'quote_id'],
      withheld: ['created_at'],
    },
    nutrition_settings: {
      columns: [
        'user_id', 'kcal_target', 'hide_calories', 'share_food_diary', 'share_calories',
        'share_quality', 'share_progress', 'goal', 'goal_age', 'goal_sex', 'protein_target_g',
        'carb_target_g', 'fat_target_g', 'goal_phase', 'weight_class_kg', 'activity_energy_kcal',
        'share_goal', 'wagon_on', 'wagon_note', 'wagon_visible', 'build', 'updated_at',
      ],
      withheld: [],
    },
    nutrition_days: {
      columns: ['user_id', 'day', 'water_ml'],
      withheld: [],
    },
    body_composition: {
      columns: ['user_id', 'recorded_on', 'body_fat_pct', 'lean_mass_kg', 'waist_cm', 'source'],
      withheld: ['id', 'created_at'],
    },
    health_plans: {
      columns: ['user_id', 'focus', 'nutrition', 'fitness', 'wellbeing', 'limits', 'disclaimer', 'updated_at'],
      withheld: [],
    },
    profile_sharing: {
      columns: ['user_id', 'settings', 'updated_at'],
      withheld: [],
    },
  };

  it('covers every column a client upsert sends, and not the key columns it leaves out', () => {
    const calls = [...repo.matchAll(/\.from\('([a-z_]+)'\)\.upsert\(/g)].map((match) => match[1]);
    expect([...new Set(calls)].sort()).toEqual(Object.keys(sent).sort());
    for (const [table, spec] of Object.entries(sent)) {
      const argument = upsertArgument(repo, table);
      for (const column of spec.columns) {
        expect(updateCovers(grants, table, column), `${table}.${column}`).toBe(true);
        if (argument.trimStart().startsWith('{') || argument.includes('=>')) {
          expect(argument).toMatch(new RegExp(`\\b${column}\\b`));
        }
      }
      for (const column of spec.withheld) {
        expect(argument).not.toMatch(new RegExp(`\\b${column}\\s*:`));
        const tableLevel = grants.get(table)?.tableLevel === true;
        if (tableLevel) continue;
        expect(updateCovers(grants, table, column), `${table}.${column}`).toBe(false);
      }
    }
    expect(grants.get('nutrition_settings')?.tableLevel).toBe(true);
    expect(grants.get('nutrition_days')?.tableLevel).toBe(true);
    expect(grants.get('body_composition')?.tableLevel).toBe(true);
    expect(grants.get('profile_sharing')?.tableLevel).toBe(true);
    expect(grants.get('health_samples')?.tableLevel).toBe(false);
    expect(grants.get('user_quotes')?.tableLevel).toBe(false);
    expect(grants.get('health_plans')?.tableLevel).toBe(false);
  });

  it('adds the quote conflict columns without redoing the health plan grant', () => {
    expect(added).toContain('grant update (user_id, quote_id) on public.user_quotes to authenticated');
    expect(added).toContain('create policy user_quotes_update on public.user_quotes');
    expect(added).toContain('using (user_id = auth.uid())');
    expect(added).toContain('with check (user_id = auth.uid())');
    expect(added).toContain('user_quotes still allows updates of created_at');
    expect(added).not.toMatch(/drop table|delete from/i);
    expect(added).not.toMatch(/on\s+(?:table\s+)?public\.health_plans\b/i);
    expect(added).not.toMatch(/on\s+(?:table\s+)?public\.health_samples\b/i);
    expect(readFileSync('supabase/migrations/20261015220000_health_plans_upsert_grant.sql', 'utf8'))
      .toContain('grant update (user_id) on public.health_plans to authenticated');
    expect(updateCovers(grants, 'user_quotes', 'user_id')).toBe(true);
    expect(updateCovers(grants, 'user_quotes', 'quote_id')).toBe(true);
    expect(updateCovers(grants, 'user_quotes', 'created_at')).toBe(false);
    expect(updateCovers(grants, 'device_tokens', 'user_id')).toBe(true);
  });
});

describe('client reads against the live grants', () => {
  it('does not select a table authenticated cannot read', () => {
    const granted = authenticatedSelectTables();
    const selected = clientSelectTables(readFileSync('src/data/supabase-repository.ts', 'utf8'));
    expect(selected.filter((table) => !granted.has(table))).toEqual([]);
    expect(selected).not.toContain('blocks');
    expect(selected).not.toContain('client_errors');
    expect(selected).not.toContain('message_push_log');
    expect(granted.has('connections')).toBe(true);
    expect(granted.has('direct_messages')).toBe(true);
    expect(granted.has('blocks')).toBe(false);
  });
});
