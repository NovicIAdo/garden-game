# The Garden — Noviciado check-in game

A phone-first daily check-in mini-game for **Noviciado Coffee** (Madrid).
A member checks in at the door, receives water, and waters a tree that grows
from day 0 to day 7, ending in a looping full-tree "dream" video. Built to be
embedded into the Noviciado app.

## What this is

- **Entry screen** — a pure-black cinematic hero playing `dream.mp4` with a
  `Check in` button that simulates the door scan.
- **Loading moment** — `leaf.mp4` spinning on a black background.
- **The garden (main page)** — the growing tree in the center, an
  "Identity · Auric" column on the left (avatar + QR, hidden on mobile),
  header buttons vertical in the top-right corner, black background.
- **Tree growth** — one continuous growth video (`public/tree/tree07.mp4`):
  each second is one check-in day (day 0 at `t=0`, day 7 at `t=7`). Watering
  smoothly plays the segment to the next day like a cutscene. The eight daily
  stage stills (`public/tree/0.png` … `7.png`) are the verified frames.
- **Final day** — after day 7 the tree hands off to the looping full-tree
  `dream.mp4` performance; the final watering grows the frame 30% centered
  (CSS transform, so the video is never cropped).
- **Member profile** — `auric-avatar.jpg` on top, centered QR-code under the
  avatar, then member info (Member ID, Identity Auric, streaks, week, weeks,
  coin balance).
- **Phone-first** — on mobile the Identity column is removed and the tree is
  enlarged; the game is designed to live mostly on phones.

## Run it

```bash
npm install --legacy-peer-deps
npm run dev
```

Then open `http://localhost:4173`. Dev mode also enables the stage preview:
open `http://localhost:4173/?tree=N` (N = 0..7).

### Production build

```bash
npm run build
npm run preview
```

## Validate

```bash
npm test
npm run check
```

## Assets

Everything served at runtime lives in `public/tree/`:

| File | Use |
| --- | --- |
| `tree07.mp4` | growth timeline, 1 second per day (day 0 → 7) |
| `0.png` … `7.png` | per-day stage stills (verified video frames, fallback) |
| `dream.mp4` | entry-screen hero + final-day looping performance |
| `leaf.mp4` | loading animation |
| `auric-avatar.jpg` | member avatar |

## Project layout

- `index.html` — Vite entry HTML
- `src/main.jsx` — React entry point
- `src/App.jsx` — screen flow, persistence, dev mode
- `src/components/` — screens and UI (entry, loading, garden, profile, QR,
  watering, reward)
- `src/three/` — Three.js / React Three Fiber scene and video-texture renderer
- `src/garden/garden-logic.js` — pure ritual state machine
- `src/styles.css` — black/gold design system and layout
- `tests/` — automated tests
- `scripts/` — headless verification scripts
- `docs/SPEC.md` — implementation spec
- `tasks/` — implementation plan and checklist
