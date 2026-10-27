# Activity minutes — labels and the two types of minutes

Approved by Ben on 26 October 2026, as written: "Approve the activity minutes design with all recommendations as written." All six decisions take the recommended option. Built from the design sheet on the saved-routes line `0571e53` (PR #38) plus this sheet (`f858da2`, PR #39). Not shipped. No migration is written or applied. No deploy. `ios.buildNumber` stays 72.

Ben, after the You → Workouts → Daily activity Exercise minutes card: "This implies that the recorded minutes is wrong?" Then: "Label up correctly and create new bar charts for the different types of minutes vigorous vs whatever else."

The layout proofs are sample drawings, labelled Sample and Not the app. They are not screenshots of the running app.

## What the code does today

Checked against the code on `0571e53`. Stored rows are not the problem. `garmin_dailies.moderate_minutes` and `garmin_dailies.vigorous_minutes` stay the raw minutes Garmin sent. The doubling is done in the app, and not in every place.

**Exercise minutes** (You → Workouts → Daily activity). `exerciseSeries` and `dailyActivitySeries` in `src/domain/dailyActivity.ts`, drawn by `src/ui/DailyActivity.tsx`. One source per day. Apple exercise time is used when that day is above zero. Otherwise Garmin is used, as moderate minutes plus vigorous minutes times two (`garminExerciseMinutes`, `GARMIN_VIGOROUS_MINUTE_WEIGHT = 2`). The two sources are never added on the same day. A zero Apple day is skipped, so Garmin can fill it.

A single bar already says which source it used. An Apple bar ends `(Apple Health)`. A Garmin bar ends `(Garmin, vigorous counted twice)`. The line under the whole chart does not. When the days on screen include both, `chartSourceCaption` returns `(Apple Health and Garmin, vigorous counted twice)`. That parenthesis sits on the card as if every bar had been doubled. An Apple bar of 34 is plain Apple exercise time. A Garmin bar of 40 can be 20 moderate and 10 vigorous. The 40 is the weighted figure, not a correction of a wrong 30. The caption is what makes the 40 look like a mistake.

**Intensity minutes** (`intensitySeries` in `src/domain/garminCharts.ts`). Garmin only, same doubling. It is drawn by `MovementCharts` on Health, Health plan, and Stats. Daily activity passes `showIntensity={false}`, so this chart is not on the card Ben saw. The More info text (`activityChartGuide`) says "Intensity minutes add moderate minutes to vigorous minutes. Garmin counts each vigorous minute twice." The sum, including the double, is this app. Garmin's stored vigorous minutes are not already doubled. The same text puts the World Health Organization and NHS 150–300 moderate range on that weighted chart, and calls the lime band "the daily share of the moderate range."

**Active minutes on Health** (`activeMinutesByDay` in `src/domain/healthSources.ts`, wired in `src/app/(main)/health.tsx`, tile in `weeklyTile` in `src/domain/healthStatTiles.ts`). A different sum. When a day has Garmin moderate or vigorous, the value is moderate plus vigorous with **no** double. Otherwise that day's `workout_minutes` are used. The sources are not added. The tile title is Active minutes, and the status compares that undoubled total with the UK Chief Medical Officers' 150 minutes of moderate activity, as in "40 minutes to 150".

**Resting fitness.** `fitnessMatch` in `src/domain/restingFitness.ts` does double: moderate plus vigorous times two, against a month-scale 150 minute reference. The Daily activity resting chart passes the raw moderate and vigorous minutes, so the double happens there. The Health screen does not. `restingMonthComment` copies the undoubled active-minutes value into `moderateMinutes` and sets `vigorousMinutes` to 0, so a day that was already moderate plus vigorous is then treated as all moderate, and the double never runs.

**Your Fitness.** The ring and chart labelled Active minutes (`src/ui/YourFitness.tsx`, `workoutFigure` in `src/domain/measureFigures.ts`, and the workout guidance in `src/domain/guidance.ts`) are logged `workout_minutes`. That is the length of recorded workouts. It is not Garmin intensity, and it is not Apple exercise time. The ring still says "N minutes to 150".

**Towards your target weight.** `mergeActivityReadings` in `supabase/functions/_shared/targetActivity.ts` (used by `src/ui/TowardTargetActivity.tsx`). Apple exercise time wins a day and is stored as plain minutes, with vigorous set to 0. A Garmin day that Apple did not take stores moderate in `exerciseMinutes` and vigorous beside it. The week total is exercise minutes plus vigorous times two. So a Garmin week is weighted, and an Apple day is not. A week that contains both still adds those two kinds of minutes into one "Active minutes" sentence, compared with 150 to 300.

**Apple has no moderate or vigorous split in this app.** The only exercise quantity read from Apple Health is `HKQuantityTypeIdentifierAppleExerciseTime` (`src/health/connection.ts`, `src/health/dailyActivity.ios.ts`). That is one daily total, the exercise ring, in plain minutes. This design does not read any further Apple type.

## Recommendation

Keep one Exercise minutes card, with the same per-day source rule as now, and say on the card which days are which. Do not pick a single source for the whole window. A day that only the other device recorded would go blank.

Do not draw a stacked bar as the chart people use. Draw two charts, Moderate minutes and Vigorous minutes, in real minutes, for the same 7-day and 30-day windows. A stack invites adding the two types, and they are not the same minute.

Use one meaning for the words Active minutes: Garmin moderate minutes plus vigorous minutes counted twice, on a day Garmin sent those numbers. On any other day, Active minutes are the length of workouts logged that day, and the screen says the app cannot tell how hard those were. Your Fitness stops calling workout length Active minutes.

The lime reference stays on the weighted chart only.

## A. Labelling the Exercise minutes card

Option 1, recommended. One weighting rule, shown on the Garmin days only. Apple days stay plain minutes. The card keeps the title Exercise minutes. The line under the bars is two sentences, not one parenthesis. Each bar names Apple or Garmin. The tap line for a Garmin day shows the moderate minutes, the vigorous minutes, and the weighted total, so 40 is explained as 20 and 10 with the vigorous minutes counted twice.

Option 2. One source for the whole window, all Apple or all Garmin. The other device's days are left empty. This avoids two scales. It also hides a day the person did record. Not recommended as the only chart.

The card keeps **Not medical advice. Not a diagnosis.** in view, above the More info button. The long explanation stays behind that button. The button stays the outlined pill with bright green ink.

Intensity minutes, on Health, Health plan, and Stats, is the Garmin-only form of the same weighted total. It keeps its title. Its More info is rewritten so it no longer says Garmin stored the double, and so it no longer reads as if moderate and vigorous were added one for one. It is not added again inside Daily activity.

The 30-day window uses the same cards. Numbers sit on the bars only for the 7-day window, as they do now. The source still sits under each bar.

## B. Moderate minutes and Vigorous minutes

Two new bar charts, Garmin only, real minutes, not doubled. Same 7-day and 30-day windows as the other movement charts. On Daily activity they sit under Exercise minutes. On Health, Health plan, and Stats they sit under Intensity minutes.

Apple days are empty on these charts, not zeros. Apple Health does not give this app a moderate or vigorous split. A stored Garmin 0 is a zero bar. A day with neither Garmin number, and an Apple-only day, is an empty slot.

Each chart has its own source line, its own tap line, its own More info, and its own empty state. Each chart has its own scale, so a vigorous day is not drawn against the moderate maximum.

The World Health Organization and the NHS publish 150–300 minutes of moderate activity a week, or 75–150 minutes of vigorous activity, or a mix where one vigorous minute stands in for two moderate minutes. That reference fits the weighted Exercise minutes and Intensity minutes charts. It does not fit Moderate minutes on its own, because that chart ignores vigorous minutes. It does not fit Vigorous minutes on its own, because that chart ignores moderate minutes. The lime band is not drawn on either type chart.

A stacked chart could be added later. It is not recommended, and it is not drawn in the proofs. Two charts answer "how many moderate minutes" and "how many vigorous minutes" without implying they add up on the picture.

## C. One meaning of Active minutes

Agreed definition, for approval:

Active minutes are Garmin moderate minutes plus vigorous minutes counted twice, when Garmin has them for that day. Otherwise they are the minutes of workouts logged that day. Workout minutes are not labelled moderate or vigorous.

Places that change in this build.

| Place | Where | Today | When built |
| --- | --- | --- | --- |
| Exercise minutes card | `src/ui/DailyActivity.tsx`, `src/domain/dailyActivity.ts` (`exerciseSeries`, `chartSourceCaption`, `exerciseMinutesLabel`) | Mixed caption on the card | Wording in section A |
| Intensity minutes | `src/domain/garminCharts.ts` (`intensitySeries`, `activityChartGuide`); `MovementCharts` from `src/app/(main)/health.tsx`, `src/app/(main)/health-plan.tsx`, `src/app/(main)/stats.tsx` | Garmin weighted total; loose More info | Wording below. Still hidden on Daily activity |
| Moderate minutes and Vigorous minutes | New series beside those charts. Daily activity via `DailyActivityCharts` in `src/ui/WorkoutList.tsx` | Not drawn | Section B |
| Health, Active minutes tile | `activeMinutesByDay` in `src/domain/healthSources.ts`; `weeklyTile` in `src/domain/healthStatTiles.ts`; passed from `src/app/(main)/health.tsx` | Undoubled moderate plus vigorous, else workout length, compared with 150 | Weighted Garmin days. Workout-length days named as such. Status uses "minutes to 150" only when every counted day is the weighted Garmin figure |
| Resting fitness from Health | `restingMonthComment` in `src/domain/healthStatTiles.ts` | Undoubled total passed as all moderate, vigorous 0 | Pass the raw moderate and vigorous split, so the double inside `restingFitness.ts` runs once |
| Resting fitness from Daily activity | `src/ui/DailyActivity.tsx` into `restingFitnessComment` | Already passes the raw split | Keep that path. Do not also pass a pre-weighted total |
| Your Fitness | `src/ui/YourFitness.tsx`, `workoutFigure` in `src/domain/measureFigures.ts`, workout guidance in `src/domain/guidance.ts` | Workout length labelled Active minutes, ring says "N minutes to 150" | Relabel **Workout minutes**. The 150 status comes off the ring. The Chief Medical Officers sentence stays behind More info, with the line that this is logged length |
| Towards your target weight | `mergeActivityReadings` and `targetActivityPlan` in `supabase/functions/_shared/targetActivity.ts`, drawn by `src/ui/TowardTargetActivity.tsx` | Week total already weights Garmin and leaves Apple plain, then calls the sum Active minutes | Keep the arithmetic. When the week contains both, the sentence says so |
| Workouts tile | `workoutTile` in `src/domain/healthStatTiles.ts` | Logged workout length, no guideline | Stays Workouts. It is not renamed Active minutes |
| Stored Garmin days | `garmin_dailies.moderate_minutes`, `garmin_dailies.vigorous_minutes` | Raw minutes | No change |

`mergeHealthSamples` still lets a Garmin workout replace Apple workout minutes on that day. That rule is about the length of a logged session. It is not an intensity figure. It stays, and those minutes keep the name workout minutes.

## Permissions and the database

No new permission and no new purpose string. Apple exercise time is already requested. Garmin moderate and vigorous minutes are already received and stored. This design does not ask Apple Health for another type. A further Apple type would need its own permission and purpose review, and this sheet does not propose one.

No server change. The charts read columns that already exist. No migration is included. Nothing is applied.

## Wording

Approved by Ben on 26 October 2026, as written. UK English. No medical claim. "Not medical advice. Not a diagnosis." stays visible on each of these cards.

### Exercise minutes

Title: Exercise minutes

Line under the bars, when the window has both sources: Apple days are plain exercise minutes. Garmin days count each vigorous minute twice.

Line under the bars, Garmin only: Garmin. Each vigorous minute is counted twice.

Line under the bars, Apple only: Apple Health. Plain minutes. Not doubled.

Under each bar: Apple, or Garmin, or a dash when that day has no reading.

Tap line, Apple: Exercise minutes, Thu 22 Oct: 34 min. Apple Health. Not doubled.

Tap line, Garmin: Exercise minutes, Wed 21 Oct: 40 min. Garmin. 20 moderate and 10 vigorous, vigorous counted twice.

Tap line, empty: No exercise minutes for Mon 19 Oct.

Visible on the card: Not medical advice. Not a diagnosis.

More info: This chart is exercise minutes. On an Apple Health day the bar is Apple's exercise time, in plain minutes. On a Garmin day the bar is moderate minutes plus vigorous minutes, and each vigorous minute is counted twice. An Apple day is not doubled. The two sources are not added on the same day. Apple is used when that day is above zero. Otherwise Garmin is used. The World Health Organization and the NHS publish 150–300 minutes of moderate activity a week, or 75–150 minutes if it is vigorous. A vigorous minute can stand in for two moderate minutes. The lime band is a daily share of the 150–300 moderate range. It is a reference for this weighted total. It is not a personal target and not a diagnosis. Not medical advice.

### Intensity minutes

Title: Intensity minutes

Line under the bars: Garmin. Each vigorous minute is counted twice.

Tap line: Intensity minutes, Wed 21 Oct: 40 min. Garmin. 20 moderate and 10 vigorous, vigorous counted twice.

Empty window: No intensity minutes from Garmin in these days.

Visible on the card: Not medical advice. Not a diagnosis.

More info: Intensity minutes are Garmin only. This app adds moderate minutes to vigorous minutes, and counts each vigorous minute twice. Garmin's stored minutes are not already doubled. Apple exercise time is on Exercise minutes, and it is not doubled. The World Health Organization and the NHS publish 150–300 minutes of moderate activity a week, or 75–150 minutes if it is vigorous. A vigorous minute can stand in for two moderate minutes. The lime band is a daily share of the 150–300 moderate range. It is a reference for this weighted total. It is not a personal target and not a diagnosis. Not medical advice.

### Moderate minutes

Title: Moderate minutes

Line under the bars: Garmin. Plain minutes, not doubled.

Tap line: Moderate minutes, Wed 21 Oct: 20 min. Garmin.

Tap line, stored zero: Moderate minutes, Fri 23 Oct: 0 min. Garmin.

Tap line, no Garmin number for that day: No Garmin moderate minutes for Tue 20 Oct. Apple exercise time is on Exercise minutes.

Empty window: No moderate minutes from Garmin in these days.

Visible on the card: Not medical advice. Not a diagnosis.

More info: These are Garmin's moderate minutes, one minute for one minute. Vigorous minutes are on the other chart. Apple Health does not give this app a moderate or vigorous split. Apple exercise time stays on Exercise minutes. The 150–300 minute weekly range is for moderate activity, or for moderate plus vigorous counted twice. This chart is moderate only, so that range is not drawn here. Not medical advice. Not a diagnosis.

### Vigorous minutes

Title: Vigorous minutes

Line under the bars: Garmin. Plain minutes, not doubled.

Tap line: Vigorous minutes, Wed 21 Oct: 10 min. Garmin.

Tap line, stored zero: Vigorous minutes, Sat 24 Oct: 0 min. Garmin.

Tap line, no Garmin number for that day: No Garmin vigorous minutes for Tue 20 Oct. Apple exercise time is on Exercise minutes.

Empty window: No vigorous minutes from Garmin in these days.

Visible on the card: Not medical advice. Not a diagnosis.

More info: These are Garmin's vigorous minutes, one minute for one minute. They are not doubled on this chart. Doubling is only on Exercise minutes and Intensity minutes, where one vigorous minute counts as two. Apple Health does not give this app a vigorous split. The 75–150 minute weekly range is the vigorous alternative to 150–300 moderate minutes. This chart does not add moderate minutes, so that range is not drawn here. Not medical advice. Not a diagnosis.

### Active minutes (Health)

Title: Active minutes

About: Active minutes: Garmin moderate minutes plus vigorous minutes counted twice, on days Garmin sent them. On other days, the length of workouts logged that day. The unit is minutes.

Line when every counted day is Garmin: Garmin moderate minutes, with each vigorous minute counted twice.

Line when any counted day is a logged workout: Garmin days count vigorous minutes twice. Other days are the length of logged workouts, and this app cannot tell how hard those were.

Status, weighted Garmin days only, short of the reference: 40 minutes to 150

Status, when any day is logged workout length: The 150 minute figure is a moderate-activity reference. It fits the Garmin days. It does not grade the logged workouts.

Meaning: The UK Chief Medical Officers recommend at least 150 minutes of moderate activity a week, or 75 minutes of vigorous activity. A vigorous minute can stand in for two moderate minutes. Logged workouts may not include walking, and this app cannot tell how hard those minutes were.

Visible with the tile: Not medical advice. Not a diagnosis.

### Your Fitness

Label: Workout minutes

Ring status: 150 minutes logged, or 40 minutes logged. The "minutes to 150" status is not used on this ring.

More info: These are the minutes of workouts logged this week. They are not moderate minutes and not vigorous minutes. The UK Chief Medical Officers recommend at least 150 minutes of moderate activity a week, or 75 minutes of vigorous activity. This app cannot tell how hard the logged minutes were. Not medical advice. Not a diagnosis.

### Towards your target weight

Keep the existing suggestion, and add this sentence when the week contains both an Apple day and a Garmin day: Apple days are exercise minutes, not doubled. Garmin days count each vigorous minute twice.

## Sample used in the proofs

Labelled Sample. Not a person's data. Seven days ending Sun 25 Oct 2026. The 30-day window is the same card with narrower bars and no figure printed on each bar.

| Day | Source on Exercise minutes | Moderate | Vigorous | Bar on Exercise minutes |
| --- | --- | --- | --- | --- |
| Mon 19 Oct | None | Empty | Empty | Empty |
| Tue 20 Oct | Apple Health | Empty (no Garmin split) | Empty | 22, not doubled |
| Wed 21 Oct | Garmin | 20 | 10 | 40, vigorous counted twice |
| Thu 22 Oct | Apple Health | Empty | Empty | 34, not doubled |
| Fri 23 Oct | Garmin | 0 | 15 | 30, vigorous counted twice |
| Sat 24 Oct | Garmin | 45 | 0 | 45 |
| Sun 25 Oct | None | Empty | Empty | Empty |

Wed 21 Oct is the selected day on the proofs. The lime band on Exercise minutes runs from about 21 to about 43, the daily share of 150–300. It is not drawn on Moderate minutes or Vigorous minutes.

## Proofs

Drawings only, at 320 and 390 points wide.

- `docs/activity-minutes/activity_minutes_exercise_320.png`
- `docs/activity-minutes/activity_minutes_exercise_390.png`
- `docs/activity-minutes/activity_minutes_types_320.png`
- `docs/activity-minutes/activity_minutes_types_390.png`

The same files are copied to `/opt/cursor/artifacts/screenshots/` for the pull request.

## Decisions for Ben

1. Exercise minutes. Per-day source, with vigorous counted twice on Garmin days only, and the source written on the bar (recommended). Or one source for the whole window.
2. New charts. Two separate charts, Moderate minutes and Vigorous minutes, in real minutes (recommended). Or those two plus a stacked chart.
3. The lime reference. On the weighted Exercise minutes and Intensity minutes charts only (recommended). Or also on Moderate minutes or Vigorous minutes, with the limit written on that chart.
4. Active minutes. The definition in section C, and Your Fitness relabelled Workout minutes (recommended). Or keep the words Active minutes on the workout-length ring.
5. The wording in this sheet. Approved by Ben on 26 October 2026, as written.
6. No new permission, no new purpose string, and no database change. Confirm that none is wanted.
