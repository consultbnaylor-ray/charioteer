/**
 * Extra Garmin Health API summaries. Scalar fields only.
 * A sample map, a file callback, and any position are dropped.
 * Women's health keys are named and not parsed.
 */

export type GarminBloodPressure = {
  summaryId: string;
  calendarDate: string;
  systolic: number | null;
  diastolic: number | null;
  pulseBpm: number | null;
};

export type GarminBodyComp = {
  summaryId: string;
  calendarDate: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  bmi: number | null;
  muscleMassKg: number | null;
};

export type GarminSkinTemp = {
  summaryId: string;
  calendarDate: string;
  deviationC: number | null;
};

export type GarminStressDetail = {
  summaryId: string;
  calendarDate: string;
  averageStress: number | null;
};

export type GarminEpoch = {
  summaryId: string;
  calendarDate: string;
  activeSeconds: number | null;
  steps: number | null;
  distanceMetres: number | null;
  meanHeartRateBpm: number | null;
};

export type GarminHealthSnapshot = {
  summaryId: string;
  calendarDate: string;
  heartRateBpm: number | null;
  restingHeartRateBpm: number | null;
  spo2: number | null;
  respiration: number | null;
  stress: number | null;
};

export type GarminMoveIq = {
  summaryId: string;
  calendarDate: string;
  activityType: string;
  durationSeconds: number | null;
  distanceMetres: number | null;
};

export type GarminActivityDetail = {
  summaryId: string;
  calendarDate: string;
  durationSeconds: number | null;
  distanceMetres: number | null;
  averageHeartRateBpm: number | null;
  activeKilocalories: number | null;
};

export type GarminActivityFile = {
  summaryId: string;
  calendarDate: string;
  fileType: string;
};

type Pushed<T> = T & { garminUserId: string };

export type GarminExtras = {
  bloodPressure: Pushed<GarminBloodPressure>[];
  bodyComp: Pushed<GarminBodyComp>[];
  skinTemp: Pushed<GarminSkinTemp>[];
  stress: Pushed<GarminStressDetail>[];
  epochs: Pushed<GarminEpoch>[];
  healthSnapshot: Pushed<GarminHealthSnapshot>[];
  moveIq: Pushed<GarminMoveIq>[];
  activityDetails: Pushed<GarminActivityDetail>[];
  activityFiles: Pushed<GarminActivityFile>[];
  /** Type names only. Women's health and anything we do not recognise. */
  droppedTypes: string[];
};

const HANDLED = new Set([
  'dailies',
  'activities',
  'manuallyUpdatedActivities',
  'activityDetails',
  'activityFiles',
  'moveIQActivities',
  'moveiq',
  'bloodPressures',
  'bodyComps',
  'respiration',
  'allDayRespiration',
  'hrv',
  'pulseox',
  'pulseOx',
  'skinTemp',
  'sleeps',
  'sleep',
  'stressDetails',
  'userMetrics',
  'epochs',
  'healthSnapshot',
  'deregistrations',
  'deregistration',
  'userPermissionsChange',
  'userPermissionChanges',
]);

export function emptyGarminExtras(): GarminExtras {
  return {
    bloodPressure: [],
    bodyComp: [],
    skinTemp: [],
    stress: [],
    epochs: [],
    healthSnapshot: [],
    moveIq: [],
    activityDetails: [],
    activityFiles: [],
    droppedTypes: [],
  };
}

export function parseGarminExtras(body: unknown): GarminExtras {
  const root = record(body) ?? {};
  const extras = emptyGarminExtras();
  extras.bloodPressure = rows(root, 'bloodPressures', mapBloodPressure);
  extras.bodyComp = rows(root, 'bodyComps', mapBodyComp);
  extras.skinTemp = rows(root, 'skinTemp', mapSkinTemp);
  extras.stress = rows(root, 'stressDetails', mapStress);
  extras.epochs = rows(root, 'epochs', mapEpoch);
  extras.healthSnapshot = rows(root, 'healthSnapshot', mapSnapshot);
  extras.moveIq = [...rows(root, 'moveIQActivities', mapMoveIq), ...rows(root, 'moveiq', mapMoveIq)];
  extras.activityDetails = rows(root, 'activityDetails', mapActivityDetail);
  extras.activityFiles = rows(root, 'activityFiles', mapActivityFile);
  for (const key of Object.keys(root)) {
    if (isWomensHealthKey(key)) {
      extras.droppedTypes.push(key);
      continue;
    }
    if (!HANDLED.has(key) && Array.isArray(root[key])) extras.droppedTypes.push(key);
  }
  return extras;
}

