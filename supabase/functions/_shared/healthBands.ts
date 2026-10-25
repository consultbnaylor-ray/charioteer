/**
 * Comparison bands copied from sources that were opened.
 * A missing age or a missing table stays missing. Nothing here is filled in.
 */

export const BAND_CAVEAT =
  'Population averages vary by person, medication and fitness. Not medical advice. Speak to your GP if something worries you.';

export const REFERENCE_NOT_A_TARGET = 'This is a reference, not a target.';

export const TANAKA_URL = 'https://www.jacc.org/doi/full/10.1016/S0735-1097(00)01054-8';
export const ACSM_ZONE_URL = 'https://journals.lww.com/acsm-healthfitness/fulltext/2023/11000/estimating_maximal_heart_rate.4.aspx';
export const AHA_HEART_URL = 'https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/target-heart-rates';
export const NHS_ACTIVITY_URL = 'https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/';
export const APPLE_HEART_URL = 'https://www.apple.com/health/pdf/Heart_Rate_Calorimetry_Activity_on_Apple_Watch_November_2024.pdf';
export const NUNAN_SDNN_URL = 'https://onlinelibrary.wiley.com/doi/10.1111/j.1540-8159.2010.02841.x';
export const COLE_RECOVERY_URL = 'https://www.nejm.org/doi/full/10.1056/NEJM199910283411804';
export const FRIEND_URL = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4919021/';
export const BHF_HEART_URL = 'https://www.bhf.org.uk/informationsupport/how-a-healthy-heart-works/your-heart-rate';

export type BandLink = { name: string; url: string; year: number | null };

export const TANAKA_LINK: BandLink = {
  name: 'Tanaka, Monahan, and Seals, 2001',
  url: TANAKA_URL,
  year: 2001,
};
export const ACSM_LINK: BandLink = {
  name: 'American College of Sports Medicine, quoted in 2023',
  url: ACSM_ZONE_URL,
  year: 2023,
};
export const AHA_LINK: BandLink = {
  name: 'American Heart Association, 2024',
  url: AHA_HEART_URL,
  year: 2024,
};
export const NHS_ACTIVITY_LINK: BandLink = {
  name: 'NHS: physical activity for adults',
  url: NHS_ACTIVITY_URL,
  year: null,
};
export const APPLE_HEART_LINK: BandLink = {
  name: 'Apple, heart rate on Apple Watch, 2024',
  url: APPLE_HEART_URL,
  year: 2024,
};
export const NUNAN_LINK: BandLink = {
  name: 'Nunan, Sandercock, and Brodie, 2010',
  url: NUNAN_SDNN_URL,
  year: 2010,
};
export const COLE_LINK: BandLink = {
  name: 'Cole, Blackstone, Pashkow, Snader, and Lauer, 1999',
  url: COLE_RECOVERY_URL,
  year: 1999,
};
export const FRIEND_LINK: BandLink = {
  name: 'Kaminsky, Arena, and Myers, 2015',
  url: FRIEND_URL,
  year: 2015,
};
export const BHF_LINK: BandLink = {
  name: 'British Heart Foundation, 2026',
  url: BHF_HEART_URL,
  year: 2026,
};

/** ACSM Guidelines for Exercise Testing and Prescription, as quoted in 2023. Percents of maximum heart rate. */
export const ACSM_MODERATE_LOW = 64;
export const ACSM_MODERATE_HIGH = 76;
export const ACSM_VIGOROUS_LOW = 77;
export const ACSM_VIGOROUS_HIGH = 95;

/** American Heart Association, page last reviewed in 2024. Percents of about 220 minus age. */
export const AHA_MODERATE_LOW = 50;
export const AHA_MODERATE_HIGH = 70;
export const AHA_VIGOROUS_LOW = 70;
export const AHA_VIGOROUS_HIGH = 85;
export const AHA_ATHLETE_RESTING_LOW = 40;

/** Nunan, Sandercock, and Brodie, 2010. Cross-study short-term SDNN, 27 studies. Not one person's range. */
export const NUNAN_SDNN_MEAN = 50;
export const NUNAN_SDNN_LOW = 32;
export const NUNAN_SDNN_HIGH = 93;

/**
 * Cole and colleagues, NEJM 1999. Adults referred for a treadmill test, cool-down included.
 * A fall of 12 bpm or less was called abnormal. The middle half of that group fell by 12 to 23 bpm.
 */
