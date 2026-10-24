/** One size and one stroke for every stat icon. A little lighter than the text. */
export const STAT_ICON_PX = 22;
export const STAT_ICON_STROKE = 1.5;

export type StatIcon =
  | 'ruler'
  | 'timer'
  | 'gauge'
  | 'heart'
  | 'flame'
  | 'elevation'
  | 'run'
  | 'walk'
  | 'cycle'
  | 'row'
  | 'swim'
  | 'strength'
  | 'yoga'
  | 'hiit'
  | 'other'
  | 'steps'
  | 'moon'
  | 'pulse'
  | 'spo2'
  | 'scale'
  | 'battery'
  | 'stress'
  | 'body'
  | 'glass'
  | 'day';

/** HealthKit activity type to one workout glyph. Anything else stays the plain mark. */
export function workoutStatIcon(activityType: number): StatIcon {
  switch (activityType) {
    case 37:
      return 'run';
    case 52:
    case 24:
      return 'walk';
    case 13:
    case 74:
      return 'cycle';
    case 35:
      return 'row';
    case 46:
      return 'swim';
    case 11:
    case 20:
    case 50:
    case 59:
      return 'strength';
    case 57:
    case 66:
    case 72:
      return 'yoga';
    case 63:
    case 30:
    case 8:
    case 65:
      return 'hiit';
    default:
      return 'other';
  }
}

/** Health stat tile id. Unknown tiles get no icon, so a new row stays plain. */
export function healthTileIcon(id: string): StatIcon | null {
  switch (id) {
    case 'resting_heart_rate':
    case 'walking_heart_rate':
    case 'heart_rate_recovery':
    case 'session_heart_rate':
      return 'heart';
    case 'vo2_max':
      return 'gauge';
    case 'sleep_hours':
      return 'moon';
    case 'hrv_sdnn':
      return 'pulse';
    case 'weight_kg':
      return 'scale';
    case 'body_fat':
    case 'lean_mass':
    case 'waist':
      return 'body';
    case 'steps':
      return 'steps';
    case 'active_energy':
      return 'flame';
    case 'workouts':
      return 'strength';
    case 'weekly_active_minutes':
      return 'timer';
    default:
      return null;
  }
}

/** Chart and Garmin detail titles. A title with no match stays as words. */
export function activityTitleIcon(title: string): StatIcon | null {
  const name = title.toLowerCase();
  if (name.startsWith('steps')) return 'steps';
  if (name.startsWith('distance')) return 'ruler';
  if (name.startsWith('floors')) return 'elevation';
  if (name.includes('heart')) return 'heart';
  if (name.includes('calorie')) return 'flame';
  if (name.includes('intensity') || name.includes('minute')) return 'timer';
  if (name.includes('stress')) return 'stress';
  if (name.includes('battery')) return 'battery';
  if (name.includes('sleep')) return 'moon';
  if (name.includes('breath') || name.includes('oxygen')) return name.includes('oxygen') ? 'spo2' : 'pulse';
  if (name.includes('hrv')) return 'pulse';
  if (name.includes('vo2')) return 'gauge';
  return null;
}
