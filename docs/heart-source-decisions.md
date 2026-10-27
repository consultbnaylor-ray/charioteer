# Heart rate without assuming an Apple Watch

Design only. Nothing in this note is in the app. No screen, no library, no permission, and no background mode changes. `ios.buildNumber` stays 72. Branched from build 75, `ff6c958`. Not mixed with the Start crash hotfix or the route-adjust work.

The 26 October 2026 decision stands. Garmin, Bluetooth, and Always location were left out of build 74 and build 75. Ben decides. This note does not build them.

Ben, 27 October 2026, 07:52 GMT, on build 75: "It says no heart rate source and refers to Apple Watch, what if the user is wearing a Garmin like I am now?" He wears a vívoactive 6, and he also tests with an Apple Watch.

## What the screen says today

The empty row is the same on a walk, run, or cycle and on a strength or cardio session. The strings are in `src/domain/activitySession.ts`.

- The row title is "Heart rate".
- With no recent sample the value is "No heart-rate source".
- Under that, the app says "Start a workout on your Apple Watch to show heart rate. The iPhone does not measure it."
- Under that, on every visit, the app says "Heart rate updates while Charioteer is in front. It does not update while the app is suspended. The number stays on this phone and is not sent."
- When a number is showing, the row adds " · Apple Watch", including when the sample was not checked for which app wrote it (`activity.tsx` and `gym-session.tsx`).

"Active energy" and "Active energy not available yet" are on the strength and cardio screen only. The outing live card does not have that row. Ben's photograph includes it, so the drawing below includes it. The energy words are already source-neutral. They stay.

The read behind the row is `src/health/liveReading.ios.ts`. It asks Apple Health for heart rate, and for active energy on the gym session, only while the app is in front. It does not ask for background delivery. It does not talk to a watch radio. A sample older than about a minute becomes "No heart-rate source".

`app.json` lists `UIBackgroundModes` as `location` and `audio` only. There is no `NSBluetoothAlwaysUsageDescription` and no `bluetooth-central`.

## What is true for each source

**Apple Watch, through Apple Health.** Verified in this app. A workout on the Watch can write heart-rate samples into Apple Health. This app already has permission to read `HKQuantityTypeIdentifierHeartRate`. It reads the latest sample only while Charioteer is in front. It does not read while the app is suspended. The iPhone does not measure heart rate. Wearing the Watch without a workout often leaves the row empty, because the Watch then writes only now and then, and a sample older than about a minute is treated as no source.

**Garmin, through Apple Health.** This app does not ask Garmin Connect for a live heart rate. If a heart-rate sample is already in Apple Health, the current query can show it, and the row would still say "Apple Watch", because the code never reads the source name.

Garmin's support article is titled "Sharing Your Garmin Connect Data With Apple Health" (`https://support.garmin.com/en-US/?faq=lK5FPB9iPF5PXFkIpFlFPA`). This checkout could not read that article's body, so it does not confirm the delay, which samples are copied, or whether the Connect app has to be in front. Copies of that article say Connect shares heart rate after a device sync, that all-day heart rate is included, and that a timed activity contributes only its high and low. Those copies are not treated as the article. What this note will say, and all it will say, is that a Garmin worn during the outing is not, by itself, a live source for this row.

**Garmin Broadcast Heart Rate.** Verified in the vívoactive 6 owner's manual, "Broadcasting Heart Rate Data". The watch can broadcast heart rate to a paired device. The path is Settings, Health & Wellness, Wrist Heart Rate, Broadcast Heart Rate, or the controls menu. The manual says broadcasting decreases battery life. An activity setting can start the broadcast when the activity starts. The person has to turn it on. This app cannot turn it on.

The same manual does not name Bluetooth, and it does not name the standard Heart Rate Service. The watch is ANT+ certified, and it pairs other sensors with ANT+ or Bluetooth. This checkout did not see a broadcast from Ben's watch. A later reader that looks only for the standard Bluetooth Heart Rate Service will see the watch only if that is what the broadcast actually is. If a given broadcast is ANT+ only, the iPhone will see nothing. This design does not add ANT+.

**Active energy.** The gym row sums Apple Health active-energy samples while that screen is in front. The standard heart-rate broadcast is a heart rate, not calories. The energy row stays "Active energy not available yet" until Apple Health has samples. Whether Garmin Connect later copies active energy is in the same unread support article, so it is not stated here.

## One sentence on the row

This sentence is **not approved**. It replaces the Apple Watch hint. It is not in the app.

"The iPhone does not measure it."

"No heart-rate source" stays. It does not name a watch. The long lines leave the row and sit behind More info, which stays closed until it is opened. That is the same rule as the other cards: one short sentence, and the rest behind More info.

Behind More info, word for word, the line already on the card:

"Heart rate updates while Charioteer is in front. It does not update while the app is suspended. The number stays on this phone and is not sent."

Behind More info, these sentences are **not approved**:

- "An Apple Watch workout can put heart rate into Apple Health. This screen reads it only while Charioteer is in front."
- "Wearing a Garmin does not fill this row. A reading already in Apple Health can, after that watch has synced."
- "Live heart rate from a Garmin needs Broadcast Heart Rate on the watch. This app does not read that broadcast."

