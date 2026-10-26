# Start a walk, a run, or a cycle

Design only. Ben asked for this on 26 October 2026. There is no feature code, no new permission, and nothing is shipped. The iOS build number stays 72.

Outside is Good would gain three buttons: **Start a walk**, **Start a run**, and **Start a cycle**. They sit on the existing card, under Find a route and above Open the map. The button opens the setup screen with that activity already chosen. The person can still switch. Walk this off stays hidden.

The pictures are layout proofs. They are not screens in the app. The figures (1.42 km, 18:42, 13:10 per km) are an example, so the layout has something to show.

## Recommendation, short

1. The phone stays awake. Locking it pauses the outing. No background location, and no Always location.
2. Thumos writes the line on the screen and can speak it while that screen is open. A small buzz marks the moment. No notification every few minutes.
3. The sentences are a list kept on the phone. Pace and time are filled in there. Nothing is sent. A live model comes later, only if you say so.
4. Distance and pace come from the phone's location while the screen is open. Not from the step counter. A cycle does not make useful steps, and the motion sentence today says we do not use motion.
5. Keep the summary on the phone: type, date, distance, time, average pace. No path, on the phone or in the cloud. The Apple Health button is drawn, and it waits for your OK on new wording.
6. The careful lines stay in Good to know, once each, in the same quiet type as the other Outside screens. No warning banner.
7. Leave Walk this off hidden. This is a different idea.
8. First version is the awake screen, the local lines, the spoken line, and the summary. Lock-screen tracking, Apple Health, and a live model come later, each only after you approve the wording.

## The screens

Setup. Activity, an optional saved route, how often Thumos speaks, and whether that is spoken or on screen only. Start keeps the screen on.

![Setup, 390 wide. Layout proof.](start-activity/setup-390.png)

![Setup, 320 wide. The choices still fit.](start-activity/setup-320.png)

During the outing. Time, distance, and pace are the large type. Thumos has one calm line. Pause and Finish are full-width. While paused, Pause becomes Resume.

![Live, 390 wide. Layout proof.](start-activity/live-390.png)

![Live, 320 wide.](start-activity/live-320.png)

The summary. Distance, time, and average pace. A note is optional. The gratitude tick is off. Done closes the screen and the summary stays. Don't keep this throws it away. Save to Apple Health is on the drawing and is not part of the first build.

![Finished, 390 wide. Layout proof.](start-activity/finish-390.png)

![Finished, 320 wide.](start-activity/finish-320.png)

A saved route, if they pick one, is a name on the screen ("Bristol, Queen Square" in the proof). It does not speak turns, and it does not open a second map. The map they already have is unchanged.

Outside is Good can list the last few summaries, with Delete. That list is not in the pictures. Deleting the app deletes the list. Say that in the list.

## 1. Tracking while the phone is locked

**Recommendation: the screen stays awake. Locking the phone pauses the time and the distance.**

Today the app may use location only while a map is open, and only if the person allows it. The purpose sentence says it is not tracked in the background. Background location is switched off. Always location is switched off. The tests refuse a continuous watch and a step counter. That stays true until you approve a build.

Three ways to run an outing:

**Screen kept awake.** The person taps Start. The screen stays lit. If they lock the phone, the clock and the distance pause, and the screen says so before they start. This uses the location permission the app already has (while the app is in use). It does not add a new permission key. It does need new words in the existing sentence, because measuring a walk is more than showing a dot on the map. Those words are at the end of this note. They are not in the app. Apple reads purpose sentences. A sentence that still said "only while the map is open, to show where you are" would be the thing they would question.

**Background, with the blue location mark.** Apple lets an app keep location going after the screen locks, if the person started it, and if a blue mark stays visible so they can see location is on. It stops when they finish, and if they force-quit the app. This is still the while-using permission. It does not ask for Always. It does add a background mode (`location` under UIBackgroundModes). Apple can ask for a short video: start, lock the phone, the mark showing, then stop. The usual Expo background switch is the wrong tool for this. Turning that on and calling the background permission asks for Always. We would not do that. This can be a later version. It is a real review, and it is lighter than Always.

**Always location.** The phone could track after the app is closed, with no mark the person is watching. That is a new purpose sentence (`NSLocationAlwaysAndWhenInUseUsageDescription`), the same background mode, and a stricter review. Apple asks why while-using is not enough. For an outing the person starts and stops, while-using is enough. I would not ask for Always.

**Apple Health or the step counter only.** Health can show a distance after a watch has already recorded a workout. It does not give a live pace every five minutes during an outing that Charioteer itself is timing. The step counter would also make today's motion sentence false. That sentence says Charioteer does not use motion or fitness data. A cycle barely registers as steps. I would not use the step counter.

What Apple will ask, if we stay with the recommendation: they will read the updated while-using sentence. They should not ask for a background-location video, because the background mode stays off.

On Android the first version is the same: location while the app is open. A later locked-phone version would show a visible "Walk in progress" notification. It would not ask for all-the-time location. Google Play treats all-the-time location as its own review.

