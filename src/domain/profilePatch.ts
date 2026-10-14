import type { Profile, ProfilePatch } from '@/data/types';

/** The profile the screen should show the moment a chip or field is chosen. */
export function profileWithPatch(profile: Profile, patch: ProfilePatch): Profile {
  const next: Profile = { ...profile };
  if (patch.displayName != null) next.displayName = patch.displayName.trim();
  if (patch.town !== undefined) next.town = patch.town?.trim() || null;
  if (patch.weeklySpendGbp !== undefined) next.weeklySpendGbp = patch.weeklySpendGbp;
  if (patch.weeklyUnits !== undefined) next.weeklyUnits = patch.weeklyUnits;
  if (patch.communityVisible !== undefined) next.communityVisible = patch.communityVisible;
  if (patch.consentHealth !== undefined) next.consentHealth = patch.consentHealth;
  if (patch.consentAi !== undefined) next.consentAi = patch.consentAi;
  if (patch.textScale !== undefined) next.textScale = patch.textScale;
  if (patch.themePreference !== undefined) next.themePreference = patch.themePreference;
  if (patch.interestIds !== undefined) next.interestIds = [...patch.interestIds];
  if (patch.stage !== undefined) next.stage = patch.stage;
  if (patch.sobrietyStartedAt !== undefined) next.sobrietyStartedAt = patch.sobrietyStartedAt;
  if (patch.plannedQuitAt !== undefined) next.plannedQuitAt = patch.plannedQuitAt;
  if (patch.weeklyUnitsGoal !== undefined) next.weeklyUnitsGoal = patch.weeklyUnitsGoal;
  if (patch.drinkFreeDaysGoal !== undefined) next.drinkFreeDaysGoal = patch.drinkFreeDaysGoal;
  if (patch.drinkFreeOn !== undefined) next.drinkFreeOn = [...patch.drinkFreeOn];
  if (patch.heightCm !== undefined) next.heightCm = patch.heightCm;
  if (patch.visionStatement !== undefined) next.visionStatement = patch.visionStatement || '';
  if (patch.visionStartedOn !== undefined) next.visionStartedOn = patch.visionStartedOn;
  if (patch.pinnedQuoteId !== undefined) next.pinnedQuoteId = patch.pinnedQuoteId;
  if (patch.bio !== undefined) next.bio = patch.bio;
  if (patch.messageNotifications !== undefined) next.messageNotifications = patch.messageNotifications;
  if (patch.notifySenderName !== undefined) next.notifySenderName = patch.notifySenderName;
  return next;
}

/** Apply a profiles-table update back onto the in-memory profile. */
export function profileWithColumn(
  profile: Profile,
  column: Record<string, unknown>,
  interestIds?: string[],
): Profile {
  const next: Profile = { ...profile };
  if ('display_name' in column) next.displayName = String(column.display_name ?? '');
  if ('town' in column) next.town = (column.town as string | null) ?? null;
  if ('weekly_spend_gbp' in column) next.weeklySpendGbp = column.weekly_spend_gbp == null ? null : Number(column.weekly_spend_gbp);
  if ('weekly_units' in column) next.weeklyUnits = column.weekly_units == null ? null : Number(column.weekly_units);
  if ('community_visible' in column) next.communityVisible = Boolean(column.community_visible);
  if ('consent_health' in column) next.consentHealth = Boolean(column.consent_health);
  if ('consent_ai' in column) next.consentAi = Boolean(column.consent_ai);
  if ('text_scale' in column) next.textScale = column.text_scale as Profile['textScale'];
  if ('theme_preference' in column) next.themePreference = column.theme_preference as Profile['themePreference'];
  if ('stage' in column) next.stage = column.stage as Profile['stage'];
  if ('sobriety_started_at' in column) next.sobrietyStartedAt = (column.sobriety_started_at as string | null) ?? null;
  if ('planned_quit_at' in column) next.plannedQuitAt = (column.planned_quit_at as string | null) ?? null;
  if ('weekly_units_goal' in column) next.weeklyUnitsGoal = column.weekly_units_goal == null ? null : Number(column.weekly_units_goal);
  if ('drink_free_days_goal' in column) next.drinkFreeDaysGoal = column.drink_free_days_goal == null ? null : Number(column.drink_free_days_goal);
  if ('drink_free_on' in column) next.drinkFreeOn = Array.isArray(column.drink_free_on) ? column.drink_free_on.map(String) : [];
  if ('height_cm' in column) next.heightCm = column.height_cm == null ? null : Number(column.height_cm);
  if ('vision_statement' in column) next.visionStatement = typeof column.vision_statement === 'string' ? column.vision_statement : '';
  if ('vision_started_on' in column) next.visionStartedOn = (column.vision_started_on as string | null) ?? null;
  if ('pinned_quote_id' in column) next.pinnedQuoteId = (column.pinned_quote_id as string | null) ?? null;
  if ('bio' in column) next.bio = typeof column.bio === 'string' ? column.bio : '';
  if ('message_notifications' in column) next.messageNotifications = Boolean(column.message_notifications);
  if ('notify_sender_name' in column) next.notifySenderName = Boolean(column.notify_sender_name);
  if (interestIds) next.interestIds = [...interestIds];
  return next;
}
