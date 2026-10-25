# Share a photo with buddies

Plan and SQL only. The app does not have this screen yet. The migration is in the repo and has been applied on the test database only. It has not been applied to the live project, and nothing is shipped.

This comes after the build 66 items. It is not a small change, so it is its own binary. The parent branch already uses iOS build number 67 for the calendar module. Get Outside was also described as build 67 on another branch. When this is built, use the next free TestFlight number if 67 is already taken. This plan does not change `app.json`.

## Where it sits

One card at the top of People, on the Buddies list, under “People you've buddied up with” and above the first person. One outlined button, **Share a photo**. The outline and the label use the readable green (`#2DE0A0` in the dark theme, `#047857` in the light theme). The card edge stays the pale mint. Build 66’s Profile button stays on each person, under Message. This card does not replace it.

The composer opens in that card:

- **Take photo** and **Choose photo**, the same two actions as Gratitude.
- Then the existing zoom and drag crop (`PhotoCropper`). Gratitude’s picker re-encodes a JPEG and strips the camera data, and it does not crop. The crop step is the one profile pictures already use. Both are already in the app. No third picker.
- A caption of at most 140 characters. The same limit as a photo caption elsewhere. Empty is allowed for the send.
- A tick, **Also add to my Gratitude list**, off by default.
- **Choose buddies**. Until that is opened, every accepted buddy is selected.
- **Send**.

The first time it opens, and again above Send, the card says: “Only the buddies you choose can see this. Not the Community.” Under that, always: “Someone you send it to can still show it to another person. A screenshot cannot be stopped.” There is no download button. Help and the crisis lines stay where they are, in the menu.

VoiceOver: the button’s name is Share a photo. The picture’s name is the caption. With no caption, it is “Photo from {name}”.

The words for the gratitude tick live in a new component, not in `people.tsx`. That screen is tested to contain no mention of the diary.

## Feed, not a chat message

Chat today is one text body on `direct_messages`, between 1 and 2,000 characters, tied to one connection. There is no picture column. Unread counts and notifications follow each message.

Sending the photo as a chat message would write one message per buddy, raise an unread and a notification for each, and make delete a search across those copies. A link pasted into the text would be either a public address or a signed link that dies inside the thread. The private bucket does not fit that.

The photo is its own row, with one recipient row per buddy. Delete removes that row and the file for everyone. Hide marks one recipient. The list of photos sits on the same Buddies card: photos you sent, and photos sent to you that you have not hidden. Chat stays a written conversation.

## Who can be chosen

The phone starts with every accepted buddy ticked. Choose buddies is a list of those people, one checkbox each. The server does not trust that list. For each id it keeps the person only when all of these are true:

- There is one accepted connection between the two accounts. Accepting is mutual. There is not a second row the other way.
- Both accounts have confirmed they are 18 (`buddy_is_adult`).
- Neither has blocked the other (`buddy_pair_blocked`).

Anyone who fails is left out. If nobody remains, Send fails with “Choose a buddy who is still connected.” An empty list is never treated as “everyone on the project”.

## The file

The crop is re-encoded as a JPEG. The longest side is at most 1,600 pixels, quality 0.8, and the file must be under 2 MB. That matches a progress photo. Re-encoding drops the EXIF and XMP block, which is where location and camera details live (`stripJpegLocation`). The bucket also accepts JPEG only, and refuses anything over 2 MB.

Order of a send:

1. `create_buddy_photo` writes the row and the recipient rows. The photo is not visible yet.
2. The phone uploads `buddy-photos/{owner}/{id}.jpg`.
3. `publish_buddy_photo` checks the file is there, then lets the chosen buddies see it.

A buddy opens the file with a signed link that lasts 15 minutes. The app asks for a new link when the card is opened. The bucket is private. There is no public URL. A link that was already handed out keeps working until those 15 minutes end, including after a delete or a hide.

## Gratitude tick

Off unless the person turns it on. Turning it on needs a caption, because a diary line cannot be empty (“Write a line first.”). After the buddy photo is published, the app saves a diary line and a diary photo through the calls Gratitude already uses, with the same JPEG. That is a second private file in the diary bucket. Deleting the buddy photo leaves the diary line. Deleting the diary line leaves the buddy photo.

The confirmation is the existing green tick, the haptic, and the count line (“You have recorded N things to be grateful for so far”). If the diary save fails, the buddy photo still stands, and the card says the list could not be updated.

## Delete, hide, report

