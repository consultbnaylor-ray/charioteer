# Charioteer

Charioteer is a sobriety and wellbeing app for the web and iOS. The name comes from Plato’s charioteer of the soul. Thumos is the spirited horse: the coach that helps someone stay sober and get healthier.

It is for people who are alcohol-dependent and for people who simply want a quieter, more sober life. The owner is Ben Naylor (UK, Quantica Labs Ltd). The interface uses UK English.

## Stack

- Expo SDK 57, React Native, TypeScript, and Expo Router. One codebase runs on the web and on iOS.
- Supabase for email auth, Sign in with Apple, Postgres with row-level security, realtime chat, and edge functions. Schema lives in `supabase/migrations/`.
- Thumos talks to the xAI Grok API only from edge functions. Text uses `thumos-chat`. Voice uses `thumos-voice-token` to mint an ephemeral client secret, then the phone opens the realtime socket itself. The client never sees `XAI_API_KEY`.
- Apple Health on iOS uses `@kingstinct/react-native-healthkit`. It is a maintained package with an Expo config plugin. `react-native-health` was not used because it has no first-party Expo plugin and is less actively maintained. HealthKit needs a development build. Expo Go cannot load it.

Domain rules (the sober counter, savings, milestones, safety detection, and the Thumos prompt) live in `supabase/functions/_shared/`. The app re-exports them from `src/domain/` so the tests, the screens, and the edge functions cannot drift apart. Relative imports inside that folder use a `.ts` suffix, which Deno requires when deploying functions. Metro strips the suffix (`metro.config.js`). Typecheck allows it (`allowImportingTsExtensions` in `tsconfig.json`).

## What works in V1

- Email sign-up and sign-in, plus a Sign in with Apple path (native identity token on iOS, OAuth redirect on the web). The button is hidden unless `EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED` is exactly `true`. Leave that unset until the Apple provider is enabled in Supabase.
- Onboarding: name, 18+ confirmation, sobriety start date, personal reasons, weekly spend and units, interests, optional town or area, and separate consents for community, health data, and the coach. Under 18 is a hard stop, with Drinkline and the Samaritans.
- Sober tracker: days and hours, money saved, units avoided, milestones (24 hours, 7 days, 30 days, 90 days, 6 months, 1 year) with badges. A lapse resets the clock and keeps the length of the previous stretch. The copy is compassionate.
- Daily check-in: mood, sleep, craving from 0 to 10, optional note, and history.
- Breathing: box breathing, 4-7-8, and a physiological sigh, with an animated guide. Haptics play on a phone. A short urge-surfing exercise sits beside them.
- Thumos voice on iOS. The Voice button opens a spoken conversation: the phone sends 24 kHz PCM to Grok Voice and plays the reply as it arrives. Server-side voice detection lets the person interrupt. Both sides are stored with the text history. A safety hit is spoken and shown as the fixed notice. It needs a dev or TestFlight build, not Expo Go, and it has not been heard on a device from this environment. Web can start a call in a browser that allows the microphone.
- Stoic Quotes, in the Tools menu. A bundled library of public-domain lines from Marcus Aurelius, Seneca’s dialogues, Epictetus, and Zeno, each with its author and source. The quote of the day follows the UK date, so everyone sees the same line that day. Favourites stay private. A pinned line sits at the top of You, and on the public profile only if that Share on profile switch is on.
- Thumos text chat. The system prompt is about staying sober and getting healthier. It opens by asking how the person is feeling. Context includes days sober, recent check-ins, health trends, personal reasons, milestones, and a pinned Stoic quote when coach consent is on. A self-harm turn withholds that quote. Feeling well leads to next steps (exercise, sleep, nutrition, connection, purpose). A craving, a permission-giving thought (“just one”, “one won’t hurt”), or a situation ahead (a birthday meal, party, wedding, work do, date, pub, family gathering, holiday, stressful meeting, or mates drinking) switches to support. A craving still gets the short support turn, which names the breathing exercise, the timer, and a walk, and uses at most one reason. An upcoming event gets event preparation instead: 3 to 5 practical suggestions, covering exercise beforehand as general wellbeing (and alternatives if that does not suit), a drink plan, what to do during, and a reward plus a gratitude note afterwards. Text and voice share that prompt. Redeploy `thumos-chat` and `thumos-voice-token`. Sober time is mentioned at most once in the conversation. A later turn answers the new thought. If they commit to breathing, the timer, or a walk, the reply is one or two sentences and does not ask for more. A self-harm message stays on them and on getting help, and the prompt withholds the sober count and their reasons. The fixed safety notice is unchanged. The recent messages are sent to the model, oldest first. Conversation history is stored per account.
- Safety: heavy daily drinking plus wanting to stop abruptly, or withdrawal symptoms (shakes, sweating, hallucinations, seizures), adds advice to contact a GP, NHS 111, or 999. Suicidal thoughts or self-harm add the Samaritans on 116 123 and 999. Whenever that detector fires, the fixed notice is pinned at the top of the chat, whatever the model wrote. The same text is stored on the reply. Thumos says it is not a medical professional.
- SOS on Today. One tap opens craving support with a 10-minute urge timer, breathing, and the person’s reasons.
- Library: quit lit, sober groups, UK helplines, and general health, stored as data in `src/data/catalogue.ts` and `supabase/seed.sql`. The sign-in screen has “Need help now?” so Samaritans and Drinkline are visible before an account exists.
- Community: interests (including custom ones), town or area only, discovery by shared interests, connection requests, and private 1:1 chat. Block and report. Moderators see a reports queue on You. Rowan Blake is a moderator in the sample.
- Account export (JSON download on the web) and account deletion. Explicit consent, RLS on every table, and grants that stop a user promoting themselves to moderator. Hosted Supabase gives `authenticated` full UPDATE on new public tables. `20261010130000_tighten_grants.sql` revokes that, revokes default privileges for new public tables, and grants back only the columns the app writes. `is_moderator` is not one of them. Because those default privileges are gone, every future table needs its own explicit grants. The init migration’s statements are unchanged because they are already applied; a comment there records this intent. Health upserts also update `user_id`, `kind`, `recorded_on`, and `source`. `20261010140000_health_upsert_grant.sql` grants UPDATE on those columns. `health_own` still requires `user_id = auth.uid()` before and after the write.
- Dark is the default. Light, and matching the device, stay available under You, with three text sizes. Colour and type are tokens in `src/ui/theme.tsx`: near-black and off-white, grey for hierarchy, Oswald for headings, Barlow for text, square corners. The only hue is a deep red, for SOS and safety notices. The mark is a winged Greek helmet (`assets/brand/helmet.svg`), used on the icon, splash, header, and sign-in screen.
- A demo mode that runs the whole app without Docker or Supabase, with seed people, check-ins, health readings, a sample conversation, and a chat.