The screen staying lit uses more battery than a locked phone. Say that in Good to know, in the lock sentence. That cost is the reason a later version may let the phone lock. It is also the reason not to do it now.

## 2. How Thumos delivers the update

**Recommendation: the line is on the screen. The phone can also speak it, while that screen is open. A short buzz happens with the line. Notifications stay out of it.**

The person picks 3, 5, or 10 minutes, or Off. Off keeps the clock and keeps Thumos quiet. They also pick "Spoken and on screen" or "On screen only".

Speaking uses the phone's own voice (a text-to-speech library, `expo-speech`). It does not use the microphone. It does not need a new permission. It does not need a background audio mode. When the screen locks, or the app is not in front, the voice stops. That matches the pause. Adding a background audio mode so a voice could keep talking on the lock screen is a common rejection. Apple expects that mode for music or podcasts, not for a sentence every five minutes. We should not add it.

Music: the spoken line should lower the music for a moment and then let it return. The library does not give a guarantee in writing. The first build has to be checked on a phone. If the music stops and does not come back, On screen only is the reliable choice and the spoken option should wait. The on-screen line is always there either way.

The microphone sentence stays as it is. It says Charioteer does not record audio, and that voice is switched off. Speaking a line is not recording. "Voice is switched off" means the app does not listen. I would not rewrite that sentence for this. A reviewer who only skims it might ask. The answer is that nothing is recorded.

A buzz uses the haptic the app already uses when something is saved. No permission.

**Notifications.** The app already asks for notification permission, for messages and for workout reminders. The same yes covers a local alert. iOS has no purpose sentence for that prompt. I would still not fire one every three or five minutes. On the lock screen it tells anyone looking that the person is out, which fights the line we already show: "Live routes can't be shared with anyone. That's to protect your safety." If they have said no to notifications, we would have to ask again or send them to Settings. The on-screen line does not need that.

## 3. Where the sentences come from

**Recommendation: a short list of lines stored in the app. The phone fills in the time and the pace. Nothing leaves the phone.**

A line is calm and short. It does not give medical advice, a heart-rate claim, or a calorie. It does not say "you should". If the pace is not ready yet, the line talks about the time only. The same list can praise a walk, a run, and a cycle without pretending to be a coach who knows the person.

**A live model (Thumos through xAI) is later, and only if you explicitly opt in.** Today `XAI_PERSONAL_DATA_ENABLED=false` is the switch that keeps personal data from being sent for coaching. An update that sent pace, time, or place would be personal data. Place should not be sent even if you later opt in. Pace and time would be the most we would send, and only after a separate yes on that screen, and only while that switch allows it. The first version does not call Thumos, the model, or any server for these lines.

## 4. Pace and distance

**Recommendation: the phone's location, only after they tap Start, only while the activity screen is open. Pause and Finish stop it.**

Drop a fix that is worse than about 50 metres. Drop a jump that would mean an impossible speed for the activity they chose (a rough cap, so a bad fix does not add a kilometre). Those caps are filters. They are not targets, and the app does not switch someone from walk to run because they sped up. The activity is whatever they picked.

If the fix is still poor, show "Waiting for a clearer fix" and do not add distance yet. Under about 50 metres, show the pace as a dash, so the first seconds do not flash a wild number.

The map's "where I am" behaviour stays as it is. This watch exists only on the activity screen. The tests that forbid a continuous watch would be opened for that one screen when this is built, and left closed everywhere else.

Battery: the lit screen costs more than the location fixes. Balanced accuracy is enough. Best-possible navigation accuracy, all the time, is not.

The step counter stays unused, so the motion sentence stays true. Android motion activity stays off.

## 5. Saving

**Recommendation: on the phone only. The summary is the activity, the date, the distance, the time, and the average pace. No path.**

A path is a trail of where they were. The first version does not store one, even on the phone. Finish writes the summary. Don't keep this removes it. Leaving the screen keeps it, so a dropped call after Finish does not lose the outing. Outside is Good can show the last few, with Delete. Reinstalling, or deleting the app, clears them. The screen should say that.

**Not a cloud table in the first version.** A table of outings would be location-related even without the path, because a distance and a time still say that someone went out. It would need a privacy-note update, a line in the data download (`export_my_data`), and the same delete as the rest of the account. Saved routes already sit on the account, and that migration does not add them to the download. A new activity table must not copy that gap. If you later want the summary to follow the account, store the summary only, still with no path, and add it to the download and to delete before it is switched on.

**Apple Health.** The app can already read workouts. The sentence that covers writing says it writes food and water, and that it does not write workouts. A Save to Apple Health button would make that sentence false. The button is on the drawing so you can see it. It is not in the first build. Building it needs the new sentence at the end of this note, and your OK. What it would write, after that: the type (walk, run, or cycle), the start, the end, and the distance. It would not write the path, a heart rate, steps, or a calorie guess. We do not have a heart rate from this screen, and a guessed calorie reads like advice.

**Gratitude.** The tick uses the words already in the app: "Also save to my Gratitude diary". It is off. If they tick it, the diary gets the note they typed, the same private diary as any other line. That note does live on the account, like the rest of the diary. It does not include the path. An empty note does not create a diary line.