- The sender’s **Delete** removes the stored file, then `delete_buddy_photo` removes the row. Recipients lose it. If the file cannot be removed, the row stays so Delete can be tried again.
- A buddy’s **Hide** sets `hidden_at` on their recipient row only.
- A buddy’s **Report** asks for a reason and writes the existing moderation queue, with `reports.buddy_photo_id`. A direct insert that sets that column is rejected. The report remains if the photo is later deleted.

## Data and access

SQL: `supabase/migrations/20261025120000_buddy_photos.sql`.

| Piece | Role |
| --- | --- |
| `buddy_photos` | Owner, caption, path, `published_at`. Path must be `{owner}/{id}.jpg`. |
| `buddy_photo_recipients` | One row per chosen buddy. `hidden_at` when they hide it. |
| `create_buddy_photo` | 18+, caption length, rate limit, filters the ids, inserts both tables. |
| `publish_buddy_photo` | Owner only, and only after the file is in the bucket. |
| `delete_buddy_photo` | Owner only. Recipients go with the row. |
| `hide_buddy_photo` | That recipient only. |
| `report_buddy_photo` | A current recipient, a reason, the moderation queue. |
| `buddy_photo_feed` | Photos you sent, and published photos sent to you that you have not hidden. A recipient does not receive the list of the other recipients. |
| `can_read_buddy_photo` | The storage read rule. Owner, or a chosen buddy who has not hidden it, both adults, no block, connection still accepted, and the photo published. |

Row level security is on. `public`, `anon`, and `authenticated` have no table grant. The functions are the only read and write. They run as security definer and check `auth.uid()`.

The bucket `buddy-photos` is private, JPEG only, 2 MB. Insert and delete are the owner’s folder only. Select is `can_read_buddy_photo`. There is no public read policy.

Rate limit, inside `create_buddy_photo`: 20 photos in a day, 6 in 10 minutes, at most 30 people on one photo.

This migration does not change `export_my_data` or the account-delete function. When the app change is approved, account deletion removes the `buddy-photos` folder the same way it already removes the diary folder (a missing bucket is already treated as success), and the owner’s export gains the photos they sent.

## Privacy draft

`docs/privacy.md` has a section marked draft, not live. Short version for the DPIA:

- Personal data: the image and the caption. A caption about health or sobriety is special-category data, because the person wrote it.
- Audience: the accepted buddies ticked on that send. Not the Community. Not a public URL.
- Purpose: the person chose to show those buddies a picture.
- Retention: until the sender deletes that photo, or deletes the account. Hide does not delete the file. A report outlives the photo. A signed link can linger for about 15 minutes.
- The diary tick is a separate private copy, with the diary’s own retention.
- Not used for advertising. Screenshots and a buddy showing the picture onward cannot be prevented, and the screen says so.
- This note is not a solicitor’s DPIA.

## Camera and library

No new permission. The app already asks for the camera and the photo library, for a progress photo. Those same prompts are reused. No save-to-library permission, no background access, and no new Android permission. The image-picker plugin already carries the camera and library lines.

The current purpose sentence says the photo is private and that other people cannot see it. That stays true for a progress photo and a diary photo. It would be false for a photo sent to a buddy. When this is built, those existing sentences are rewritten so they still cover a private photo and also say a photo you send is shown to the buddies you pick. Same two permissions. That wording change is why the binary number moves.

## Effort, once approved

- The SQL is already in the repo. Applying it to the live project is a separate approval.
- The composer and the feed, in a component people.tsx only mounts.
- Upload, sign for 15 minutes, delete, hide, report.
- The diary tick through the existing diary calls.
- The account-delete folder sweep, and the owner’s export.
- The purpose-string rewrite. No new native module beyond what the image picker already is.
- Tests: the server drops a blocked person, a child account, and someone who is not accepted; a recipient cannot see another recipient list; the storage bucket is private; people.tsx still has no diary word; the tick starts off; delete is owner-only.

## Risks

- A signed link lasts about 15 minutes after delete or hide.
- A screenshot, or a buddy showing the picture to someone else, cannot be stopped. The screen says so and does not promise otherwise.
- The purpose-string edit needs a new binary. Build number 67 may already be taken.
- The diary tick stores a second file. The two deletes are independent.
- `people.tsx` must not grow a diary word, or several existing tests fail.

## What this change does not do

The screen, the upload, and the tests for the screen are not built. The live database and the live storage bucket are unchanged. Nothing is shipped.
