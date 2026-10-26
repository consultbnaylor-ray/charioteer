# Photo library — design only

This is a design sheet. It is not built. It does not change a permission, a purpose sentence, `Info.plist`, or `app.json`. It does not apply a database change. Build 73 still has the public gallery: no storage cap, six photos on the profile front, and **See all photos**.

Ben asked for an overall photo library where a person can add, delete, and organise photos into folders, and for those folders to show on the iPhone as albums. **Charioteer: Gratitude** was an example of a name, not the list of folders.

## Folders do not change who can see a photo

A folder is a label for the owner. It is not a share switch.

Sharing stays on the photo, and it stays off until the person uses the control that already exists:

- Buddies: the people ticked on the quick-share sheet.
- Public profile: **Also show on my public profile**, and only while Community is on.
- Gratitude: **Also save to my Gratitude diary**, and the existing choice to include that photo on the public profile.
- Meals, the vision board, and progress photos: the switches those screens already have.

Putting a photo in a folder called Public profile does not publish it. Taking it out of that folder does not hide it. Default for a new photo is private: only the owner, on their account.

## Folders

The library opens on **All photos**. Suggested folders, which the person can rename or remove, and they can add their own:

- Gratitude
- Buddies
- Public profile
- Meals
- Vision board
- Progress

A custom name is short plain text, at most 40 characters, the same length as a custom interest.

One photo can sit in more than one folder. The file is stored once. **All photos** is not a folder. It is every photo on the account.

## What the screens do

The library is one screen, **Photo library**.

- Folders sit in a row. All photos is first. A folder with nothing in it still appears, so it can be filled.
- Photos are a grid. A narrow phone (320 points) shows two columns. A wider phone (390) shows three. Further photos use **Load more**. The public gallery already works this way.
- A tap opens the photo large, with the caption, the folders it is in, and one line on who can see it: “Only you”, “Buddies you chose”, “On your public profile”, or “In Gratitude”. More than one of those can be true.
- **Select** turns on multi-select. The actions are **Move to folder**, **Remove from this folder**, and **Delete**. Remove from a folder does not delete the photo and does not change who can see it.
- **Add photo** is Take photo or Choose photo, then an optional folder. Sharing stays off. The person uses the existing send, public-profile, or Gratitude controls when they want someone else to see it.

Edit profile still manages the public gallery (caption, order, remove). The library does not replace that.

## Phone albums

The album name is `Charioteer: <Folder name>`. Gratitude would be `Charioteer: Gratitude`. A custom folder “Coast” would be `Charioteer: Coast`.

This is not built. The question for Ben is below: create those albums for every folder, or only for a folder the person opts in to.

## What iOS lets the app do

Checked against the installed `expo-media-library` (the iOS module in this repo), not from memory of an older SDK.

Today, **Save to Photos** uses add-only access. `saveToLibraryAsync` needs `NSPhotoLibraryAddUsageDescription` and does not read the library. The purpose sentence says the app adds a photo and does not create a named album, because it never reads other photos. That sentence matches the code.

`createAlbumAsync` and `addAssetsToAlbumAsync` in this SDK do not use that add-only path. They call `runIfAllPermissionsWereGranted`, which uses `MediaLibraryPermissionRequester`. That requester asks for `PHAccessLevel.readWrite`, and the call is refused unless access is “all”. Limited access is refused. Add-only is refused.

So a named album needs the full photo-library permission, not the permission Save uses today.

- An album can be created with `createAlbumAsync`.
- A photo the app has just saved can be put in that album with `addAssetsToAlbumAsync`, after the full permission.
- A photo that is already in Photos, and that this app did not save, can be added only when the app is allowed to read it. That is the same full permission. The person picks it. The app should not scan the library.
- Deleting the phone’s copy uses the Photos delete call. iOS then shows its own confirmation. The app cannot remove the phone copy quietly. Removing it from the album only, and leaving it in Recents, is a different call, and that call needs the full permission too.

Recommendation, until Ben says otherwise: delete in Charioteer removes the Charioteer file and the shares. The phone album is left as it is. A separate control, off by default, can ask iOS to delete the phone copy, and iOS asks the person to confirm.

## Purpose sentences — Ben’s OK before any build

Nothing in `app.json` or the plist changes for this sheet.