## What is stubbed

- **Text model.** Chat uses the verified Chat Completions call: `POST https://api.x.ai/v1/chat/completions`. The default model is `grok-4.3` with `reasoning_effort` set to `low`. xAI’s docs (retrieved 10 October 2026) say that is the fast setting which still spends a few reasoning tokens, and that `none` is no reasoning at all. A live pass with `none` answered in about 1–1.4 seconds to the first token, but the replies were a single generic line, so the function now uses `low`. `low` has not been timed here. `grok-4.7` cannot disable reasoning and defaults to `high`, which is the 40–50 second wait. The reply is streamed. The server reads the message for a craving, a permission-giving thought, or an upcoming event, and uses the matching support prompt even if the client sent another mode. Event preparation is in the shared prompt, so a voice call uses it too. Redeploy `thumos-chat` and `thumos-voice-token` for that. A follow-up in the same conversation gets a different instruction from the first support turn. Override the model with `THUMOS_MODEL`. On `grok-4.7`, `grok-4.6`, or `grok-4.5` the function uses `low`, the fastest effort those models allow. `max_tokens` is sent only when effort is `none`, because a low-effort budget is shared with the reasoning tokens.
- **Demo mode does not call xAI**, even if a key is present in the environment. Live replies exist only when the app points at Supabase and the edge function has `XAI_API_KEY`. Without the key, the function stores a clear offline message and still adds safety notices.
- **Sign in with Apple** needs an Apple Services ID, a Supabase provider secret, and a dev build on iOS. The button stays in the code and is hidden until `EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED=true`.
- **Apple Health** reads steps, sleep, resting heart rate, HRV (SDNN), workouts, and weight for the last 14 days, read-only. It runs only in an iOS dev build (`src/health/sync.ios.ts`). Web and Android show a message and the manually logged readings.
- **Android and Apple Watch** are not built. The health and voice modules are isolated so they can be added later.
- **Admin tools** are the reports table and a moderator list on You. There is no separate admin app.
- The consent copy is plain language, not a solicitor’s privacy notice. Have it reviewed before a public launch. Version `2026-10-10`.

## Recommended next steps

