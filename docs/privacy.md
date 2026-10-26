# Privacy

Quantica Labs Ltd is the controller for Charioteer Sober/Health Coach. This page is plain language for the product. It is not a solicitor’s privacy notice. Have it reviewed before a public launch.

## What stays on your account

Your check-in notes, mood, sleep, and craving scores stay on your account. Raw health readings, health flags, height, and Thumos chats stay on your account. A photo stays on your account until you choose to share that photo.

Other people cannot open those private tables. The app does not add a public read policy to them.

## What other community members can see

Community is off until you turn it on, and only if you have confirmed you are 18 or over. While it is off, your profile is hidden.

When Community is on, other signed-in adults can see your name and your interests. Everything else starts off. You choose each item with Share on profile:

- Town or area
- Stage, such as stopped or cutting down
- Days sober and milestones
- The reason lines you pick
- Money saved and units avoided, as totals only
- A check-in mood streak, as a count only
- Health headlines you pick, such as a steps average or a sleep average
- A progress photo you mark for the community
- A gratitude line you pick
- A gratitude photo you pick
- A vision board caption you pick
- A Stoic quote you have pinned, if you switch that on

Turning a switch off hides that item on the next view. The People screen shows a preview of what is shared and a list of what is hidden.

A profile picture and the profile gallery are shown to signed-in community members while Community is on. There is no separate switch for each gallery photo, and there is no limit on how many you can add. The profile front shows the first photos, in the order you set. See all photos opens the rest. Removing a photo in Edit profile takes it off the public profile on the next view. The file is a JPEG in the private profile-photos bucket. Location data is stripped before upload. A signed link is used to show it. There is no public file address.

## Sensitive information

Days sober, your stage, reasons, money and unit totals, a mood streak, and health headlines are special category data under UK GDPR. The first time you share any of that, the app asks you to confirm. It tells you that other adults in the Charioteer community can see the items you switch on, and that Quantica Labs Ltd is the controller.

Town, a gratitude line, a vision caption, and a pinned Stoic quote are not treated as that same confirmation. A pinned quote is a public-domain line you chose. A progress photo already asks before it is shown to the community.

## What one buddy can see

A buddy is not the community. Community switches live in `profile_sharing` and are read only by `public_profile`. That call returns nothing unless you are signed in, Community is on for both of you, age is confirmed, and neither of you has blocked the other. Those switches are the same for every community member. They are not a private share with one person.

What you choose for one buddy is stored on that buddy invite (`buddy_invites.scope`). `shared_buddy_data` returns only those sections, and only to that person after they have accepted. It does not read `profile_sharing`, and it does not ask whether Community is on. Another buddy’s invite is a different row. A block either way returns nothing. Health data on that invite stays off unless that switch is on for that person.

Turning Community off hides the community profile. It does not publish the community switches to a buddy, and it does not erase a buddy invite. The app does not yet store a separate copy of every community field for each buddy. Until that is approved and applied, a buddy sees the invite sections, not the What I share switches.

## Photos shared with a buddy

A photo you send from Buddies is not a community photo. Community stays public to other adults when you turn it on. A buddy photo is private to the buddies you tick, and each buddy is a separate choice. Another buddy does not see that you sent it to someone else. The feed for a recipient does not include the other recipients.

The picture and the caption stay on your account until you delete the photo or delete the account. A caption can be about health or sobriety, so it can be special category data. It is not used for advertising. A signed link lasts about 15 minutes. There is no public URL.

Hide removes the photo from that buddy's list. It does not delete the file. Delete removes the row and the file for everyone. A copy already saved on a phone, or a screenshot, is not removed. The screen says so. A report can stay after the photo is gone.

The tick "Also add to my Gratitude list" makes a second private copy in the gratitude diary. Deleting one does not delete the other.

Save to Photos adds the JPEG to the phone's photo library. The app does not create a named Charioteer album, because creating one would read the rest of the library. The add-only purpose sentence is: "Charioteer adds a photo to your photo library when you tap Save. It cannot create a separate Charioteer album without reading your other photos, so it does not. It never reads your other photos."

The camera and library sentences cover a private progress photo and a photo you choose to send. A progress photo stays private. A photo you send is shown only to the buddies you pick, not the Community, and it is not sent to the coach.

The table, the bucket, and the export change are in the repo and have not been applied. Export includes the photos you sent (with their storage path), the photos shared with you (without the other recipients), and the recipient list for photos you sent. Account deletion removes the buddy-photos folder before the account goes. Rows are removed with the profile.

This note is not a solicitor's DPIA.

## How the shared view is built