The current read sentence says the library is used to add a private progress photo or to choose a photo to send to buddies, and that a sent photo is not shown to the Community. The current add sentence says a named Charioteer album is not created.

Both become wrong if the app creates `Charioteer: <Folder name>` albums, or if it reads photos that are already on the phone in order to file them. New sentences would have to say that, in plain words, including that an album is created only if the person asks, if that is the choice. They are not written here. They need Ben’s OK before they are put in the app.

## Storage and signed links

Keep each file where it already lives: `profile-photos`, `gratitude-photos`, `buddy-photos`, progress, vision, and meal buckets. The library is an index. It does not copy the bytes into a new bucket.

Show a photo the same way the public-profile fix does. Keep the storage path. Sign the private bucket. Pass the signed link through to the screen. Do not drop the path and then draw “Photo unavailable”. Owner links last about an hour and are signed again. Another member’s profile photo still uses the short link from `profile-photo-url`. A buddy photo keeps its short link. No bucket becomes public.

Location in the photo file is stripped before upload, as it is today (`stripJpegLocation`). A copy saved into a phone album is that same JPEG, after the strip, so the album copy does not get a location block either. The app does not read or store EXIF location.

Size stays as it is for a progress photo: JPEG, longest side 1,600 pixels, quality 0.8, under 2 MB.

## Privacy

A photo and its caption are personal data. A caption, a progress photo, or a meal photo can be about health or sobriety, so it can be special category data. It is not used for advertising. Who can see it is the per-photo share, not the folder.

`export_my_data` must include the folder names and every photo’s storage path. Account deletion must delete the folder rows and the files. The existing delete already removes the profile, gratitude, progress, vision, meal, and buddy photo folders it knows about. A new library table has to be on that same delete.

There is an open gap that is not caused by this library: a saved route is not yet in the owner’s export (`docs/dpia-location.md`). The library export must not repeat that gap. The route gap should be closed in the same reviewed export change, or listed beside it so it is not forgotten. This sheet does not apply either change.

## Offline, and what it costs

A new photo can sit on the phone, marked “Not on your account yet”, and upload when the phone is online. A folder change is a small row and can wait the same way. Until the upload finishes, another person cannot see the photo, even if a share is ticked. The screen says that.

Signed links expire. The grid signs the photos on screen, then the next page when the person taps **Load more**. It does not sign the whole library at once. The public gallery already does this for the owner.

Cost is one file per photo. A photo in three folders is still one file. The public gallery has no count cap. This library does not add a cap either. There is no ceiling number in this design.

## Migration, not applied

When Ben approves a build, the database change would be:

1. `photo_folders`: id, user id, name, position. The owner can read and write only their own rows.
2. `photo_folder_items`: folder id, source (`gratitude`, `buddy`, `profile`, `meal`, `vision`, `progress`, or `library`), source id, position. One photo can have several rows.
3. For every photo that already exists, insert a folder item that points at it. Do not move the file. Do not delete the old row. A failed migration must leave the old photos where they are.
4. Seed the suggested folders for an account that already has a photo. Leave them empty of items until step 3 files the existing photos into the matching folder (a gratitude photo into Gratitude, a profile gallery photo into Public profile, and so on). A photo that is also shared with a buddy gets a second item in Buddies. That second item does not change the buddy share.
5. `export_my_data` returns the folders and the items. Account deletion deletes them with the profile. The route-export gap is called out in that same change.

`public_profile` stays as it is. The six photos on the profile front remain a display slice in the app, not a storage limit.

Do not apply this migration from this sheet.

## Questions for Ben

1. Should a phone album be created only when the person opts in for that folder, or for every folder as soon as it exists? This sheet recommends opt-in, off to start, because an album needs the full photo-library permission.
2. When they delete a photo in Charioteer, should the copy in the phone album stay, or should the app also ask iOS to delete it? This sheet recommends leaving the phone copy, with a separate confirm that iOS will ask about again.
3. May one photo sit in several folders? This sheet says yes. The file is stored once. Sharing is still per photo.
4. Are Gratitude, Buddies, Public profile, Meals, Vision board, and Progress the right folders to start with, and may the person rename them?
5. Will you approve new purpose sentences before any build that creates albums? The current sentences say a named album is not created, and they do not mention folders.
6. Should the saved-route export gap be closed in the same export change as this library?
