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

function aimLine(metric: string, goalLabel: string | null): string {
  const who = goalLabel ? ` for ${goalLabel}` : '';
  return `No separate published ${metric} range${who}. ${REFERENCE_NOT_A_TARGET}`;
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
    meaning: `${zoneSentence(zones)} ${aimLine('session heart-rate', goalLabel)} ${BAND_CAVEAT}`,
    rangeNote: aimLine('session heart-rate', goalLabel),
    links: [TANAKA_LINK, ACSM_LINK, AHA_LINK, NHS_ACTIVITY_LINK],
    zoneLow: zones.moderateLow,
    zoneHigh: zones.moderateHigh,
    zoneCaption: `Moderate ${zones.moderateLow}–${zones.moderateHigh} bpm`,
    goalLow: zones.vigorousLow,
    goalHigh: zones.vigorousHigh,
    goalCaption: `Vigorous ${zones.vigorousLow}–${zones.vigorousHigh} bpm. ${REFERENCE_NOT_A_TARGET}`,
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
  return {
    status: `${where} This is an approximation.`,
    meaning: `Apple publishes no normal range for walking heart rate. The 2024 Apple note calls the daily average a baseline for light exercise. Brisk walking is an NHS example of moderate activity, so the moderate zone is used here as an approximation, not as an Apple norm. Ordinary walking can sit lower. ${zoneSentence(zones)} ${aimLine('walking heart-rate', goalLabel)} ${BAND_CAVEAT}`,
    rangeNote: `Approximation, not an Apple norm. ${aimLine('walking heart-rate', goalLabel)}`,
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
    meaning: `Cole and colleagues, in 1999, followed adults referred for a treadmill test. A fall of ${COLE_ABNORMAL_AT_OR_UNDER} bpm or less in the first minute was called abnormal. The middle half of that group fell by ${COLE_MIDDLE_LOW} to ${COLE_MIDDLE_HIGH} bpm. The test used a cool-down, the group was not a healthy population, and the paper has no age or sex table. Apple Watch recovery can be measured differently. ${aimLine('heart-rate recovery', goalLabel)} ${BAND_CAVEAT}`,
    rangeNote: `Middle half of that referred group: ${COLE_MIDDLE_LOW} to ${COLE_MIDDLE_HIGH} bpm. ${REFERENCE_NOT_A_TARGET}`,
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
    meaning: `Nunan, Sandercock, and Brodie, 2010, reviewed short-term SDNN in healthy adults. Across 27 studies the values averaged ${NUNAN_SDNN_MEAN} ms, and those study values ran from ${NUNAN_SDNN_LOW} to ${NUNAN_SDNN_HIGH} ms. That spread is not a personal target, and the summary table is not split by age or sex. A 24-hour age table is a different recording from a watch sample, so it is not used here. ${aimLine('heart-rate variability', goalLabel)} ${BAND_CAVEAT}`,
    rangeNote: aimLine('heart-rate variability', goalLabel),
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
  return `The British Heart Foundation, page updated in 2026, says a usual adult resting rate is 60 to 100 bpm. Below 60 can be usual for people who are very fit. The page says women tend to be slightly higher and does not give a separate number, and it does not split the range by age. ${aimLine('resting-heart-rate', goalLabel)}`;
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
