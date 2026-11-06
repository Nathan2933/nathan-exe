# NATHAN.EXE — editing the town, models and story

Three tools, three jobs:

| What you change | Tool | File(s) |
|---|---|---|
| Text: chapters, projects, memories, NPC dialogue | **Admin page** (`npm run dev` → `/admin.html`) | `web/public/data/content.json` |
| Layout: roads, lots, where things stand, NPCs, memories, colliders | **Tiled** (free, mapeditor.org) | `web/public/maps/town.tmj` |
| Looks: a building, prop or character model | **Blender** → `.glb` | `web/public/assets/kit/<piece>.glb` |

The game reads all three at load time. Save the file, refresh the browser.

---

## 1. Map editing in Tiled

Open `web/public/maps/town.tmj` in Tiled (1.10+). **1 tile = 1 metre**; the map is 96 × 96 m with the plaza at the centre.

### Layers

| Layer | Type | What goes in it |
|---|---|---|
| `ground` | tiles | Ground material. Paint with the `ground` tileset: grass, road, road_line (dashed centre line), sidewalk (raised kerb), plaza, rubber, concrete, snow, path, **water (blocks walking)**, sand, flowerbed (blocks walking), lawn, terracotta, boardwalk. |
| `objects` | objects | **Point** objects place kit pieces. Set the object's *Class* (Tiled 1.9+) or *Type* to the piece name, e.g. `lamp`, `bench`, `tree_round`, `gym_building`. **Rectangle** objects with class `hedge` draw a hedge run of that size. |
| `interact` | objects | Points with class `chapter`, `memory`, `npc`, `minigame`, `project`, `about` (see below). |
| `collision` | objects | Extra rectangles / ellipses that block movement (kit pieces already add their own). |
| `labels` | objects | Points: floating district names. Properties `text`, `color`, `height`. |
| `paths` | objects | **Polylines** that ambient townsfolk walk back and forth. Property `outfit` = `teal` / `saffron` / `pink`; `loop` = true to walk in a circle. |
| `spawn` | objects | One point: where a new player starts. |
| `rail` | objects | One **closed polygon**: the Memory Line track. The game lays the track bed, sleepers and rails along it (and a wooden bridge where it crosses water), and the train loops it. |

### Custom properties

- On `objects` points: `rot` (degrees, clockwise as seen in Tiled), `scale` (trees), and piece-specific ones such as `text` / `color` on `lot_sign`, or `w`, `d`, `h`, `color`, `title` on `district_placeholder`. Rotating the object in Tiled also works.
- On `interact` points:
  - `chapter` → `id`, `district` (iron-yard, winter-campus, monsoon-campus, garage, signal-tower, lighthouse, lake-park)
  - `memory` → `id` (must match a memory ID in the admin)
  - `npc` → `id` (matches an NPC ID in the admin), `rot` (which way they face; 0 = towards the camera)
  - `minigame` → `id` = `lift`
  - `project` → `index` (0 = first project in the admin)
  - `station` → `id`, `district`, `name` (a Memory Line stop; place it on a `station` platform next to the rail)

### Kit pieces available

`lamp bench (snow) planter bin notice_board (text) lot_sign hedge tree_round tree_blossom tree_pine tree_palm birch snow_pile crt_monument fountain gym_building squat_rack pullup_rig plyo_boxes tyre kettlebell_rack weight_bench water_fountain chalk_board bike_rack faculty_building (text) station (name) college_building (text) gate_arch (text) banyan tea_stall cycle_stand puddle project_bench district_placeholder`

A **rectangle** with type `rain_zone` on the `objects` layer makes monsoon showers pass over that area on a cycle (the sky greys while you stand in it).

Pieces can also declare walkable **floors** (e.g. station platforms), so Nathan steps up onto them.

An unknown name shows up as a magenta cube in game (and a console warning), so typos are obvious.

### Layout rules we're following

- Avenues and ring road stay clear; furniture sits on sidewalks or inside lots.
- Each lot: hedge border with **one gate** facing the street, one main building, 2–4 props that tell its story, trees in rows along the hedge.
- Leave a 2 m walkway around anything interactive.
- Walking budget: anything important within ~40 m of the plaza (≈ 5–8 s of walking).

### Resetting the layout

`node tools/build-map.mjs --force` regenerates the starter map from code (a timestamped backup of your current `town.tmj` is kept). Only do this if you want to start over. Normally, edit in Tiled.

---

## 2. Models in Blender

Every kit piece is code-built today. To replace one with your own model:

1. Model it in Blender's default orientation (Z up) with the **front facing −Y** (the exporter turns that into the game's +Z, towards the camera). Put the origin at the centre of its footprint on the ground, and work in real-world metres.
2. Keep it low-poly and flat-shaded. Prefer **vertex colours or a small palette texture** (one 64×64 PNG shared across pieces) over unique textures.
3. Export **glTF Binary (.glb)**: Include → Selected Objects; Transform → +Y Up; Mesh → Apply Modifiers; Compression → Draco on.
4. Save as `web/public/assets/kit/<piece-name>.glb`, e.g. `gym_building.glb`.
5. List it in `web/public/assets/kit/manifest.json`:

   ```json
   { "pieces": ["gym_building", "lamp"] }
   ```

Collision footprints stay the same as the built-in piece, so the map doesn't need to change. If your model is a very different size, add a rectangle on the `collision` layer in Tiled.

**Palette** (bright and sunny, keep models consistent with the rest of the town): ink `#2a2440`, cream `#fff8ea`, accent orange `#ff6a3d` (only on interactive or brand elements), amber glow `#ffc14d`, yellow `#ffd257`, teal `#2bb3a3`, concrete `#e2ddd4`, steel `#c6d2e0`, slate `#4a5a7a`, brick `#c8553d`, wood `#a0673f`, leaf `#8cc85e`, sea `#2fb3c9`. The renderer adds a gentle colour grade on top (saturation, contrast, brightness in `retro.js`), so tune there if the whole game needs to be warmer or more muted.

**Building recipe** (the shared design system): stone plinth → walls → contrasting trim band → roof slab with overhang → framed sign. Lit windows use the amber glow colour.

### Characters

Nathan and the NPCs share one jointed rig (`web/src/game/player.js`). Outfits are data (`OUTFITS`), so a new NPC look is a few lines. A rigged Blender character can replace the box model later; it needs bones named for hips, thighs, shins, upper arms, forearms, neck and head so the procedural animation can drive them. Until then, keep the HUD portrait (`web/src/game/portrait.js`, a 32×32 pixel grid) in sync with any appearance change.

---

## 3. Story content (admin)

`npm run dev`, then open `http://localhost:5173/admin.html`.

- **Story chapters**: one per district. The Lighthouse chapter is the contact/career ending; Signal Tower automatically lists skills, experience and achievements.
- **Memories**: collectible ✦ items. Each needs an `id` that a `memory` point in Tiled refers to. The `transformation` memory is awarded by the lift minigame.
- **NPC dialogue**: greeting lines plus topics in the form `Question :: Answer`. Use `//` to split long answers into several bubbles, and end an answer with `[memory:ID]` to award a memory.

Write real details. Every memory and line of dialogue should tell visitors something true about you.

---

## 4. Checking performance

Add `?debug` to the URL to see FPS, draw calls, triangles and render resolution. Targets: 60 fps on a mid-range phone, < 400 draw calls, < 150k triangles.

To test on a real phone: `npm run dev` already listens on your network. Open `http://<your-PC-IP>:5173/?debug` on the phone (same Wi-Fi). Admin saving stays locked to the PC itself.