export const COLE_ABNORMAL_AT_OR_UNDER = 12;
export const COLE_MIDDLE_LOW = 12;
export const COLE_MIDDLE_HIGH = 23;

const NOT_A_TOP = 'These zones describe intensity. They are not a target to reach the top of the range.';
const NHS_NO_BPM = 'The NHS does not publish a beats-per-minute range. Moderate activity is a pace where you can talk but not sing. Vigorous activity is a pace where you can say only a few words.';

export type IntensityZones = {
  tanakaMax: number;
  moderateLow: number;
  moderateHigh: number;
  vigorousLow: number;
  vigorousHigh: number;
  ahaMax: number;
  ahaModerateLow: number;
  ahaModerateHigh: number;
  ahaVigorousLow: number;
  ahaVigorousHigh: number;
};

function adultAge(age: number | null | undefined): number | null {
  if (age == null || !Number.isFinite(age) || age < 18 || age > 100) return null;
  return age;
}

function percentBpm(max: number, percent: number): number {
  return Math.round(max * (percent / 100));
}

/** Tanaka, Monahan, and Seals, 2001: 208 − 0.7 × age in healthy adults. Sex did not change the line. */
export function tanakaMaxHeartRate(age: number | null | undefined): number | null {
  const years = adultAge(age);
  if (years == null) return null;
  return Math.round((208 - 0.7 * years) * 10) / 10;
}

export function intensityZones(age: number | null | undefined): IntensityZones | null {
  const years = adultAge(age);
  const tanakaMax = tanakaMaxHeartRate(years);
  if (years == null || tanakaMax == null) return null;
  const ahaMax = 220 - Math.round(years);
  return {
    tanakaMax,
    moderateLow: percentBpm(tanakaMax, ACSM_MODERATE_LOW),
    moderateHigh: percentBpm(tanakaMax, ACSM_MODERATE_HIGH),
    vigorousLow: percentBpm(tanakaMax, ACSM_VIGOROUS_LOW),
    vigorousHigh: percentBpm(tanakaMax, ACSM_VIGOROUS_HIGH),
    ahaMax,
    ahaModerateLow: percentBpm(ahaMax, AHA_MODERATE_LOW),
    ahaModerateHigh: percentBpm(ahaMax, AHA_MODERATE_HIGH),
    ahaVigorousLow: percentBpm(ahaMax, AHA_VIGOROUS_LOW),
    ahaVigorousHigh: percentBpm(ahaMax, AHA_VIGOROUS_HIGH),
  };
}

export function zonePlace(bpm: number, zones: IntensityZones): 'under' | 'moderate' | 'between' | 'vigorous' | 'over' {
  if (bpm < zones.moderateLow) return 'under';
  if (bpm <= zones.moderateHigh) return 'moderate';
  if (bpm < zones.vigorousLow) return 'between';
  if (bpm <= zones.vigorousHigh) return 'vigorous';
  return 'over';
}

function zoneWords(place: ReturnType<typeof zonePlace>): string {
  if (place === 'moderate') return 'Inside the moderate zone';
  if (place === 'vigorous') return 'Inside the vigorous zone';
  if (place === 'between') return 'Between the moderate and vigorous zones';
  if (place === 'over') return 'Above the vigorous zone';
  return 'Below the moderate zone';
}

/** Order is fixed: the first step with a citable figure is the comparison. */
export const FALLBACK_STEPS = ['goal', 'family', 'elite', 'athlete', 'adult'] as const;
export type FallbackStep = (typeof FALLBACK_STEPS)[number];

export type FallbackCite = {
  /** Who the figure describes. Never the user's own aim when this is a stand-in. */
  who: string;
  source: string;
  detail: string;
};

export type FallbackChainStep = {
  step: FallbackStep;
  cite: FallbackCite | null;
  skippedBecause: string | null;
};

export type MetricFallback = {
  metricId: string;
  used: FallbackStep | null;
  /** True only when the figure is published for the chosen aim itself. */
  goalSpecific: boolean;
  chain: FallbackChainStep[];
  sentence: string;
};

const NO_GOAL = 'No published range for this aim.';
const NO_FAMILY = 'No citable range for this aim\'s family (combat, strength, or endurance).';
const NO_ELITE = 'No citable general elite athlete figure for this metric.';
const NO_ATHLETE = 'No citable athlete or highly active adult figure for this metric.';
const NO_ADULT = 'No citable general adult figure for this metric.';
const NOT_ATHLETIC = 'This aim is not an athlete aim, so an athlete figure is not used as a similar stand-in.';

