# Island 02: Tahiti (prototype)

Tahiti is a separate playable island. You reach it by talking to Harris at the
Island 01 airport ("Fly to Tahiti"), and you leave the same way from the Tahiti
airstrip ("Fly back to Island 01").

## What is in the prototype

| Piece | Where |
|---|---|
| Island map (airstrip SW, hideout NW, villa E, small centre) | `tools/build-tahiti.mjs` → `web/public/maps/tahiti.tmj` |
| Hideout house + bedroom cutaway (from the bedroom photo) | `hideout_house` in `web/src/game/kit.js` |
| Outlaws' Villa + balcony deck, stairs, railings | `outlaws_villa` in `kit.js` |
| Flight cinematic, island switching, group scenes | `web/src/game/main.js` (search "Islands", "Flight cinematic", "Group conversations") |
| Characters, dialogue, group scripts, Harris's Tahiti lines | `web/public/data/tahiti.json` |
| Ocean ambience + Tahiti music | `web/src/game/audio.js` (`setOcean`, `tahiti` theme) |

Rebuild the Tahiti map after editing the builder: `node tools/build-tahiti.mjs`.

## Placeholders

Everything in `tahiti.json` is placeholder content: names show as roles
("Gang member · Developer", "Outlaw · College friend"), and every line is a
generic stand-in marked "(Placeholder)". This is deliberate. Until private
access is switched on, `tahiti.json` is a public file, so it must not contain
real names, stories, photos or videos.

Slot guide (who goes where once real content is allowed):

| id | spot | intended person |
|---|---|---|
| `tahiti_sf1` | sitting on the bed | school friend |
| `tahiti_sf2` | by the wardrobe | school friend |
| `tahiti_sf3` | leaning on the west wall | school friend |
| `tahiti_sf4` | at the small table | school friend |
| `tahiti_cf1` | at the balcony railing; Nathan is placed beside this friend in "Join the Outlaws" | college friend |
| `tahiti_cf2`…`cf6` | table, railing, loungers | college friends |
| `tahiti_cf7` | moves around the deck; brown skin, beard, sleeved shirt | college friend |

Harris is one character on both islands (same `harris` id); on Tahiti his
dialogue comes from `overrides.harris` in `tahiti.json`.

## Private access: what is still needed

The site is static on Netlify, so there is no server yet. The game already
asks `/.netlify/functions/tahiti-session` before flying:

* `401` / `403` → the visitor stays on Island 01 with an access message.
* `{ "allowed": true }` → the flight starts.
* anything else (no function deployed yet) → **prototype mode**: the flight
  starts and a toast says private access is not switched on.

To make Tahiti truly private:

1. **Netlify Functions** (`netlify/functions/`):
   * `tahiti-login`: takes a personal invite code, checks it against the
     allowlist, and sets a signed, `HttpOnly`, `Secure`, `SameSite=Lax` session
     cookie (signed with a secret in a Netlify environment variable).
   * `tahiti-session`: verifies the cookie and returns `{ allowed }`.
   * `tahiti-data`: returns the real `tahiti.json` (names, dialogue, media
     links) only for a valid session.
   * `tahiti-media`: streams private photos and videos for a valid session.
2. **Allowlist and media** in Netlify Blobs (not in the repository): one
   entry per friend (code hash, name, active flag) plus the media files.
3. **Admin**: an "Access" tab that lists members and approves or revokes
   them by calling an admin-only function (protected by a separate admin
   secret).
4. **Client**: load Tahiti content from `tahiti-data` instead of
   `/data/tahiti.json`, show an invite-code prompt when `tahiti-session`
   says no, then delete the public placeholder file.

Nothing secret should ever be in the frontend code or the public `data/`
folder.