1. Run the schema against a current Supabase CLI (`supabase start`) and adjust `config.toml` if that CLI’s template has moved.
2. Set `XAI_API_KEY`, deploy `thumos-chat`, `thumos-voice-token`, and `thumos-voice-turn`, then try a voice call on a real iPhone.
3. Create an iOS development build and test HealthKit and Sign in with Apple.
4. Have a solicitor review the privacy notice, retention, and the lawful basis for special category data.
5. Add Android health (Health Connect) and, later, an Apple Watch complication for the sober counter.

## Run the web app

```bash
npm install
npm run web
```

That starts Expo web on port **43127** and talks to the live Supabase project. No `.env` file is required for that. The sample, with no network account, is an explicit flag:

```bash
EXPO_PUBLIC_DATA_MODE=demo npm run web
```

The sample is stored in the browser under the AsyncStorage key `charioteer.demo.v1`. You → Reset sample data clears it. The “Explore the sample account” button is shown only in demo mode.

Open the sample as Alex Hart from the sign-in screen. Password for every sample account: `Charioteer-demo-1`.

| Email | Who |
| --- | --- |
| alex.hart@example.com | Bristol. 47 days and 6 hours sober, £48 and 30 units a week, hiking and gym. A chat with Jordan and a request from Sam. |
| jordan.ellis@example.com | Manchester. Hiking and exercise. Accepted chat with Alex. |
| sam.okonkwo@example.com | Leeds. Gym and health and fitness. Pending request to Alex. |
| priya.shah@example.com | London. Exercise and health and fitness. |
| rowan.blake@example.com | Glasgow. Health and fitness, and hiking. Moderator. |

New messages to Thumos in demo mode say, plainly, that the coach is not connected. The earlier thread on Alex’s account is stored sample copy, labelled as such.

## Environment

Copy `.env.example`. Never commit a real key, and never prefix the xAI key with `EXPO_PUBLIC_`.

| Variable | Where | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Client | Live project `https://jvmmuhljklkahebxdsah.supabase.co`. This is the default when unset. |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client | Public publishable key. Preferred. Default is the live project key. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Client | Legacy anon key. Used only when the publishable key is empty. |
| `EXPO_PUBLIC_DATA_MODE` | Client | Set to `demo` for the on-device sample. Unset uses Supabase. |
| `EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED` | Client | Set to `true` only after the Supabase Apple provider is on. Otherwise the button is hidden. |
| `XAI_API_KEY` | Edge function only | `supabase secrets set XAI_API_KEY=…` |
| `THUMOS_MODEL` | Edge function | Optional. Default `grok-4.3` with `reasoning_effort` `low`. |
| `GARMIN_CLIENT_ID` | Edge function only | Garmin OAuth client id. |
| `GARMIN_CLIENT_SECRET` | Edge function only | Garmin OAuth client secret. |
| `GARMIN_TOKEN_KEY` | Edge function only | 32-byte AES-GCM key, base64. Seals the Garmin tokens. |
| `GARMIN_WEBHOOK_SECRET` | Edge function only | Required shared secret on the Garmin push URL. |

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into functions. Do not put those in the client.

## Garmin Connect

Generate `GARMIN_TOKEN_KEY` and `GARMIN_WEBHOOK_SECRET` on your machine. Run this twice and keep the two lines apart. Do not commit them.

```bash
openssl rand -base64 32
```

Each line is 32 bytes in standard base64. Set them with the OAuth client values:

```bash
supabase secrets set GARMIN_CLIENT_ID=… GARMIN_CLIENT_SECRET=… GARMIN_TOKEN_KEY=… GARMIN_WEBHOOK_SECRET=…
```

`GARMIN_TOKEN_KEY` seals the access and refresh tokens in the edge functions (AES-GCM). `garmin_connections` stores the ciphertext, a nonce, and `token_key_version`. The status view shows whether the account is connected. Signed-in users cannot read the tokens.

Garmin’s portal stores a URL for each push endpoint. Paste the same address for dailies, activities, sleeps, deregistrations, and user permissions:

```
https://jvmmuhljklkahebxdsah.supabase.co/functions/v1/garmin-webhook?token=YOUR_SECRET
```

Percent-encode the secret in that URL. `openssl rand -base64 32` can include `+`, `/`, and `=`. Write those as `%2B`, `%2F`, and `%3D`. A raw `+` is read as a space, and the webhook then rejects the push. If `GARMIN_WEBHOOK_SECRET` is unset, the webhook rejects every push. Do not log the URL. It contains the secret.