export const FALLBACK_METRIC_IDS = [
  'resting_heart_rate',
  'session_heart_rate',
  'walking_heart_rate',
  'heart_rate_recovery',
  'hrv',
  'vo2_max',
  'steps',
  'sleep_hours',
  'stress',
  'body_battery',
  'weight_kg',
  'intensity_minutes',
  'respiration',
] as const;
export type FallbackMetricId = (typeof FALLBACK_METRIC_IDS)[number];

const METRIC_NAMES: Record<FallbackMetricId, string> = {
  resting_heart_rate: 'resting heart rate',
  session_heart_rate: 'session heart rate',
  walking_heart_rate: 'walking heart rate',
  heart_rate_recovery: 'heart-rate recovery',
  hrv: 'heart-rate variability',
  vo2_max: 'cardio fitness',
  steps: 'step',
  sleep_hours: 'sleep',
  stress: 'stress',
  body_battery: 'Body Battery',
  weight_kg: 'weight',
  intensity_minutes: 'activity-minute',
  respiration: 'breathing-rate',
};

/** A short "a cruiserweight boxer" from a saved aim name. The full name stays on the stand-in warning. */
export function specificAim(goalLabel: string): string {
  const inner = goalLabel.match(/\(([^)]+)\)/)?.[1]?.replace(/\s*etc\.?/i, '').trim();
  if (!inner) return goalLabel;
  return `a ${inner.toLowerCase()}`;
}

function athleticAim(goalLabel: string | null): boolean {
  if (!goalLabel) return false;
  return /^elite athlete\b/i.test(goalLabel) || /^body builder$/i.test(goalLabel);
}

function skipReason(metricId: string, step: FallbackStep, goalLabel: string | null): string {
  if (step === 'goal') return NO_GOAL;
  if (step === 'family') return NO_FAMILY;
  if (step === 'elite') {
    if (metricId === 'resting_heart_rate') {
      return 'No citable general-elite resting range. The American Heart Association figure is for an athlete or a more active person, not a separate elite band.';
    }
    if (metricId === 'vo2_max') {
      return 'No separate general-elite cardio figure is cited here. Male boxing classes use Kim, Song, and Min, 2016, only when that study group matches.';
    }
    return NO_ELITE;
  }
  if (step === 'athlete') {
    if (!athleticAim(goalLabel)) return NOT_ATHLETIC;
    return NO_ATHLETE;
  }
  if (metricId === 'vo2_max') {
    return 'Kaminsky, Arena, and Myers, 2015, is the age and sex band when age and sex are set. No number is filled in without them.';
  }
  if (metricId === 'respiration' || metricId === 'stress' || metricId === 'body_battery') {
    return 'No named general-adult range is cited for this metric, so none is invented.';
  }
  return NO_ADULT;
}

const AHA_ATHLETE_CITE: FallbackCite = {
  who: 'an athlete or a more active person',
  source: 'American Heart Association, 2024',
  detail: `a resting rate may be as low as ${AHA_ATHLETE_RESTING_LOW} bpm`,
};

const BHF_ADULT_CITE: FallbackCite = {
  who: 'a general adult',
  source: 'British Heart Foundation, 2026',
  detail: 'a usual resting rate is 60 to 100 bpm',
};

function emptyCites(): Record<FallbackStep, FallbackCite | null> {
  return { goal: null, family: null, elite: null, athlete: null, adult: null };
}

