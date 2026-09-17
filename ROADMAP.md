# Director roadmap

Ideas captured for later. Built so far: library drawer, reel names, delete
(immediate bucket removal, soft-deleted records), take history, scene layouts and
Play reel. Everything below is not built.

## Library and reels

- **Duplicate scene** — copy a scene's brief, board and continuity to try a
  variation without re-planning.
- **Export reel** — join each scene's chosen take into one downloadable MP4 in the
  bucket (ffmpeg is already in the image). Stream copy when takes share a format,
  re-encode otherwise; needs a re-export when takes change.
- **Reorder scenes** within a reel.
- **Trash with restore** — keep deleted videos for a grace period before purging.
  Today deletes purge the bucket immediately, by decision.
- **Search** reels and scenes.

## Continuity

- **Cast photos** — upload photos of characters, wardrobe, props or locations once
  per reel and send them as `reference_images` on every roll. The xAI docs
  disagree on the limit (3 or 7 per request); confirm when building.
- **Extend take** — continue the actual video with `POST /v1/videos/extensions`
  (adds 2–10 s to a 2–15 s take) for seamless continuations.
- **Voice lock** — give each character a preset voice via `reference_audios`.
- **Refresh from previous scene** — a continued scene snapshots the previous scene's
  characters, palette and ending once; re-planning the earlier scene doesn't update it.
- **Chain per-shot rolls** — start shot N from shot N−1's last frame; today only
  shot 1 opens on the previous scene's frame.

## Platform

- **Per-visitor rate limiting** — Better Auth can't read client IPs behind
  Railway, so sign-in shares one limit for everyone. Configure
  `advanced.ipAddress` with a header Railway sets.
- **Model upgrade** — `grok-4.6` is available on the account; planning uses
  `grok-4.5`.
- **Missing app icons** — `/__grok/icon-180.png` and friends 404 (Grok template
  leftovers).
- **Toasts on phones** render partly off-screen.
