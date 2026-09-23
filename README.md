# The Garden — a Noviciado Digital Ritual

A private daily digital ritual, hidden inside the Noviciado brand world. Connect a wallet, receive a persistent generated identity, and water your golden garden once a day for 7 days to earn 10 collectible gold coins.

## What this is
- A premium, minimal, black-and-gold daily check-in experience
- A real Solana wallet connection (Devnet) used as identity, not as a payment flow
- A **real WebGL 3D** avatar and coin reward (Three.js + React Three Fiber) — genuine geometry, metallic PBR materials, real lighting/shadows — plus the tree, played as a **growth video timeline** (`public/tree/tree07.mp4`): watering smoothly plays the next growth segment like a cutscene
- Tree growth follows the eight daily reference renders (`public/tree/0.png` … `public/tree/7.png`); if the video is missing, the app falls back to crossfading those stills
- A gold neon light that sweeps across the avatar's face on every successful daily check-in
- A gold neon light that sweeps across the avatar's face on every successful daily check-in
- Game-feel presentation: bloom/vignette grade, idle camera drift with a settle shake on each new day, a push-in camera during watering, cursor parallax, ambient gold dust, soil sparks, and orbiting glow motes on the final form (all respect reduced motion)
- A 7-day watering ritual with a 24-hour cooldown, streaks, and a weekly coin reward
- A dev-only test mode to simulate the full 7-day loop in minutes

## Explicitly flagged simplifications
- **Wallet**: uses the existing real Solana wallet-adapter integration (Devnet). The original brief also named MetaMask/WalletConnect/Coinbase (Ethereum wallets, a different chain) — that would be a separate integration; ask if you want it added.
- **Coin emblem fidelity**: the artwork on the coin's face is an **original in-app reproduction** of the reference golden-weed image, drawn at runtime on a canvas — not the literal attached file. This tool has no way to save a pasted chat image as a binary asset. To use the exact file: drop it at `src/assets/weed-emblem.png` and swap `createEmblemTexture()` in `src/three/canvasTextures.js` for a texture load of that file (one line).
- **Bundle size**: adding a real 3D engine grew the production bundle from ~200KB to ~445KB gzip. This is the honest cost of true WebGL 3D instead of a CSS fake; code-splitting is a possible follow-up if load time becomes a concern.
- **No external network calls added**: lighting/reflections use a studio environment generated procedurally in the browser (`three/addons/environments/RoomEnvironment.js`), not a fetched HDRI file.

## Run it

### Install dependencies
```bash
npm install
```

### Start the app
```bash
npm run dev
```
Then open `http://localhost:4173`. Dev mode also enables the **DEV / TEST MODE — NEXT DAY** control, which fast-forwards the simulated clock by 24 hours without bypassing the real cooldown/streak logic.

### Production build
```bash
npm run build
npm run preview
```
The dev-only `NEXT DAY` control is compiled out of production builds automatically.

## The tree

The tree is one continuous 7-second growth video (`public/tree/tree07.mp4`): **each second is one check-in day** — day 0 at `t=0`, day 7 at `t=7`. The app maps the ritual day onto the video timeline (`src/three/GrowthVideo.jsx`): watering plays the segment between the current and the next day at a gentle rate like a cutscene, and dev mode / reduced motion seek instantly. If the video is missing or unplayable, the app falls back to the eight stage images in `public/tree/` (verified to match the video's per-second frames).

Preview any day without connecting a wallet: open `http://localhost:4173/?tree=N` (N = 0..7).

`node scripts/capture-stage.mjs <stage> <out.png>` renders a headless preview frame of a stage for verification (requires Chrome).

## Validate
```bash
npm test
npm run check
```

## Project layout
- `index.html` — Vite entry HTML
- `src/main.jsx` — React entry point
- `src/App.jsx` — screen flow, persistence, dev mode
- `src/components/SolanaProvider.jsx` — Solana wallet provider tree
- `src/components/EntryScreen.jsx` — cinematic entry / connect wallet (3D hero)
- `src/components/AvatarSequence.jsx` — identity generation animation
- `src/components/GardenAvatar.jsx` — 3D helmet avatar
- `src/components/GardenPlant.jsx` — garden tree stage (canvas wrapper)
- `src/three/TreeStageSprite.jsx` — tree renderer: video timeline with image fallback
- `src/three/GrowthVideo.jsx` — plays `tree07.mp4` as a day-mapped video texture
- `scripts/capture-stage.mjs` — headless stage-preview capture for verification
- `src/three/GrowthVideo.jsx` — plays `growth.mp4` as a stage-mapped video texture
- `src/three/CameraRig.jsx` — camera drift/push-in/shake rig, pointer parallax groups
- `src/three/GoldParticles.jsx` — ambient gold dust, growth spark bursts, final-form orbiters
- `public/tree/` — the eight daily tree reference images (day 0 → day 7)
- `src/components/DayProgress.jsx` — 7-day ritual indicator
- `src/components/WateringOverlay.jsx` — cinematic watering reaction
- `src/components/RewardSequence.jsx` — 7-day completion + 3D coin reveal
- `src/components/ProfileCard.jsx` — member profile panel
- `src/three/` — all Three.js / React Three Fiber scene code
- `src/garden/garden-logic.js` — pure ritual state machine
- `src/garden/sound-engine.js` — synthesized sound effects
- `src/styles.css` — black/gold design system and layout
- `tests/garden-logic.test.js` — automated tests
- `docs/SPEC.md` — implementation spec
- `tasks/plan.md` — implementation plan
- `tasks/todo.md` — task checklist, including remaining manual browser checks