/** Built-in cites. A null step is skipped. Callers may pass a real goal figure, such as a boxing cardio band. */
export function builtinFallbackCites(metricId: string, goalLabel: string | null): Record<FallbackStep, FallbackCite | null> {
  const cites = emptyCites();
  if (metricId === 'resting_heart_rate') {
    cites.athlete = athleticAim(goalLabel) ? AHA_ATHLETE_CITE : null;
    cites.adult = BHF_ADULT_CITE;
    return cites;
  }
  if (metricId === 'session_heart_rate') {
    cites.adult = {
      who: 'a general adult',
      source: 'Tanaka, Monahan, and Seals, 2001, and the American College of Sports Medicine',
      detail: 'moderate and vigorous zones estimated from age',
    };
    return cites;
  }
  if (metricId === 'walking_heart_rate') {
    cites.adult = {
      who: 'a general adult',
      source: 'Tanaka, Monahan, and Seals, 2001',
      detail: 'the moderate zone used as an approximation, not an Apple norm',
    };
    return cites;
  }
  if (metricId === 'heart_rate_recovery') {
    cites.adult = {
      who: 'adults referred for a treadmill test',
      source: 'Cole and colleagues, 1999',
      detail: `a fall of ${COLE_ABNORMAL_AT_OR_UNDER} bpm or less in the first minute was called abnormal. That group was not a healthy population`,
    };
    return cites;
  }
  if (metricId === 'hrv') {
    cites.adult = {
      who: 'healthy adults in that review',
      source: 'Nunan, Sandercock, and Brodie, 2010',
      detail: `short-term SDNN study averages from ${NUNAN_SDNN_LOW} to ${NUNAN_SDNN_HIGH} ms`,
    };
    return cites;
  }
  if (metricId === 'steps') {
    cites.adult = {
      who: 'a general adult',
      source: 'Ding and colleagues, The Lancet Public Health, 2025',
      detail: 'about 7,000 steps a day was linked with better outcomes than 2,000, and about 10,000 can still suit people who are more active. The NHS sets no daily step target',
    };
    return cites;
  }
  if (metricId === 'sleep_hours') {
    cites.adult = {
      who: 'a general adult',
      source: 'NHS',
      detail: 'most adults need 7 to 9 hours a night',
    };
    return cites;
  }
  if (metricId === 'weight_kg') {
    cites.adult = {
      who: 'a general adult',
      source: 'NICE NG246 and the NHS',
      detail: 'a healthy weight for most adults is a BMI of 18.5 to 24.9. That is not a sport range',
    };
    return cites;
  }
  if (metricId === 'intensity_minutes') {
    cites.adult = {
      who: 'a general adult',
      source: 'NHS and the UK Chief Medical Officers',
      detail: '150 minutes of moderate activity a week, or 75 minutes if it is vigorous',
    };
    return cites;
  }
  return cites;
}

function standInSentence(metricName: string, goalLabel: string | null, cite: FallbackCite, goalSpecific: boolean): string {
  if (goalSpecific && goalLabel) {
    return `The published ${metricName} range for ${goalLabel} is ${cite.detail} (${cite.source}). This is the published range for ${goalLabel}. ${REFERENCE_NOT_A_TARGET}`;
  }
  if (!goalLabel) {
    return `No aim is set, so this compares you with ${cite.who} (${cite.source}: ${cite.detail}). ${REFERENCE_NOT_A_TARGET}`;
  }
  return `There is no published ${metricName} range for ${specificAim(goalLabel)} specifically, so this compares you with ${cite.who} (${cite.source}: ${cite.detail}). This stand-in is not the ${goalLabel} range. ${REFERENCE_NOT_A_TARGET}`;
}

/**
 * Nearest citable comparison for an aim that has no published range of its own.
 * A supplied cite replaces the built-in for that step, including an explicit null.
 */
export function metricFallback(input: {
  metricId: string;
  metricName?: string;
  goalLabel: string | null;
  published?: Partial<Record<FallbackStep, FallbackCite | null>>;
}): MetricFallback {
  const metricName = input.metricName ?? METRIC_NAMES[input.metricId as FallbackMetricId] ?? input.metricId;
  const builtin = builtinFallbackCites(input.metricId, input.goalLabel);
  const chain: FallbackChainStep[] = FALLBACK_STEPS.map((step) => {
    const cite = input.published && Object.prototype.hasOwnProperty.call(input.published, step)
      ? input.published[step] ?? null
      : builtin[step];
    return { step, cite, skippedBecause: cite ? null : skipReason(input.metricId, step, input.goalLabel) };
  });
  const hit = chain.find((step) => step.cite);
  if (!hit?.cite) {
    const who = input.goalLabel ? ` for ${specificAim(input.goalLabel)} specifically` : '';
    return {
      metricId: input.metricId,
      used: null,
      goalSpecific: false,
      chain,
      sentence: `There is no published ${metricName} range${who}, and no citable stand-in, so no number is compared. ${REFERENCE_NOT_A_TARGET}`,
    };
  }
  const goalSpecific = hit.step === 'goal';
  return {
    metricId: input.metricId,
    used: hit.step,
    goalSpecific,
    chain,
    sentence: standInSentence(metricName, input.goalLabel, hit.cite, goalSpecific),
  };
}

