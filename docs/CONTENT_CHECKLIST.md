# NATHAN.EXE: content checklist

Fill this in (or send it back to me) and I'll put it into the game. You can also type
everything straight into the admin page: `npm run dev` → http://localhost:5173/admin.html.
Leave anything blank that you don't want to share.

---

## 1. Profile (top of the portfolio + "About me" board)
- Full name (as you want it shown):
- One-line role (e.g. "Software Developer · IT Undergraduate"):
- Location (city / country):
- Availability line (e.g. "Open to internships from June 2027"):
- Short summary, 2–3 sentences:
- About me, 2–3 short paragraphs:
- Photo (optional): file
- Resume: PDF file

## 2. Contact links
- Email:
- GitHub:
- LinkedIn:
- Others (portfolio, X/Twitter, LeetCode, …):

## 3. Projects (up to 6 show as benches in the Garage)
For each project:
- Title:
- One-line pitch:
- Description (problem → what you built → result, 3–4 lines):
- Tech stack:
- GitHub link:
- Live demo link (if any):
- Screenshot: image file
- Year:
- Featured? (yes/no)

## 4. Skills (Garage pegboard)
Grouped, for example:
- Languages:
- Web / frameworks:
- Security / cryptography:
- AI / ML:
- Tools:

## 5. Experience (Signal Tower radio log)
For each: role · organisation · period · 1–2 lines on what you did

## 6. Achievements (Signal Tower trophy case)
For each: title (award / placement) · event or organisation · year · one-line detail

## 7. Story chapters
For each, a title, a period (years), and 2–3 short paragraphs + up to 3 highlight bullets.

| District | Current title | What to write about |
|---|---|---|
| Iron Yard | The Grind | Your fitness transformation: start, what changed, how long, the habit that made the difference. Numbers optional. |
| Winter Campus | The Detour | Your university in Russia: name, programme, years, life there, what you took away. (Reason for leaving is NOT mentioned anywhere.) |
| Monsoon Campus | The Restart | TCE Madurai: programme, years, focus, clubs, hackathons. |
| The Garage | The Garage | Short intro to your projects. |
| Signal Tower | Signal Tower | Short intro to your skills and achievements. |
| Lighthouse | Next Mission | The kind of role/team you want next, what you bring, when you're available. This is the ending text. |
| Lake Park (optional) | Still Water | Something personal: lessons learned, thanks to the people who helped. |

Also: the real **university name in Russia** for the building sign (currently "UNIVERSITY"), and any district or chapter names you want to change.

## 8. Memories (20 hidden collectibles), one true detail each, 2–4 sentences
- Iron Yard: the "before" photo · first training logbook · worn-out running shoes · the transformation (numbers) · advice that stuck
- Winter Campus: student ID card · first exam results · first real snow · the last lecture
- Monsoon Campus: admission letter · chai between classes · first hackathon · a rainy day on campus
- Garage: first commit · the 3 a.m. bug
- Signal Tower: first award · first internship / job
- Lake Park: letter to your younger self · the people who helped
- Lighthouse: your next goal

Optional: a photo for any memory.

## 9. People in the town (8 named NPCs)
These lines are **scripted game dialogue** (labelled "scripted" in the game), written only from facts elsewhere in this checklist. Replace any line with your own words in the admin (NPCs section). Appearance fields are editable there too; where each person walks is their route in Tiled (see docs/WORKFLOW.md).

Appearance placeholders to confirm: **Anu**, **Guru** and **Shabeer** had no visual description, so they use neutral outfits (TCE: tee and backpack; Winter Campus: winter coat, beanie, scarf). Send a short description to change them.

### Thianesh · Gymmate · roams: iron-yard
- Look: brown skin, tall, muscular, tank
- Greeting: Back for another session? The Iron Yard keeps score in reps, not words.
- Q: How did Nathan's journey go?
  - A: Roughly 100 kg, then about 60, then around 75. Three checkpoints, one habit: showing up.
- Q: What's the lesson here?
  - A: Small, repeated efforts. Goals change; the habit stays.

### Guru · Best friend · Winter Campus · roams: winter-campus
- Look: tan skin, coat
- Greeting: Welcome to Winter Campus. This chapter begins at Tomsk State University.
- Q: Where did Nathan study here?
  - A: Tomsk State University, in Russia.
- Q: How long was this chapter?
  - A: Two semesters. A short chapter, but a complete one.

### Shabeer · Friend · Winter Campus · roams: winter-campus
- Look: tan skin, coat
- Greeting: Cold out here, isn't it? Every district in this town keeps one chapter.
- Q: What is this place to Nathan?
  - A: His first university chapter, abroad. It gets its own place on the map.
- Q: Is there more to find here?
  - A: Look around campus for the glowing memories.

### Bubu · TCE campus mascot · roams: monsoon-campus
- Look: girl panda mascot, pink bow
- Greeting: Hi! I'm Bubu, the campus panda. Welcome to TCE Madurai!
- Q: What does Nathan study?
  - A: B.Tech in Information Technology at Thiagarajar College of Engineering, 2023 to 2027.
- Q: Where should I go next?
  - A: The Garage has his projects. Signal Tower has his skills and awards.

### Anu · Friend · TCE · roams: monsoon-campus
- Look: tan skin, tee
- Greeting: You found TCE! There's always a project or an event happening somewhere here.
- Q: What has Nathan built here?
  - A: Aratro, an event scheduler, cloud security monitoring and more. The Garage has the full list.
- Q: Did he win any hackathons?
  - A: Aratro took first place at Hack Odyssey 2025, and the TCE Event Scheduler was runner-up at HackFest 2025.

### Akshai · Garage crew · roams: garage
- Look: deep skin, tall, glasses, full beard, tee
- Greeting: Welcome to the Garage. Ideas in, projects out.
- Q: What's on these benches?
  - A: Each bench is a project: the problem, the build, and what it taught him.
- Q: Which one should I open first?
  - A: Try Aratro. It won first place at Hack Odyssey 2025.

### Naveen · Garage crew · roams: garage
- Look: tan skin, full beard, hoodie
- Greeting: Mind the cables. Something's always compiling in here.
- Q: What kind of things does Nathan build?
  - A: Full-stack apps, cloud security monitoring, blockchain workflows and a post-quantum messaging prototype.
- Q: What's the pegboard for?
  - A: His tech stack, grouped by how he uses each tool.

### Shabesh · Garage crew · roams: garage
- Look: fair skin, stubble beard, tee
- Greeting: Hey. This whole town is one of his projects too.
- Q: Is NATHAN.EXE finished?
  - A: Not yet. It's still being built, one district at a time.
- Q: Where's his resume?
  - A: Top right, any time. You don't need to finish the game.

## 10. Files
- TCE logo → `web/public/assets/logos/tce.png` (already added ✔)
- Resume PDF
- Project screenshots
- Optional: your photo, memory photos

## 11. Scorecard (still to decide)
Which do you want as an animated pixel scorecard?
- Skill stats card (skills as filling pixel bars + counts of projects, hackathons, awards)
- Fitness transformation card (before/after numbers counting up)
- Something else (academic scores, hackathon results…)
If you pick one, also send the numbers it should show.