Your choices are stored in `profile_sharing`, which only you can read and write. Other signed-in people do not read that table, and they do not read your private rows. They call `public_profile`, which returns only the fields you have switched on. It returns nothing if you are signed out, if Community is off, if age is not confirmed, or if either of you has blocked the other.

Gratitude and vision picture files stay in your private storage. A shared gratitude photo is identified on the profile. A shared vision item shows the caption and life area. A progress photo you have marked for the community can be opened, as it could before.

## Reports

A report can be sent about a shared profile item. The report goes to the moderation queue.

## Your other choices

You can export your data or delete the account. Deleting the account removes the sharing settings with the rest of the account. You can change Community, health, and coach consent at any time.

## Apple Health

On iPhone, Charioteer can read Apple Health when you allow it. It reads steps, sleep, heart rate, resting heart rate, heart rate variability, cardio fitness (VO2 max), walking heart rate, heart rate recovery, workouts (type, duration, distance, energy, and average heart rate), walking, cycling and swimming distance, weight, height, body fat, lean body mass, active energy, and exercise minutes. It does not read blood oxygen. It never writes workouts, heart rate, steps, sleep, or weight. It writes only the meals and water you choose to save.

Readings stay on your account as daily totals: minutes split into strength, cardio, and other, plus the latest cardio fitness, walking heart rate, heart rate recovery, and session heart rate for a day. A raw heart-rate trace from a workout is not stored. Other people cannot see these readings. They are not used for advertising or marketing.

If you turn on the coach as well as health data, a short summary is sent to the model to write the Health Plan and Thumos replies. That summary is the fitness level, the trend in a sentence, weekly minutes, the mix of sessions, and recovery. The raw samples are not sent for that. You can turn the coach off, and you can turn Apple Health off in Settings > Health > Data Access & Devices > Charioteer. The fitness card is an estimate, not a medical assessment.

## Calendar

Add to Calendar opens Apple's add-event sheet for a planned workout. The iPhone app contains a calendar purpose sentence only so Apple's upload check can see why that code is in the app. The sentence is: "Charioteer only opens Apple's add-event sheet when you tap Add to Calendar. It never reads your calendar." The calendar plugin copies that same sentence onto the full-calendar purpose text. Reminder purpose text is left out. Tapping the button does not ask for calendar permission, and Charioteer does not read your calendar or your reminders.

## Location

Outside is Good can use your location while the map is open, and during a walk, run, or cycle you start, and only if you allow it. The iPhone purpose sentence is: "Charioteer uses your location while you are on a walk, run or cycle to track distance and give you spoken updates, including when the screen is locked or you are using other apps. Your route stays on your phone and is not sent anywhere. The same permission shows where you are while the map is open. A route is sent to the route service only if you turn route finding on, and that request is the start and the destination, not this route."

## Activity tracking

Approved by Ben on 26 October 2026 for build 74. Not shipped. The purpose sentence in the Location section is the one in this build.

Charioteer uses your location while you are on a walk, run, or cycle you start, to track distance and give you updates, including when the screen is locked or you are using another app. You tap Start before measuring begins. An explanation in the app comes before the system permission. The permission stays while using the app. Always location is not added. iOS can show a blue location mark while measuring is on. Measuring stops when you tap Stop, when you discard the outing, when the app is closed, and after the time limit. That limit is six hours (`OUTING_TIME_LIMIT_MS`). Ben confirmed that length on 26 October 2026. The route of that outing stays in memory on your phone for the outing only. It is cleared when you stop or discard it. If the app is closed mid-outing, the route is lost. It is not sent anywhere, including to the account, the route service, the coach, or a model. A live-tracking route is not sent to HeiGIT. It is not written to a log. It is not combined with sobriety logs or included in a data export. A finished activity you choose to keep stores the distance, time, and pace on this phone, not the path. Split times on the screen are the kilometre and the time. They have no coordinates, and they are not kept in that summary.

Spoken lines are on-device text to speech from a fixed list on the phone, and only when you pick spoken updates. The phone fills in the time and the pace. There is no microphone and no recording. On screen only does not start an audio session. There is no silent keepalive audio. App Store submission is blocked until a real phone shows music ducks, then returns to full volume after each line, with no leftover audio session, including a phone call and Bluetooth headphones.

Heart rate and active energy are read from Apple Health while the outing or the gym session is in front. The read is foreground only. The Health background-delivery entitlement is not in this build. The iPhone does not measure heart rate. Those readings stay on this phone and are not sent. They are not added to the data export and they are not written next to sobriety fields. The read stops on Stop, on discard, and at the time limit. Whether UK GDPR Article 9 applies is for a solicitor to confirm. This notice is not that confirmation.