/** The chain for every metric, using only built-in cites. A boxing cardio band is passed in by the fitness card. */
export function fallbackReport(goalLabel: string | null): MetricFallback[] {
  return FALLBACK_METRIC_IDS.map((metricId) => metricFallback({ metricId, goalLabel }));
}

function aimLine(metricId: string, metricName: string, goalLabel: string | null): string {
  return metricFallback({ metricId, metricName, goalLabel }).sentence;
}

function zoneSentence(zones: IntensityZones): string {
  return `Estimated maximum heart rate ${zones.tanakaMax} bpm, from 208 − 0.7 × age. That line did not change with sex. Moderate is ${ACSM_MODERATE_LOW}–${ACSM_MODERATE_HIGH}% of that maximum, ${zones.moderateLow} to ${zones.moderateHigh} bpm. Vigorous is ${ACSM_VIGOROUS_LOW}–${ACSM_VIGOROUS_HIGH}%, ${zones.vigorousLow} to ${zones.vigorousHigh} bpm. The American Heart Association uses about 220 − age, here ${zones.ahaMax} bpm, and calls moderate about ${AHA_MODERATE_LOW}–${AHA_MODERATE_HIGH}% (${zones.ahaModerateLow} to ${zones.ahaModerateHigh} bpm) and vigorous about ${AHA_VIGOROUS_LOW}–${AHA_VIGOROUS_HIGH}% (${zones.ahaVigorousLow} to ${zones.ahaVigorousHigh} bpm). ${NHS_NO_BPM} ${NOT_A_TOP}`;
}

export type CitedReading = {
  status: string;
  meaning: string;
  rangeNote: string;
  links: BandLink[];
  zoneLow: number | null;
  zoneHigh: number | null;
  zoneCaption: string | null;
  goalLow: number | null;
  goalHigh: number | null;
  goalCaption: string | null;
  scaleMin: number;
  scaleMax: number;
};

export function sessionHeartReading(bpm: number, age: number | null | undefined, goalLabel: string | null): CitedReading | null {
  const zones = intensityZones(age);
  if (!zones) return null;
  const place = zonePlace(bpm, zones);
  return {
    status: `${zoneWords(place)}. Moderate ${zones.moderateLow} to ${zones.moderateHigh} bpm. Vigorous ${zones.vigorousLow} to ${zones.vigorousHigh} bpm.`,
    meaning: `${zoneSentence(zones)} ${aimLine('session_heart_rate', 'session heart rate', goalLabel)} ${BAND_CAVEAT}`,
    rangeNote: aimLine('session_heart_rate', 'session heart rate', goalLabel),
    links: [TANAKA_LINK, ACSM_LINK, AHA_LINK, NHS_ACTIVITY_LINK],
    zoneLow: zones.moderateLow,
    zoneHigh: zones.moderateHigh,
    zoneCaption: `Moderate ${zones.moderateLow}–${zones.moderateHigh} bpm`,
    goalLow: zones.vigorousLow,
    goalHigh: zones.vigorousHigh,
    goalCaption: `Vigorous ${zones.vigorousLow}–${zones.vigorousHigh} bpm.`,
    scaleMin: Math.min(40, zones.moderateLow - 10, Math.round(bpm) - 5),
    scaleMax: Math.max(zones.vigorousHigh + 10, Math.round(bpm) + 5),
  };
}

export function walkingHeartReading(bpm: number, age: number | null | undefined, goalLabel: string | null): CitedReading | null {
  const zones = intensityZones(age);
  if (!zones) return null;
  const place = zonePlace(bpm, zones);
  const where = place === 'moderate'
    ? `Inside the approximate moderate zone, ${zones.moderateLow} to ${zones.moderateHigh} bpm.`
    : `${zoneWords(place)}. The approximate moderate zone is ${zones.moderateLow} to ${zones.moderateHigh} bpm.`;
  const standIn = `Approximation, not an Apple norm. ${aimLine('walking_heart_rate', 'walking heart rate', goalLabel)}`;
  return {
    status: `${where} This is an approximation.`,
    meaning: `Apple publishes no normal range for walking heart rate. The 2024 Apple note calls the daily average a baseline for light exercise. Brisk walking is an NHS example of moderate activity, so the moderate zone is used here as an approximation, not as an Apple norm. Ordinary walking can sit lower. ${zoneSentence(zones)} ${standIn} ${BAND_CAVEAT}`,
    rangeNote: standIn,
    links: [APPLE_HEART_LINK, NHS_ACTIVITY_LINK, TANAKA_LINK, ACSM_LINK],
    zoneLow: zones.moderateLow,
    zoneHigh: zones.moderateHigh,
    zoneCaption: `Approximate moderate zone ${zones.moderateLow}–${zones.moderateHigh} bpm`,
    goalLow: null,
    goalHigh: null,
    goalCaption: null,
    scaleMin: Math.min(40, Math.round(bpm) - 5, zones.moderateLow - 10),
    scaleMax: Math.max(zones.moderateHigh + 15, Math.round(bpm) + 5),
  };
}