export function isWomensHealthKey(key: string): boolean {
  return /menstrual|womenshealth|pregnancy|^mct$/i.test(key);
}

function mapBloodPressure(row: Record<string, unknown>): Pushed<GarminBloodPressure> | null {
  const base = identity(row);
  if (!base) return null;
  const systolic = whole(row.systolic, 40, 250);
  const diastolic = whole(row.diastolic, 20, 180);
  if (systolic == null && diastolic == null) return null;
  return { ...base, systolic, diastolic, pulseBpm: whole(row.pulse ?? row.heartRate, 20, 250) };
}

function mapBodyComp(row: Record<string, unknown>): Pushed<GarminBodyComp> | null {
  const base = identity(row);
  if (!base) return null;
  const grams = bounded(row.weightInGrams, 20_000, 400_000);
  const muscle = bounded(row.muscleMassInGrams, 5_000, 200_000);
  const fat = bounded(row.bodyFatInPercent ?? row.bodyFat, 2, 70);
  const bmi = bounded(row.bmi ?? row.bodyMassIndex, 10, 80);
  if (grams == null && muscle == null && fat == null && bmi == null) return null;
  return {
    ...base,
    weightKg: grams == null ? null : Math.round((grams / 1000) * 10) / 10,
    bodyFatPct: fat == null ? null : Math.round(fat * 10) / 10,
    bmi: bmi == null ? null : Math.round(bmi * 10) / 10,
    muscleMassKg: muscle == null ? null : Math.round((muscle / 1000) * 10) / 10,
  };
}

function mapSkinTemp(row: Record<string, unknown>): Pushed<GarminSkinTemp> | null {
  const base = identity(row);
  if (!base) return null;
  const deviation = bounded(row.avgDeviationCelsius ?? row.averageDeviationInCelsius ?? row.deviationInCelsius, -10, 10);
  if (deviation == null) return null;
  return { ...base, deviationC: Math.round(deviation * 10) / 10 };
}

function mapStress(row: Record<string, unknown>): Pushed<GarminStressDetail> | null {
  const base = identity(row);
  if (!base) return null;
  const direct = whole(row.averageStressLevel, 0, 100);
  const span = averageOf(row.timeOffsetStressLevelValues, 0, 100);
  const average = direct ?? (span == null ? null : Math.round(span));
  if (average == null) return null;
  return { ...base, averageStress: average };
}

function mapEpoch(row: Record<string, unknown>): Pushed<GarminEpoch> | null {
  const garminUserId = ident(row.userId);
  const start = bounded(row.startTimeInSeconds, 1, 4_000_000_000);
  const summaryId = ident(row.summaryId) || (start == null ? '' : `epoch-${Math.round(start)}`);
  const calendarDate = day(row.calendarDate) ?? dateFromSeconds(row.startTimeInSeconds);
  if (!garminUserId || !summaryId || !calendarDate) return null;
  return {
    garminUserId,
    summaryId,
    calendarDate,
    activeSeconds: whole(row.activeTimeInSeconds ?? row.durationInSeconds, 0, 86_400),
    steps: whole(row.steps, 0, 100_000),
    distanceMetres: whole(row.distanceInMeters, 0, 200_000),
    meanHeartRateBpm: whole(row.meanHeartRateInBeatsPerMinute, 20, 250),
  };
}

function mapSnapshot(row: Record<string, unknown>): Pushed<GarminHealthSnapshot> | null {
  const base = identity(row);
  if (!base) return null;
  const fromList = snapshotAverages(row.summaries);
  const heartRateBpm = whole(row.heartRateInBeatsPerMinute ?? fromList.heart, 20, 250);
  const restingHeartRateBpm = whole(row.restingHeartRateInBeatsPerMinute ?? fromList.resting, 20, 250);
  const spo2 = bounded(row.spo2 ?? fromList.spo2, 50, 100);
  const respiration = bounded(row.respiration ?? fromList.respiration, 1, 80);
  const stress = whole(row.stressLevel ?? fromList.stress, 0, 100);
  if (heartRateBpm == null && restingHeartRateBpm == null && spo2 == null && respiration == null && stress == null) return null;
  return {
    ...base,
    heartRateBpm,
    restingHeartRateBpm,
    spo2: spo2 == null ? null : Math.round(spo2 * 10) / 10,
    respiration: respiration == null ? null : Math.round(respiration * 10) / 10,
    stress,
  };
}

