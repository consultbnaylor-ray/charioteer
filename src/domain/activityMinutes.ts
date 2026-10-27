/**
 * Activity-minute sentences approved by Ben on 26 October 2026, as written.
 * The charts read minutes that are already stored. Nothing here is a new permission.
 */

export const EXERCISE_BOTH_CAPTION =
  'Apple days are plain exercise minutes. Garmin days count each vigorous minute twice.';

export const EXERCISE_GARMIN_CAPTION = 'Garmin. Each vigorous minute is counted twice.';

export const EXERCISE_APPLE_CAPTION = 'Apple Health. Plain minutes. Not doubled.';

export const MINUTE_TYPE_CAPTION = 'Garmin. Plain minutes, not doubled.';

export const INTENSITY_EMPTY = 'No intensity minutes from Garmin in these days.';

export const MODERATE_EMPTY = 'No moderate minutes from Garmin in these days.';

export const VIGOROUS_EMPTY = 'No vigorous minutes from Garmin in these days.';

export const EXERCISE_MORE_INFO =
  "This chart is exercise minutes. On an Apple Health day the bar is Apple's exercise time, in plain minutes. On a Garmin day the bar is moderate minutes plus vigorous minutes, and each vigorous minute is counted twice. An Apple day is not doubled. The two sources are not added on the same day. Apple is used when that day is above zero. Otherwise Garmin is used. The World Health Organization and the NHS publish 150–300 minutes of moderate activity a week, or 75–150 minutes if it is vigorous. A vigorous minute can stand in for two moderate minutes. The lime band is a daily share of the 150–300 moderate range. It is a reference for this weighted total. It is not a personal target and not a diagnosis. Not medical advice.";

export const INTENSITY_MORE_INFO =
  "Intensity minutes are Garmin only. This app adds moderate minutes to vigorous minutes, and counts each vigorous minute twice. Garmin's stored minutes are not already doubled. Apple exercise time is on Exercise minutes, and it is not doubled. The World Health Organization and the NHS publish 150–300 minutes of moderate activity a week, or 75–150 minutes if it is vigorous. A vigorous minute can stand in for two moderate minutes. The lime band is a daily share of the 150–300 moderate range. It is a reference for this weighted total. It is not a personal target and not a diagnosis. Not medical advice.";

export const MODERATE_MORE_INFO =
  "These are Garmin's moderate minutes, one minute for one minute. Vigorous minutes are on the other chart. Apple Health does not give this app a moderate or vigorous split. Apple exercise time stays on Exercise minutes. The 150–300 minute weekly range is for moderate activity, or for moderate plus vigorous counted twice. This chart is moderate only, so that range is not drawn here. Not medical advice. Not a diagnosis.";

export const VIGOROUS_MORE_INFO =
  "These are Garmin's vigorous minutes, one minute for one minute. They are not doubled on this chart. Doubling is only on Exercise minutes and Intensity minutes, where one vigorous minute counts as two. Apple Health does not give this app a vigorous split. The 75–150 minute weekly range is the vigorous alternative to 150–300 moderate minutes. This chart does not add moderate minutes, so that range is not drawn here. Not medical advice. Not a diagnosis.";

export const ACTIVE_MINUTES_ABOUT =
  'Active minutes: Garmin moderate minutes plus vigorous minutes counted twice, on days Garmin sent them. On other days, the length of workouts logged that day. The unit is minutes.';

export const ACTIVE_MINUTES_GARMIN_LINE =
  'Garmin moderate minutes, with each vigorous minute counted twice.';

export const ACTIVE_MINUTES_WORKOUT_LINE =
  'Garmin days count vigorous minutes twice. Other days are the length of logged workouts, and this app cannot tell how hard those were.';

export const ACTIVE_MINUTES_WORKOUT_STATUS =
  'The 150 minute figure is a moderate-activity reference. It fits the Garmin days. It does not grade the logged workouts.';

export const ACTIVE_MINUTES_MEANING =
  'The UK Chief Medical Officers recommend at least 150 minutes of moderate activity a week, or 75 minutes of vigorous activity. A vigorous minute can stand in for two moderate minutes. Logged workouts may not include walking, and this app cannot tell how hard those minutes were.';

export const WORKOUT_MINUTES_LABEL = 'Workout minutes';

export const WORKOUT_MINUTES_INFO =
  'These are the minutes of workouts logged this week. They are not moderate minutes and not vigorous minutes. The UK Chief Medical Officers recommend at least 150 minutes of moderate activity a week, or 75 minutes of vigorous activity. This app cannot tell how hard the logged minutes were. Not medical advice. Not a diagnosis.';

export const MIXED_ACTIVITY_WEEK =
  'Apple days are exercise minutes, not doubled. Garmin days count each vigorous minute twice.';

export const ACTIVITY_CARE_LINE = 'Not medical advice. Not a diagnosis.';