## Local Supabase

Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli) are required. This repository does not vendor them.

```bash
supabase start
supabase status
```

Copy the local API URL and anon key into `.env` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, leave `EXPO_PUBLIC_DATA_MODE` unset, and restart Expo. Pointing back at the hosted project means deleting those overrides.

`supabase/config.toml` targets the CLI this schema was written against (Postgres 15, API on 54321, auth site `http://127.0.0.1:43127`, email confirmations off, Apple provider present but disabled). If `supabase start` rejects the file, compare it with a fresh `supabase init` from your CLI and keep the project id, ports, seed path, and function `verify_jwt` flags.

Seed data is `supabase/seed.sql`: the catalogue, then five auth users. If a future CLI changes `auth.users` columns, the user insert is inside an exception handler so the catalogue still commits, and the notice explains the skip. Demo mode has the same people either way.

Apply a hosted migration with `supabase db push` or your usual pipeline. The first migration is `supabase/migrations/20261010120000_init.sql`. The grant fix is `supabase/migrations/20261010130000_tighten_grants.sql`. The health upsert fix is `supabase/migrations/20261010140000_health_upsert_grant.sql`. Custom interests reuse an existing slug through `supabase/migrations/20261010150000_add_interest.sql` (`add_interest(label)`). `supabase/migrations/20261010160000_consent_reread.sql` grants SELECT on the caller’s own consents and ignores a repeat insert. `supabase/migrations/20261010170000_profile_stage.sql` adds the stage columns and grants UPDATE on those columns only. `supabase/migrations/20261010180000_progress_photos.sql` adds the private progress-photo table, the private `progress-photos` storage bucket, and owner-only storage policies. `supabase/migrations/20261010190000_progress_photo_visibility.sql` adds `visibility` (`private` by default, or `community`) and lets other signed-in people read only the shared rows. `supabase/migrations/20261010270000_profile_sharing.sql` adds owner-only `profile_sharing` settings and `public_profile(user_id)`, which returns only the fields that person has switched on. Storage policies stay owner-only. Apply those on the live project; this repository does not connect to it. The signed-out “Need help now?” link reads helplines once the grant fix is in place, and falls back to the bundled list until then.

`tighten_grants` revokes default privileges in schema `public` from `public`, `anon`, and `authenticated` (and from `supabase_admin` when that role can be altered). A new public table therefore has no client privileges until a later migration grants them. Grant the columns the app actually writes. A table-level `UPDATE` left in place makes a later column grant additive, which is how `is_moderator` stayed writable.

## Auth redirect allow-list

Add these redirect URLs on the hosted project (Authentication → URL configuration → Redirect URLs). The app sends them exactly, with no extra query string. The reset email then appends the session in the fragment.

- `charioteer://set-password`
- `http://127.0.0.1:43127/set-password`
- `http://localhost:43127/set-password`

`charioteer://set-password` is the in-app “set a new password” screen on a device. The two http URLs are the same screen on the local web app. If the web app is opened on another origin, that origin plus `/set-password` has to be listed too, because the web reset uses `window.location.origin`.

Other redirects this app already sends:

- Sign in with Apple on the web sets `redirectTo` to `window.location.origin`, with no path. Locally that origin is `http://127.0.0.1:43127` or `http://localhost:43127`.
- Sign in with Apple outside the web (the shared OAuth helper, used on Android) sets `redirectTo` to exactly `charioteer://`.
- Sign in with Apple on iOS uses the native identity token and does not redirect.
- Email sign-up does not set `emailRedirectTo`. Confirmation uses the project Site URL. In `config.toml` that is `http://127.0.0.1:43127`.
- Forgot password calls `resetPasswordForEmail` with the set-password URLs above. The client uses the implicit flow, so the return link carries `access_token` and `refresh_token` in the fragment. The app opens `set-password` and saves the new password there.

An allow-list entry of exactly `charioteer://` does not cover `charioteer://set-password`. Add the path itself, or `charioteer://**`.

## Edge functions

```bash
supabase secrets set XAI_API_KEY=your-key
supabase functions serve
# or, for a hosted project:
supabase functions deploy thumos-chat thumos-voice-token thumos-voice-turn account-export account-delete progress-photo-url gratitude-reflect health-plan
```