A gym session on the Workouts screen shows a clock you start, a heart-rate row, and active energy when Apple Health has it. It does not use location. It does not count reps. It is not sent.

Route finding stays separate. A route you ask for still sends only the start and the destination.

Route finding is off until you turn it on. The first time you open Find a route, the app asks. Not now leaves Outside is Good, saved routes, and the map working, and it does not call the route service. You can turn it off again from Profile. The choice is stored on this phone only, with the time and the wording version. It is not a database column. Another phone starts off.

Walk this off (the craving walk) is parked. It is not shown. The screen and the route engine stay in the app behind `SHOW_WALK_THIS_OFF`, which is off. Turning that constant on would show it again. It is not a live feature, and the consent screen and Profile do not offer it.

When route finding is on, the start point and the destination are sent to our route service to make the route. The service is OpenRouteService, run by HeiGIT, built on OpenStreetMap data. Nothing from that request is shared with other people. A route sends the coordinates and the travel type only. It does not send your name or account number. HeiGIT sees our server's address, not your phone's. A place search sends the words you type.

HeiGIT's transparency statement (https://account.heigit.org/info/transparency-statement) says the full request and response, the IP address, and the API key are kept for 7 days to look for abuse, then deleted. For openrouteservice, coordinates rounded to two decimal places (about 1 km) and the request metadata are kept with no end date. A place search is geocoding. The same statement says the typed place and its coordinate are not kept past those 7 days. The statement says the servers are in the EU, and that the statement is voluntary and not a binding promise. The April 2022 privacy policy (https://heigit.org/privacy-policy/) still says personal data is kept only as long as needed. It does not give these day counts. The terms (https://account.heigit.org/info/tos) do not restate the 7 days.

The phone calls a Charioteer function. The function holds the route-service key. The key is not in the app. The function does not log the key or the place. The old host api.openrouteservice.org is not used. Requests go to api.heigit.org. HeiGIT said that old host is switched off in the week of 16 November 2026 (https://heigit.org/changes-in-the-openrouteservice-universe/, 22 October 2026). An earlier forum note said 2–6 November 2026. The free Standard plan allows 2,000 direction requests a day (https://account.heigit.org/info/plans). The function stops the whole app at 1,500 a day, and one person at 40 a day.

OpenStreetMap data is under the Open Database Licence. The visible credit is for the contributors. Turning route finding on is not a request to accept OpenStreetMap terms. OpenRouteService results are under CC-BY-SA 4.0. The required credit is "© openrouteservice by HeiGIT | Data from OpenStreetMap", and the map also shows "© OpenStreetMap contributors" and the OpenFreeMap credit. A saved route stays on your account. It is not sent to other people.

The map opens on the light OpenFreeMap Liberty style. A light or dark choice is remembered on this phone only. Both styles, and their tiles, are requested from tiles.openfreemap.org. Full screen is a larger view of the same map. It does not add a permission or another host.

HeiGIT's terms (https://account.heigit.org/info/tos) say not to send personal data except for their own account. A start point can be personal data. There is no signed agreement and no data-processing agreement with HeiGIT. This test version sends a start point only after you turn route finding on. Before a public launch, ask HeiGIT in writing about end-user location coordinates and a data-processing agreement, and either self-host the route service in the EU or get that agreement in writing.

The page still opens if you say no to location. There is no Always location. Android asks for fine and coarse location in the foreground only, and it does not ask for all-the-time location. A walk, run, or cycle you start on iPhone can keep location on until you stop, discard it, close the app, or reach the time limit. A saved route is a line on your account. You can delete it. A live fix from the map is not stored. The outing path is not stored. Live routes can't be shared with anyone. That's to protect your safety. No live-tracking route is sent to HeiGIT.

This is not medical advice. The Outside is Good screens say so, and they name a GP, NHS 111, 999, and Samaritans on 116 123. Walk this off is parked, so that naming is on the live Outside is Good screens, not on a craving-walk screen.

The iPhone app contains a motion purpose sentence only so Apple's upload check can see it. The sentence is: "Charioteer does not use your motion or fitness data. The map component in the app can reference motion sensors, so Apple requires this note." Charioteer does not read motion or fitness-activity data. Android motion activity stays off.

The iPhone app contains a microphone purpose sentence because an audio component is included. Voice is switched off in this version. The sentence is: "Charioteer does not record audio. Voice is switched off in this version. Apple requires this note because an audio component is included in the app." Charioteer does not record audio.

The iPhone app contains a Face ID purpose sentence because a component in the app can reference it. The sentence is: "Charioteer does not use Face ID. Apple requires this note because a component in the app can reference it." Charioteer does not use Face ID.