export function recoveryReading(bpm: number, goalLabel: string | null): CitedReading {
  const above = bpm > COLE_ABNORMAL_AT_OR_UNDER;
  return {
    status: above
      ? `Above ${COLE_ABNORMAL_AT_OR_UNDER} bpm. In that study, ${COLE_ABNORMAL_AT_OR_UNDER} bpm or less was called abnormal.`
      : `${Math.round(bpm)} bpm is at or under ${COLE_ABNORMAL_AT_OR_UNDER} bpm, which that study called abnormal.`,
    meaning: `Cole and colleagues, in 1999, followed adults referred for a treadmill test. A fall of ${COLE_ABNORMAL_AT_OR_UNDER} bpm or less in the first minute was called abnormal. The middle half of that group fell by ${COLE_MIDDLE_LOW} to ${COLE_MIDDLE_HIGH} bpm. The test used a cool-down, the group was not a healthy population, and the paper has no age or sex table. Apple Watch recovery can be measured differently. ${aimLine('heart_rate_recovery', 'heart-rate recovery', goalLabel)} ${BAND_CAVEAT}`,
    rangeNote: `${COLE_MIDDLE_LOW} to ${COLE_MIDDLE_HIGH} bpm`,
    links: [COLE_LINK],
    zoneLow: COLE_MIDDLE_LOW,
    zoneHigh: COLE_MIDDLE_HIGH,
    zoneCaption: `Referred group, middle half ${COLE_MIDDLE_LOW}–${COLE_MIDDLE_HIGH} bpm`,
    goalLow: null,
    goalHigh: null,
    goalCaption: null,
    scaleMin: 0,
    scaleMax: Math.max(40, Math.round(bpm) + 5),
  };
}

export function hrvReading(ms: number, goalLabel: string | null): CitedReading {
  return {
    status: `Study averages ran from ${NUNAN_SDNN_LOW} to ${NUNAN_SDNN_HIGH} ms. Overall mean ${NUNAN_SDNN_MEAN} ms.`,
    meaning: `Nunan, Sandercock, and Brodie, 2010, reviewed short-term SDNN in healthy adults. Across 27 studies the values averaged ${NUNAN_SDNN_MEAN} ms, and those study values ran from ${NUNAN_SDNN_LOW} to ${NUNAN_SDNN_HIGH} ms. That spread is not a personal target, and the summary table is not split by age or sex. A 24-hour age table is a different recording from a watch sample, so it is not used here. ${aimLine('hrv', 'heart-rate variability', goalLabel)} ${BAND_CAVEAT}`,
    rangeNote: aimLine('hrv', 'heart-rate variability', goalLabel),
    links: [NUNAN_LINK],
    zoneLow: NUNAN_SDNN_LOW,
    zoneHigh: NUNAN_SDNN_HIGH,
    zoneCaption: `Study averages ${NUNAN_SDNN_LOW}–${NUNAN_SDNN_HIGH} ms`,
    goalLow: null,
    goalHigh: null,
    goalCaption: null,
    scaleMin: 0,
    scaleMax: Math.max(NUNAN_SDNN_HIGH + 10, Math.round(ms) + 5),
  };
}

export const NO_LEAN_BAND =
  'No published guideline. Lean mass in kilograms depends on height, sex, and whether a scale or a scan produced it, so a single kilogram band is not shown.';

export const NO_ENERGY_BAND =
  'No published guideline. This figure is a scaled Apple Health average, and no single published kilocalorie band matches that figure.';

