# NATHAN.EXE — a playable portfolio

A retro-rendered 2.5D town (orthographic Three.js + pixel/dither pass). Visitors play Nathan's "save file": six chapters (Iron Yard → Winter Campus → Monsoon Campus → Garage → Signal Tower → Lighthouse), an optional Lake Park, collectible memories, NPC conversations and small story minigames. Recruiters can skip the game at any time.

**Status:** all districts are built: plaza, Iron Yard, Winter Campus, Monsoon Campus (TCE Madurai), the Garage, Signal Tower, City Park, Lake Park and the Lighthouse finale, connected by the Memory Line railway. What's left is **your real content** and, optionally, your own Blender models. See *What to provide* below.

**How to edit the map (Tiled), models (Blender) and story content: see [docs/WORKFLOW.md](docs/WORKFLOW.md).**

```
web/
├─ index.html          The game
├─ portfolio.html      Classic portfolio (fallback / "Skip game"), same content
├─ public/data/content.json   ← ALL text: profile, chapters, projects, skills, links, memories, NPC dialogue
├─ public/maps/town.tmj       ← the town layout (open in Tiled)
├─ public/uploads/     Images, PDFs and videos used by the site
└─ src/
   ├─ game/            main.js (loop, input, UI) · world.js (builds town from the map) · kit.js (placeable pieces)
   │                   tiled.js (map loader) · player.js (characters + animation) · nav.js (A*) · retro.js (pixel pass)
   │                   dialogue.js · minigame.js · save.js · portrait.js
   ├─ shared/content.js
   ├─ portfolio.js
   └─ styles/
legacy/web-openworld/  The previous third-person starter, kept for reference
tools/build-map.mjs    Generates the starter Tiled map (only re-run to reset the layout)
tools/build_world.py   Old Blender generator (for the legacy layout)
```

## Run on another PC

You need [Git](https://git-scm.com/) and [Node.js 20+](https://nodejs.org/) (LTS is fine).

```bash
git clone https://github.com/Nathan2933/nathan-exe.git
cd nathan-exe/web
npm install
npm run dev
```

- Game: http://localhost:5173/
- Portfolio: http://localhost:5173/portfolio.html

Production build to check before publishing: `npm run build` then `npm run preview`.

### Or run it with Docker

You only need [Docker Desktop](https://www.docker.com/products/docker-desktop/). From the repo root:

```bash
docker compose up --build
```

Open http://localhost:8080. This serves the production build with nginx (`Dockerfile`, `docker/nginx.conf`).

## Editing content

Site content lives in `web/public/data/content.json` and media in `web/public/uploads/`. Edit, commit and push; the host rebuilds and the live site updates.

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

1. Fill in real content in `web/public/data/content.json`, and add `web/public/resume.pdf`.
2. Replace placeholder districts and the character with Blender GLBs at the same anchor points (`ANCHORS` in `src/game/world.js`).
3. Ambient audio (off by default), PQC lattice mini-interaction, OG image.

## What to provide

Everything below lives in `web/public/data/content.json` unless noted:

- **Profile**: name, role, summary, about paragraphs, photo, resume PDF (put `resume.pdf` in `web/public/`).
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
