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

## How the shared view is built

Your choices are stored in `profile_sharing`, which only you can read and write. Other signed-in people do not read that table, and they do not read your private rows. They call `public_profile`, which returns only the fields you have switched on. It returns nothing if you are signed out, if Community is off, if age is not confirmed, or if either of you has blocked the other.

Gratitude and vision picture files stay in your private storage. A shared gratitude photo is identified on the profile. A shared vision item shows the caption and life area. A progress photo you have marked for the community can be opened, as it could before.

## Reports

A report can be sent about a shared profile item. The report goes to the moderation queue.

## Your other choices

You can export your data or delete the account. Deleting the account removes the sharing settings with the rest of the account. You can change Community, health, and coach consent at any time.