When a number is showing, the row stops adding " · Apple Watch". The proposed suffix is **not approved**: " · Apple Health". The code reads Apple Health and does not know which app wrote the sample. A later broadcast, if it is built, would say " · Broadcast" instead. That word is not used until that build exists.

"Active energy not available yet" stays on the gym session. It is not copied onto the outing.

The same empty sentence is used on the outing and on the strength or cardio session, because they share the hint.

## A live heart rate over Bluetooth

Not in this build. The 26 October decision left it out. The pieces below are what a later build would need. None of them is added here.

**Library.** The app has no Bluetooth library. A reader would use something in the class of `react-native-ble-plx`, through an Expo config plugin, in a build that includes the native module. It would look for the standard Heart Rate Service only, and only after the person asks for a broadcast. It would not scan at launch, and it would not scan all day. Stop, discard, and the six-hour limit stop the scan. The watch address is not stored and not logged.

**Permission.** A new purpose string, `NSBluetoothAlwaysUsageDescription`. iOS shows this for a Bluetooth central. There is no such key today.

This sentence is **not approved**:

"Charioteer reads a heart rate a watch or strap is broadcasting over Bluetooth during a walk, run, cycle, or gym session you start, including when the phone is locked. The reading stays on this phone and is not sent."

The 26 October draft named Garmin and said "Garmin Connect is not used." This sentence does not. Connect is already a separate part of the app. The broadcast does not call it.

**Background mode.** This is a new background mode. `UIBackgroundModes` would gain `bluetooth-central`. Today the list is `location` and `audio` only. `bluetooth-central` is what lets the phone keep the broadcast while the screen is locked or another app is in front. Without it, the broadcast pauses when the app leaves the front, which is the same limit the Apple Health read already has. Do not add `bluetooth-central` for an Apple Watch test. Do not add it in the same change as the wording above.

**App Review.** Guideline 2.5.4 is the rule for background modes: the mode has to match a feature the person can see. External TestFlight goes through Beta App Review. Internal TestFlight does not. A store submission is a fresh archive with `EXPO_PUBLIC_BUILD_PROFILE=store` and a new build number. Promoting the current TestFlight build is not the store path. A binary that contains `bluetooth-central` is that kind of fresh archive. Guideline 5.1.1 applies to the new sentence: the words have to match the use.

**Battery.** Garmin's vívoactive 6 manual says broadcasting heart rate decreases the watch battery. The phone radio would stay on for the outing if `bluetooth-central` is on. No figure is invented here. The radio stops on Stop, on discard, and at six hours. It does not stay on after that.

**Privacy.** The reading stays on this phone. It is not sent. It is not written to a log, to the route request table, or to the data export, and it is not placed next to sobriety fields. The stored outing summary stays the activity, the date, the distance, the time, and the pace. A broadcast is not added to that list.

**DPIA and security.** The location DPIA describes a heart rate as a sample Apple Health already holds, read in the foreground. A radio reading is a new way of collecting the same kind of data. The DPIA and the privacy note would need that path described before a build. This branch does not edit them. Whether UK GDPR Article 9 applies is still for a solicitor. The Health share sentence does not need to change for a broadcast, because the broadcast is not an Apple Health read. The Bluetooth sentence is the new one.

## After the outing, from Apple Health

This uses the Health read the app already has. No new permission. No Bluetooth key. No `bluetooth-central`.

On Finished, if Apple Health has heart-rate samples from the start of the outing to Stop, the card can show one line. This sentence is **not approved**:

"Apple Health heart rate for this outing: 142 bpm on average."

The number is an example. If there are no samples, the line is absent. It does not say Garmin, and it does not say Apple Watch. A vívoactive 6 appears there only when Garmin Connect has already put samples into Apple Health. This note does not claim how long that sync takes.

The line is on the Finished screen. It is not added to the saved summary, and Done still keeps the distance, the time, and the pace. A stored heart rate would be a later decision.

Active energy on that screen, for a gym session, stays the Apple Health sum. It is not estimated from a broadcast.

## Order

1. The empty-row sentence, and More info, on the outing and the gym session. No new key. The row stops saying Apple Watch.
2. The Finished line, from Apple Health samples already on the phone. No new key.
3. Live Bluetooth, only after Ben approves the purpose string and `bluetooth-central`. That is a new native build and a fresh store archive. It is not build 75.

## Layout proofs

Proof of the design. Not the app. More info is closed. The energy row is the gym session's row, included because the photograph had it. The outing uses the same heart-rate lines and does not have that energy row.

390 wide.

![Heart-rate row, 390 wide. Proof of the design. Not the app.](heart-source/empty_390.png)

320 wide.

![Heart-rate row, 320 wide. Proof of the design. Not the app.](heart-source/empty_320.png)

## Decisions for Ben

None of these is in the app. The sentences below are **not approved**.

1. Replace the Apple Watch hint with "The iPhone does not measure it." Keep "No heart-rate source". Recommendation: yes.
2. Move the foreground sentence, and the three source sentences, behind More info. Recommendation: yes.
3. When a number is showing, say "Apple Health" rather than "Apple Watch". Recommendation: yes.
4. On Finished, show an Apple Health average for that outing when samples exist. Do not store it. Recommendation: yes.
5. Leave Broadcast Heart Rate, `NSBluetoothAlwaysUsageDescription`, and `bluetooth-central` unbuilt until you approve that sentence and that background mode. Recommendation: yes.
