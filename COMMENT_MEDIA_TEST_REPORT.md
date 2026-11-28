# Comment photos and stickers: investigation and test report (Phase A)

2026-11-28 · branch `comment-reliability`

## Status

| Status | Item |
| --- | --- |
| COMPLETE AND VERIFIED (data) | Where the pipeline fails: before any network request, on the phone |
| IMPLEMENTED BUT NOT FULLY VERIFIED | A separate error and message for on-phone preparation failures |
| BLOCKED | Reproducing the failure and the end-to-end tests: need a real iPhone with a build that has `expo-paste-input` (Xcode isn't installed on this Mac, and the Simulator has no personal stickers) |

## What production shows (read-only)

- `comment_uploads`: **0 rows ever**. Comments with media: **0**.
- Storage logs, 7 days: **0** requests touching the `comment-media` bucket.
- Gateway logs, 7 days: **0** calls to the `comment-media` Edge Function and no 4xx/5xx from
  it. Build 16 (1.1.0, which has the feature) made about 6,700 requests in that time.
- `comment-media` is deployed and active (v1, JWT verification on).
- No comment body contains U+FFFC (the placeholder iOS inserts when a text field drops a
  sticker), so stickers aren't being silently pasted into the text either.
- PROGRESS.md (2026-10-29) records that sticker insertion, photo picking, the viewer and the
  upload were **never verified on a device**.

**Conclusion:** no media comment has ever reached the server. Either nobody has tried it on
build 16 in the last 7 days, or attempts fail on the phone before the upload request is made.
The server path (Edge Function → Storage → `comment_uploads` → comment insert) has never run
in production.

## The pipeline, step by step

| Step | Where | Verified |
| --- | --- | --- |
| Pick photo (PHPicker) | `CommentComposer.choosePhoto` | unit-tested UI only |
| Keyboard sticker | `StickerAwareInput` (expo-paste-input, iOS) | no (device needed) |
| Paste from clipboard | `media.imageFromClipboard` | no (device needed) |
| Preview / remove / replace | `CommentComposer` | unit tests |
| Resize + re-encode (JPEG photo, PNG sticker) | `media.prepareMedia` (expo-image-manipulator) | **no: prime suspect, it is the last step before the network** |
| Upload | `comment-media` Edge Function | no traffic ever |
| Byte checks (JPEG/PNG/WebP signatures, sizes, per-hour cap) | `_shared/imageInfo.ts` | DB/unit tests |
| Link to comment | `comments.media_upload_id` trigger | PGlite tests |
| Render | `CommentMediaView` | unit tests |

## Changes in this branch

- `MediaPrepareError`: if resizing or re-encoding fails on the phone, the comment shows
  "Couldn't get that picture ready to send. Try another one. Your comment is still here."
  instead of the generic error, and logs the stage, kind and cause (`console.warn`) for a
  device bug report.
- A 401 from the media function now says the session expired, instead of a generic failure.

## Device test plan (needs you and a dev or TestFlight build)

Use a second, non-customer account for cross-account checks.

1. Choose Photo → preview → send: text + photo, then photo only.
2. Keyboard sticker (personal sticker, then Memoji/Genmoji) → preview → send.
3. Copy a sticker → Paste Sticker or Image → send.
4. Reply with a sticker.
5. Remove and replace before sending.
6. Airplane mode mid-send → error, draft kept → retry → posted once.
7. Kill and reopen the app, open from the second account: media still shows.

For any failure, note the toast text and the step. `Couldn't get that picture ready…` means
on-phone preparation. Anything else will now show up in the server logs, which can be
checked read-only.

## Not changed

Storage policies, bucket privacy, RLS, the Edge Function and the upload limits are
unchanged. The audit found no weakness in them, and no request ever reached them.