function mapMoveIq(row: Record<string, unknown>): Pushed<GarminMoveIq> | null {
  const base = identity(row);
  if (!base) return null;
  const activityType = text(row.activityType) || 'Move';
  return {
    ...base,
    activityType,
    durationSeconds: whole(row.durationInSeconds ?? row.duration, 0, 86_400),
    distanceMetres: whole(row.distanceInMeters, 0, 500_000),
  };
}

function mapActivityDetail(row: Record<string, unknown>): Pushed<GarminActivityDetail> | null {
  const summary = record(row.summary) ?? row;
  const garminUserId = ident(row.userId) || ident(summary.userId);
  const summaryId = ident(row.summaryId) || ident(summary.summaryId) || ident(summary.activityId);
  const calendarDate = day(summary.calendarDate) ?? day(row.calendarDate) ?? dateFromSeconds(summary.startTimeInSeconds);
  if (!garminUserId || !summaryId || !calendarDate) return null;
  return {
    garminUserId,
    summaryId,
    calendarDate,
    durationSeconds: whole(summary.durationInSeconds, 0, 86_400),
    distanceMetres: whole(summary.distanceInMeters, 0, 500_000),
    averageHeartRateBpm: whole(summary.averageHeartRateInBeatsPerMinute, 20, 250),
    activeKilocalories: whole(summary.activeKilocalories, 0, 20_000),
  };
}

function mapActivityFile(row: Record<string, unknown>): Pushed<GarminActivityFile> | null {
  const garminUserId = ident(row.userId);
  const summaryId = ident(row.summaryId) || ident(row.activityId);
  const calendarDate = day(row.calendarDate) ?? dateFromSeconds(row.startTimeInSeconds);
  const fileType = text(row.fileType) || 'file';
  if (!garminUserId || !summaryId || !calendarDate) return null;
  return { garminUserId, summaryId, calendarDate, fileType };
}

function snapshotAverages(value: unknown): { heart: number | null; resting: number | null; spo2: number | null; respiration: number | null; stress: number | null } {
  const found = { heart: null as number | null, resting: null as number | null, spo2: null as number | null, respiration: null as number | null, stress: null as number | null };
  if (!Array.isArray(value)) return found;
  for (const item of value) {
    const row = record(item);
    if (!row) continue;
    const kind = text(row.summaryType).toLowerCase();
    const average = bounded(row.avgValue ?? row.average ?? row.value, 0, 300);
    if (average == null) continue;
    if (kind.includes('resting')) found.resting = average;
    else if (kind.includes('heart')) found.heart = average;
    else if (kind.includes('spo2') || kind.includes('oxygen')) found.spo2 = average;
    else if (kind.includes('respiration') || kind.includes('breath')) found.respiration = average;
    else if (kind.includes('stress')) found.stress = average;
  }
  return found;
}

export function summaryRows<T extends { garminUserId: string; summaryId: string; calendarDate: string }>(
  rows: readonly T[],
  userIdByGarmin: ReadonlyMap<string, string>,
  columns: (row: T) => Record<string, unknown>,
): Record<string, unknown>[] {
  return rows.flatMap((row) => {
    const userId = userIdByGarmin.get(row.garminUserId);
    if (!userId) return [];
    return [{ user_id: userId, summary_id: row.summaryId, calendar_date: row.calendarDate, ...columns(row) }];
  });
}

function rows<T>(root: Record<string, unknown>, key: string, map: (row: Record<string, unknown>) => T | null): T[] {
  const value = root[key];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    return row ? [map(row)].filter((mapped): mapped is T => mapped != null) : [];
  });
}

function identity(row: Record<string, unknown>): { garminUserId: string; summaryId: string; calendarDate: string } | null {
  const garminUserId = ident(row.userId);
  const summaryId = ident(row.summaryId);
  const calendarDate = day(row.calendarDate) ?? dateFromSeconds(row.startTimeInSeconds ?? row.measurementTimeInSeconds);
  if (!garminUserId || !summaryId || !calendarDate) return null;
  return { garminUserId, summaryId, calendarDate };
}

function ident(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value)).slice(0, 128);
  if (typeof value !== 'string') return '';
  const textValue = value.trim();
  return /^[A-Za-z0-9_.:-]{1,128}$/.test(textValue) ? textValue : '';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 40) : '';
}

