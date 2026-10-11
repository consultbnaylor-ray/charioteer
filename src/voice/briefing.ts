import type { AppSnapshot } from '@/data/types';
import { isoDay } from '@/domain/dates';
import { buildHealthInsights } from '@/domain/healthInsights';
import { visionContextFrom } from '@/domain/visionBoard';
import { drinkFreeThisWeek } from '@/domain/stage';
import { quoteById } from '@/domain/stoicQuotes';
import { buildVoiceBriefing, type VoiceBriefing } from '@/domain/voice';
import type { HealthTrend, ThumosMode } from '@/domain/thumos';

function healthTrends(samples: AppSnapshot['health']): HealthTrend[] {
  const ordered = [...samples].sort((left, right) => (left.recordedOn < right.recordedOn ? 1 : left.recordedOn > right.recordedOn ? -1 : 0));
  const byKind = new Map<string, typeof ordered>();
  for (const sample of ordered) {
    const list = byKind.get(sample.kind) ?? [];
    list.push(sample);
    byKind.set(sample.kind, list);
  }
  return [...byKind.entries()].map(([kind, rows]) => ({
    kind,
    latest: rows[0]?.value ?? null,
    previous: rows[1]?.value ?? null,
    unit: rows[0]?.unit ?? '',
  }));
}

/** Client copy of the voice prompt, used when the token function has not been redeployed yet. */
export function briefingFromSnapshot(snap: AppSnapshot, requestedMode: ThumosMode): VoiceBriefing | null {
  const profile = snap.profile;
  if (!profile) return null;
  const now = new Date();
  const shareHealth = profile.consentAi && profile.consentHealth;
  const soberOn = shareHealth && profile.stage === 'stopped' && profile.sobrietyStartedAt
    ? isoDay(new Date(profile.sobrietyStartedAt))
    : null;
  const healthInsights = shareHealth
    ? buildHealthInsights({
        today: isoDay(now),
        samples: snap.health,
        soberOn,
        stage: profile.stage,
      }).headlines
    : [];
  return buildVoiceBriefing({
    requestedMode,
    historyRows: snap.thumos.map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })),
    context: {
      now,
      displayName: profile.displayName,
      sobrietyStartedAt: profile.sobrietyStartedAt,
      stage: profile.stage,
      plannedQuitAt: profile.plannedQuitAt,
      weeklyUnitsGoal: profile.weeklyUnitsGoal,
      drinkFreeDaysGoal: profile.drinkFreeDaysGoal,
      drinkFreeThisWeek: drinkFreeThisWeek(profile.drinkFreeOn, now),
      reasons: snap.reasons.map((reason) => reason.body),
      weeklySpendGbp: profile.weeklySpendGbp,
      weeklyUnits: profile.weeklyUnits,
      checkIns: snap.checkIns.slice(0, 7).map((item) => ({
        createdAt: item.createdAt,
        mood: item.mood,
        sleepHours: item.sleepHours,
        craving: item.craving,
        note: item.note,
      })),
      health: shareHealth ? healthTrends(snap.health) : [],
      healthInsights,
      vision: profile.consentAi
        ? visionContextFrom(profile.visionStatement, profile.visionStartedOn, snap.visionItems)
        : undefined,
      interests: snap.interests
        .filter((item) => profile.interestIds.includes(item.id))
        .map((item) => item.label),
      pinnedQuote: profile.consentAi
        ? (() => {
            const quote = quoteById(profile.pinnedQuoteId);
            return quote ? { text: quote.text, author: quote.author, source: quote.source } : null;
          })()
        : null,
      mode: requestedMode,
      safety: { selfHarm: false, withdrawal: false, reasons: [] },
    },
  });
}