export const NO_STEP_BAND =
  'No published guideline. The NHS and the UK Chief Medical Officers do not set a daily step target, so no band is drawn.';

export const NO_WORKOUT_MINUTE_BAND =
  'No published guideline for these logged minutes on their own. The activity guideline sits on active minutes, and logged workouts may not include walking.';

export const NO_MIX_BAND =
  'No published guideline for this mix. The minutes are the workout types you logged. A national mix of strength, cardio, and conditioning is not published here.';

export function athleteRestingNote(athlete: boolean): string | null {
  if (!athlete) return null;
  return `The American Heart Association, last reviewed in 2024, says an athlete or a more active person may have a resting rate as low as ${AHA_ATHLETE_RESTING_LOW} bpm. ${REFERENCE_NOT_A_TARGET}`;
}

export function restingSexNote(goalLabel: string | null): string {
  const standIn = metricFallback({
    metricId: 'resting_heart_rate',
    metricName: 'resting heart rate',
    goalLabel,
  }).sentence;
  return `The British Heart Foundation, page updated in 2026, says a usual adult resting rate is 60 to 100 bpm. Below 60 can be usual for people who are very fit. The page says women tend to be slightly higher and does not give a separate number, and it does not split the range by age. ${standIn}`;
}

/** Definitions the coach may quote. Personal readings are added separately. */
export function publishedBandGuide(): string {
  return [
    'Published comparison bands. Do not turn them into a target, a diagnosis, or a reason to chase the top of a range.',
    'Session heart rate uses Tanaka, Monahan, and Seals, 2001: maximum about 208 − 0.7 × age. ACSM, quoted in 2023: moderate 64–76% of that maximum, vigorous 77–95%. AHA, reviewed 2024, uses about 220 − age, moderate about 50–70%, vigorous about 70–85%. The NHS publishes no beats-per-minute range.',
    'Walking heart rate: Apple publishes no normal range. The 2024 Apple note calls the daily average a baseline for light exercise. The moderate zone is only an approximation, because brisk walking is an NHS example of moderate activity.',
    `Heart-rate recovery: Cole and colleagues, 1999, called a fall of ${COLE_ABNORMAL_AT_OR_UNDER} bpm or less in the first minute abnormal in adults referred for a treadmill test. The middle half fell by ${COLE_MIDDLE_LOW} to ${COLE_MIDDLE_HIGH} bpm. Not a healthy-population band.`,
    `Heart-rate variability: Nunan, Sandercock, and Brodie, 2010, short-term SDNN, mean ${NUNAN_SDNN_MEAN} ms, study values ${NUNAN_SDNN_LOW} to ${NUNAN_SDNN_HIGH} ms. Not a personal target and not an age table for a watch.`,
    `Resting heart rate: British Heart Foundation, 2026, 60 to 100 bpm for adults. An athlete may sit lower. AHA, 2024, says as low as ${AHA_ATHLETE_RESTING_LOW} bpm is possible for an athlete. ${REFERENCE_NOT_A_TARGET}`,
    'Cardio fitness age and sex bands are the FRIEND registry, Kaminsky, Arena, and Myers, 2015, 25th to 75th percentile. A boxing range, when one is shown, is a reference, not a target.',
    BAND_CAVEAT,
  ].join(' ');
}

export function referenceBandsForCoach(input: {
  age: number | null;
  goalLabel: string | null;
  athlete: boolean;
  sessionBpm: number | null;
  walkingBpm: number | null;
  recoveryBpm: number | null;
  hrvMs: number | null;
}): string {
  const lines = [publishedBandGuide()];
  const session = input.sessionBpm != null ? sessionHeartReading(input.sessionBpm, input.age, input.goalLabel) : null;
  const walking = input.walkingBpm != null ? walkingHeartReading(input.walkingBpm, input.age, input.goalLabel) : null;
  if (session) lines.push(`Their session heart rate: ${session.status}`);
  if (walking) lines.push(`Their walking heart rate: ${walking.status}`);
  if (input.recoveryBpm != null) lines.push(`Their heart-rate recovery: ${recoveryReading(input.recoveryBpm, input.goalLabel).status}`);
  if (input.hrvMs != null) lines.push(`Their heart-rate variability: ${hrvReading(input.hrvMs, input.goalLabel).status}`);
  const resting = athleteRestingNote(input.athlete);
  if (resting) lines.push(resting);
  return lines.join(' ');
}
