# NATHAN.EXE — a playable portfolio

A retro-rendered 2.5D town (orthographic Three.js + pixel/dither pass). Visitors play Nathan's "save file": six chapters (Iron Yard → Winter Campus → Monsoon Campus → Garage → Signal Tower → Lighthouse), an optional Lake Park, collectible memories, NPC conversations and small story minigames. Recruiters can skip the game at any time.

**Status:** all districts are built: plaza, Iron Yard, Winter Campus, Monsoon Campus (TCE Madurai), the Garage, Signal Tower, City Park, Lake Park and the Lighthouse finale, connected by the Memory Line railway. What's left is **your real content** (admin page) and, optionally, your own Blender models. See *What to provide* below.

**How to edit the map (Tiled), models (Blender) and story (admin): see [docs/WORKFLOW.md](docs/WORKFLOW.md).**

```
web/
├─ index.html          The game
├─ portfolio.html      Classic portfolio (fallback / "Skip game"), same content
├─ admin.html          Content editor (local dev only, not deployed)
├─ public/data/content.json   ← ALL text: profile, chapters, projects, skills, links, memories, NPC dialogue
├─ public/maps/town.tmj       ← the town layout (open in Tiled)
├─ public/uploads/     Images/PDFs uploaded from the admin
└─ src/
   ├─ game/            main.js (loop, input, UI) · world.js (builds town from the map) · kit.js (placeable pieces)
   │                   tiled.js (map loader) · player.js (characters + animation) · nav.js (A*) · retro.js (pixel pass)
   │                   dialogue.js · minigame.js · save.js · portrait.js
   ├─ shared/content.js
   ├─ portfolio.js · admin.js
   └─ styles/
legacy/web-openworld/  The previous third-person starter, kept for reference
tools/build-map.mjs    Generates the starter Tiled map (only re-run to reset the layout)
tools/build_world.py   Old Blender generator (for the legacy layout)
```

## Run

```bash
cd web
npm install
npm run dev
```

- Game: http://localhost:5173/
- Portfolio: http://localhost:5173/portfolio.html
- **Admin: http://localhost:5173/admin.html**

## Editing content (admin)

Open `/admin.html` while `npm run dev` is running on your computer. Edit profile/about, chapters, projects, skills, experience, achievements and links, then **Save** (or Ctrl+S). That writes `web/public/data/content.json`; the last 30 versions are backed up in `web/content-backups/`. Upload buttons store images/PDFs in `web/public/uploads/`.

To publish, commit and push. Your host rebuilds and the live site updates.

Security model: saving only works from `localhost` in dev mode, and `admin.html` is excluded from the production build, so there's no admin login on the public site to attack.

## Controls

| | Desktop | Mobile |
|---|---|---|
| Walk / run | WASD or click (Shift = run) | Tap |
| Jump | Space | — |
| Interact / talk / next line | E (or click the ◆) | Tap the ◆ or the prompt |
| Full map | M (or the M button on the minimap) | M button |
| Day / night / auto (local time) | N or the ◐ Look button | ◐ Look button |
| Controls help | H or the ? button | ? button |
| Close a window | Esc | ✕ |
| Zoom | Scroll | Pinch |

Hazards: walking into the lake or off the island, or standing in front of a moving Memory Line train, knocks Nathan out and respawns him (last dry spot / nearest station). Click-to-walk routes always avoid them.

## Deploy

Build command `npm run build`, base directory `web`, output `dist`. Works on Cloudflare Pages, Netlify or Vercel. For GitHub Pages set `VITE_BASE=/repo-name/`.

## Next steps

1. Fill in real content through the admin, and add `web/public/resume.pdf`.
2. Replace placeholder districts and the character with Blender GLBs at the same anchor points (`ANCHORS` in `src/game/world.js`).
3. Ambient audio (off by default), PQC lattice mini-interaction, OG image.

## What to provide

Everything below is entered in the admin page (`npm run dev`, then `/admin.html`) unless noted:

- **Profile**: name, role, summary, about paragraphs, photo, resume PDF (upload in the admin, or put `resume.pdf` in `web/public/`).
- **Contact links**: real email, GitHub, LinkedIn.
- **Projects** (up to 6 appear as benches in the Garage): title, pitch, description, stack, links, screenshot.
- **Skills** (Garage pegboard), **Experience** (Signal Tower radio log), **Achievements** (trophy case).
- **Chapters**: the story for each district, including the Lighthouse ending text.
- **Memories** (20) and **NPC dialogue** (coach, classmate, batchmate, guide): replace every placeholder with real details.
- **TCE logo**: save as `web/public/assets/logos/tce.png`.
- Optional: Blender models (see docs/WORKFLOW.md).

## Deploy

The repo includes `netlify.toml`, so on **Netlify** you can just connect the repository and deploy. On **Vercel**: set the root directory to `web` (framework preset Vite). On **Cloudflare Pages**: build command `npm run build`, root `web`, output `dist`. After you have a domain, change the `og:image` meta tags in `web/index.html` and `web/portfolio.html` to the full URL (for example `https://yourdomain/uploads/og-image.png`) so link previews work everywhere.

## Extras

- **Look** (save card, bottom left): Bright or Pastel palette, Smooth or Pixel rendering, sound on or off. Choices are remembered per browser.
- `?debug` shows FPS and draw calls; test on a phone at `http://<your-PC-IP>:5173/?debug` while `npm run dev` runs.
