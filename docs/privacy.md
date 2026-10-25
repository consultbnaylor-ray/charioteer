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

## Sensitive information

Days sober, your stage, reasons, money and unit totals, a mood streak, and health headlines are special category data under UK GDPR. The first time you share any of that, the app asks you to confirm. It tells you that other adults in the Charioteer community can see the items you switch on, and that Quantica Labs Ltd is the controller.

Town, a gratitude line, a vision caption, and a pinned Stoic quote are not treated as that same confirmation. A pinned quote is a public-domain line you chose. A progress photo already asks before it is shown to the community.

## What one buddy can see

A buddy is not the community. Community switches live in `profile_sharing` and are read only by `public_profile`. That call returns nothing unless you are signed in, Community is on for both of you, age is confirmed, and neither of you has blocked the other. Those switches are the same for every community member. They are not a private share with one person.

What you choose for one buddy is stored on that buddy invite (`buddy_invites.scope`). `shared_buddy_data` returns only those sections, and only to that person after they have accepted. It does not read `profile_sharing`, and it does not ask whether Community is on. Another buddy’s invite is a different row. A block either way returns nothing. Health data on that invite stays off unless that switch is on for that person.

Turning Community off hides the community profile. It does not publish the community switches to a buddy, and it does not erase a buddy invite. The app does not yet store a separate copy of every community field for each buddy. Until that is approved and applied, a buddy sees the invite sections, not the What I share switches.

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