| Function | Role |
| --- | --- |
| `thumos-chat` | Rebuilds context from the database, calls Grok, stores the user line and the reply with the service role. Refuses the call without coach consent. When the coach is allowed, the context may include up to five private gratitude lines (starred first, then recent). Missing key stores the offline message. |
| `thumos-voice-token` | Mints an ephemeral realtime client secret and returns the same Thumos instructions and recent history used for text, adapted for speech, including those gratitude lines only after coach consent. Missing key returns a graceful message. |
| `thumos-voice-turn` | Stores one spoken turn in `thumos_messages` and pins the fixed safety notice when the user’s transcript trips the detector. |
| `account-export` | Calls `export_my_data()` and adds a one-hour signed link for each private progress photo. The file does not contain the image bytes. |
| `account-delete` | Removes the caller’s objects in the private `progress-photos` bucket, deletes their `gratitude_entries` rows, then deletes the auth user. `delete_my_account()` is the fallback, and the app removes those objects before it uses the fallback. |
| `gratitude-reflect` | With coach consent, sends one diary line and its optional tag to xAI and returns a short comment plus two or three suggestions. It does not read check-ins, health, reasons, photos, or other diary lines. Missing key or a bad reply uses a local note and nothing is sent. |
| `health-plan` | With coach consent, reads this person’s own figures and asks Grok for a short nutrition, fitness, and wellbeing plan. A missing key, a safety hit, or a bad reply uses the local plan. The function does not store the row. Sharing, when switched on, shows only the headline, this week’s focus, and the tick count. |
| `progress-photo-url` | Signs a 60-second URL for a progress photo the caller is allowed to see: their own, or one whose `visibility` is `community`. A private photo belonging to someone else is not signed. |

The client tries the function first, then the SQL function, for export and deletion.

## iOS

HealthKit and the native Apple sign-in sheet need a development build, not Expo Go.

```bash
npx expo prebuild --platform ios
npx expo run:ios
```

Or use EAS: `eas build --profile development --platform ios`.

The bundle id is `uk.co.quanticalabs.charioteer`. `app.json` sets Sign in with Apple, the microphone string, the `react-native-audio-api` plugin, and the HealthKit plugin. The share string covers steps, sleep, resting heart rate, HRV, workouts, and weight. The update string says the app does not write to Apple Health; the capability still asks for it. `ios.entitlements` sets `com.apple.developer.healthkit`, and the plugin writes the same entitlement plus `NSHealthShareUsageDescription` at prebuild. Background delivery is off, because Charioteer only reads when someone asks it to. The Apple team is Quantica Labs Ltd, `5FMDXKAX7V`. `ios.config.usesNonExemptEncryption` is `false`. `expo.ios.buildNumber` is `"10"` for the next upload. Build 7 is the TestFlight build Ben reviewed. Echo control is the audio session: `playAndRecord` with mode `voiceChat`. Voice processing is not turned on in native code. A small patch, re-applied by `patch-package --error-on-fail` on `npm install`, wraps `AVAudioEngine` `prepare` and `startAndReturnError:` in `@try`/`@catch` and returns false, so a route change cannot kill the app. The same install applies the HealthKit route patch. If a patch does not apply, the install fails. On a Mac, remove a previously patched copy before installing, or the old `AudioEngine.mm` is reused and the new patch will not apply:

```bash
rm -rf node_modules/react-native-audio-api
npm install
```

TestFlight shows a voice debug line (the step reached, the microphone sample rate, and the last error) while `extra.voiceDiagnostics` is true. A voice failure stays on “The voice connection failed. Text chat is still available.”

The home-screen name is `Charioteer` (`expo.name` and `CFBundleDisplayName`). The App Store Connect listing name is `Charioteer Sober/Health Coach` (app id `6821371422`). The bundle id stays `uk.co.quanticalabs.charioteer`.

On a Mac with Xcode, enable the HealthKit and Sign in with Apple capabilities if prebuild has not already. Add the same bundle id in the Apple Developer portal, then turn on the Apple provider in Supabase.

`ios/` and `build/` are generated and gitignored. This project uses continuous native generation, so commit `app.json` and leave the Xcode project out of the repo.

## TestFlight from a Mac