function day(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function dateFromSeconds(value: unknown): string | null {
  const seconds = bounded(value, 1, 4_000_000_000);
  if (seconds == null) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function bounded(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

function whole(value: unknown, min: number, max: number): number | null {
  const number = bounded(value, min, max);
  return number == null ? null : Math.round(number);
}

function averageOf(value: unknown, min: number, max: number): number | null {
  const row = record(value);
  if (!row) return null;
  const numbers = Object.values(row).map((item) => bounded(item, min, max)).filter((item): item is number => item != null);
  if (!numbers.length) return null;
  return numbers.reduce((sum, item) => sum + item, 0) / numbers.length;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function storedSummaries<T>(value: unknown, map: (row: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    const mapped = row ? map(row) : null;
    return mapped ? [mapped] : [];
  });
}

export function storedBloodPressure(value: unknown): GarminBloodPressure[] {
  return storedSummaries(value, (row) => storedBase(row, {
    systolic: whole(row.systolic, 40, 250),
    diastolic: whole(row.diastolic, 20, 180),
    pulseBpm: whole(row.pulse_bpm, 20, 250),
  }));
}

export function storedBodyComp(value: unknown): GarminBodyComp[] {
  return storedSummaries(value, (row) => storedBase(row, {
    weightKg: decimal(row.weight_kg, 20, 400),
    bodyFatPct: decimal(row.body_fat_pct, 2, 70),
    bmi: decimal(row.bmi, 10, 80),
    muscleMassKg: decimal(row.muscle_mass_kg, 5, 200),
  }));
}

export function storedSkinTemp(value: unknown): GarminSkinTemp[] {
  return storedSummaries(value, (row) => storedBase(row, { deviationC: decimal(row.deviation_c, -10, 10) }));
}

export function storedStress(value: unknown): GarminStressDetail[] {
  return storedSummaries(value, (row) => storedBase(row, { averageStress: whole(row.average_stress, 0, 100) }));
}

export function storedEpoch(value: unknown): GarminEpoch[] {
  return storedSummaries(value, (row) => storedBase(row, {
    activeSeconds: whole(row.active_seconds, 0, 86_400),
    steps: whole(row.steps, 0, 100_000),
    distanceMetres: whole(row.distance_metres, 0, 200_000),
    meanHeartRateBpm: whole(row.mean_heart_rate_bpm, 20, 250),
  }));
}

export function storedSnapshot(value: unknown): GarminHealthSnapshot[] {
  return storedSummaries(value, (row) => storedBase(row, {
    heartRateBpm: whole(row.heart_rate_bpm, 20, 250),
    restingHeartRateBpm: whole(row.resting_heart_rate_bpm, 20, 250),
    spo2: decimal(row.spo2, 50, 100),
    respiration: decimal(row.respiration, 1, 80),
    stress: whole(row.stress, 0, 100),
  }));
}

export function storedMoveIq(value: unknown): GarminMoveIq[] {
  return storedSummaries(value, (row) => {
    const base = storedBase(row, {});
    if (!base) return null;
    return { ...base, activityType: text(row.activity_type) || 'Move', durationSeconds: whole(row.duration_seconds, 0, 86_400), distanceMetres: whole(row.distance_metres, 0, 500_000) };
  });
}

export function storedActivityDetail(value: unknown): GarminActivityDetail[] {
  return storedSummaries(value, (row) => storedBase(row, {
    durationSeconds: whole(row.duration_seconds, 0, 86_400),
    distanceMetres: whole(row.distance_metres, 0, 500_000),
    averageHeartRateBpm: whole(row.average_heart_rate_bpm, 20, 250),
    activeKilocalories: whole(row.active_kilocalories, 0, 20_000),
  }));
}

export function storedActivityFile(value: unknown): GarminActivityFile[] {
  return storedSummaries(value, (row) => {
    const base = storedBase(row, {});
    if (!base) return null;
    return { ...base, fileType: text(row.file_type) || 'file' };
  });
}

function storedBase<T extends Record<string, unknown>>(row: Record<string, unknown>, rest: T): ({ summaryId: string; calendarDate: string } & T) | null {
  const summaryId = ident(row.summary_id);
  const calendarDate = day(row.calendar_date);
  if (!summaryId || !calendarDate) return null;
  return { summaryId, calendarDate, ...rest };
}

function decimal(value: unknown, min: number, max: number): number | null {
  const number = bounded(value, min, max);
  return number == null ? null : Math.round(number * 10) / 10;
}