## 6. Safety copy

**Recommendation: Good to know only. Quiet type. No banner.**

Use the lines the other Outside screens already use, once each:

- Not medical advice. If you feel unwell, contact your GP or NHS 111. Call 999 for chest pain, fainting, or breathlessness.
- If you are in distress, call Samaritans on 116 123. Call 999 if you are in immediate danger.
- Live routes can't be shared with anyone. That's to protect your safety.

"Stop if you feel unwell" is already inside the first line. A second sentence would say it twice, so the footer does not add one.

Two short lines that belong to this screen:

- Stay aware of traffic, paths, and other people.
- Distance and pace use your location only while this screen is open. Locking the phone pauses them.

The path line the map already shows ("A line on the map may follow a path that is unsurfaced, closed, or private...") stays on setup, once, because they may have picked a saved route. It is not a banner.

The lock sentence is also in the setup card, above the fold, so they see it before they scroll to Good to know. It is how the feature works. It is not a second medical warning.

## 7. Walk this off

**Leave it hidden.** `SHOW_WALK_THIS_OFF` stays false. The craving walk is a different idea. Start a walk does not link to it, does not reuse its screen, and does not mention it. Turning the constant on is a separate decision.

## 8. First version, and later

**First version**

- Three buttons on Outside is Good.
- The setup screen in the pictures.
- The screen stays on. Locking pauses.
- Location only during the outing, with the filters above.
- On-screen lines from the list on the phone. Spoken as well, if they leave that on, and if a phone check shows music comes back.
- A short buzz with each line.
- Pause, Resume, Finish.
- The summary on the phone, a short recent list, Delete.
- The gratitude tick, words only, off by default.
- Good to know, as above.
- The while-using sentence rewritten, with your OK, in the same binary. No new permission key.

**Later, each one only after you say so**

- Let the phone lock, with Apple's blue location mark and the background mode. Not Always. Android: a visible "Walk in progress" notification, not all-the-time location.
- Save to Apple Health, after the write sentence is changed.
- A summary on the account, with no path, included in the download and in delete, and a short addition to the location privacy note.
- A path kept on the phone, if you want a map of the outing afterwards.
- Live Thumos lines, only with an explicit opt-in, and still with no place sent.
- An automatic pause when they stop moving. The first version pauses only when they tap Pause.

**Not proposed**

- Always location.
- The step counter, or any change to the motion sentence.
- Background audio.
- A notification for each update.
- A cloud path.
- A calorie.
- Any link to Walk this off.

## Wording that needs your OK

None of this is in the app. Nothing below is added until you approve it.

**While-using location, for the first version.** Same permission as today. New words, because the current sentence would become untrue.

Today: "Charioteer uses your location only while the map is open, to show where you are. A route is sent to the route service only if you turn route finding on. It is not tracked in the background. It is not shared with other people. It is stored only if you save a route."

Proposed: "Charioteer uses your location while the map is open, to show where you are, and during a walk, run, or cycle you start, to measure distance and pace. That measure runs only while the activity screen is open. Locking the phone pauses it. It is not tracked in the background. It is not shared with other people. A route is stored only if you save it. A finished activity stores the distance, time, and pace on this phone, not the path."

The map screens keep today's page line. The activity screens use the lock sentence in section 6.

**Apple Health write, only if you want that button built.** Not the first version.

Today: "Charioteer writes the food and water you log to Apple Health: dietary energy, protein, carbohydrate, sugar, fibre, fat, sodium and water. It does not write steps, sleep, heart rate, workouts, or weight."

Proposed: "Charioteer writes the food and water you log to Apple Health: dietary energy, protein, carbohydrate, sugar, fibre, fat, sodium and water. If you tap Save to Apple Health after a walk, run, or cycle, it also writes that workout: the type, the time, and the distance. It does not write the path, steps, sleep, heart rate, or weight."

**Do not add, unless a later version is approved on purpose**

- `NSLocationAlwaysAndWhenInUseUsageDescription` (Always location).
- `NSLocationAlwaysUsageDescription`.
- UIBackgroundModes `location` (only with the blue-mark version, not the first).
- UIBackgroundModes `audio`.
- A new motion sentence. The current one stays, because we will not read motion.
- A new microphone sentence. Speaking is not recording.

## Review risks

The risk that actually delays a review is background location, Always location, or a purpose sentence that does not match the app. The first version avoids the first two. It does need the location sentence above, in the binary that ships the feature, so the words match.

A background audio mode for the spoken lines would be a likely rejection. It is not in the plan.

Writing a workout while the Health sentence says we do not write workouts would be a rejection. The button stays on the drawing until the sentence is approved.

A step counter while the motion sentence says we do not use motion would be the same kind of rejection. The step counter is not in the plan.

## What this note does not do

No feature code. No change to `app.json`. No new permission. Build number 72. Nothing deployed. The outdoor-route function is still not deployed. The map full-screen work on this branch is unchanged.