Build 4 is the TestFlight archive from commit `054cf18`. Build 7 is the upload Ben reviewed. `expo.ios.buildNumber` is `"10"` for the next upload. From the repo on a Mac, signed into Xcode as Quantica Labs Ltd, set the build profile, then clear any patched audio package, install, confirm every patch is in `node_modules`, and prebuild. `npm run ship-check` fails the ship if any file in `patches/` is missing, including the HealthKit route patch. It does not apply the patch. It also exits 1 when `EXPO_PUBLIC_BUILD_PROFILE` is missing or unknown. Internal TestFlight for build 74 uses exactly `testflight`. Leave that variable exported in the same shell for ship-check, prebuild, and `xcodebuild archive`. Prebuild reads it in `app.config.ts` and writes `UIBackgroundModes`. The archive's bundle step inlines it into the JavaScript. `app.json` still lists `audio`. Without `testflight` set for prebuild, that entry is removed and speech stays off. A store archive is a fresh build with `EXPO_PUBLIC_BUILD_PROFILE=store` and a new build number. Do not upload the TestFlight archive to App Review.

```bash
export EXPO_PUBLIC_BUILD_PROFILE=testflight
rm -rf node_modules/react-native-audio-api
npm install
npm run ship-check
npx expo prebuild --platform ios
xcodebuild \
  -workspace ios/Charioteer.xcworkspace \
  -scheme Charioteer \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/Charioteer.xcarchive \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=5FMDXKAX7V \
  archive
```

Write `ExportOptions.plist` (it can live outside the repo) with `method` set to `app-store-connect`, `destination` set to `upload`, and `teamID` set to `5FMDXKAX7V`. Then upload:

```bash
xcodebuild \
  -exportArchive \
  -archivePath build/Charioteer.xcarchive \
  -exportPath build/export \
  -exportOptionsPlist ExportOptions.plist \
  -allowProvisioningUpdates
```

Keep the dSYM from the archive that was actually uploaded: `build/Charioteer.xcarchive/dSYMs`. A dSYM from an earlier archive will not symbolicate this build.

App Store Connect rejects a second upload that reuses a build number. Before each archive after this one, raise `expo.ios.buildNumber` in `app.json` (`"5"`, then `"6"`, and so on) and run prebuild again so the new value is in the generated project.

## Tests

```bash
npm test
npm run typecheck
```

Tests cover the sober counter, savings, milestones (including calendar months for 6 months and 1 year), the Thumos context builder, safety triggers (withdrawal and self-harm, and ordinary lines that must not fire), town validation, the urge timer, the voice session payload, PCM conversion, transcript assembly, and safety on a voice transcript. They do not open a microphone or a socket.

## Library verification

Checked on 10 October 2026 against the organisation or NHS page, unless the row says otherwise:

- Drinkline `0300 123 1110`, weekdays 9am–8pm, weekends 11am–4pm, on the NHS alcohol support page.
- Samaritans `116 123`, 24 hours, `https://www.samaritans.org/how-we-can-help/contact-samaritan/`.
- NHS 111 and `https://111.nhs.uk/`. Emergency `999`.
- Alcoholics Anonymous Great Britain `0800 917 7650` and `https://www.alcoholics-anonymous.org.uk/helpline/`.
- SMART Recovery UK `https://smartrecovery.org.uk/`.
- Club Soda `https://joinclubsoda.com/` and the mindful-drinker book page.
- Al-Anon UK & Eire `0800 0086 811`, 10am–10pm, `https://al-anonuk.org.uk/getting-help/helpline/`.
- NHS alcohol pages for risk, support, alcohol-use disorder, and the local support finder.

Flagged:

- Nacoa `0800 358 3456` is on the NHS page. The charity site was not opened, so the row has no URL (`partial`).
- NHS Live Well pages for sleep, exercise, eat well, and Every Mind Matters use their canonical addresses and were not re-opened (`partial`).
- Quit-lit titles other than *How to Be a Mindful Drinker* have title and author only. No shop link (`unverified`).

Cited figures Thumos may quote live in `supabase/functions/_shared/facts.ts` (NHS, ONS 2023 alcohol-specific deaths, WHO fact sheet of 28 June 2024). The model is told not to invent numbers. The 20–30 minute craving line is coaching guidance, not a cited statistic.

## Privacy

Health, check-ins, reasons, spend, and units are special category data. Each has its own consent. RLS keeps the private tables on the owning account. Other signed-in adults can see a directory card with your name and interests. Town, stage, days sober, chosen reason lines, money and unit totals, a mood streak, health headlines, chosen diary lines, chosen diary photos, vision captions, and progress photos you mark for the community stay hidden until you switch that item on. The first time you share sobriety or health information, the app asks you to confirm. `public_profile` returns only those shared fields, and nothing if Community is off or either person has blocked the other. Towns reject postcodes and any digit. Reports keep a name snapshot if the reported account is deleted. See `docs/privacy.md`.

Quantica Labs Ltd is named as the controller in the product copy. That sentence is not a completed privacy notice.
