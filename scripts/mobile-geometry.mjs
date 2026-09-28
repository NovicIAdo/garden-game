/**
 * Mobile geometry probe: seeds a garden state for every day 0..7 and
 * measures the real DOM geometry of the tree frame at phone viewports,
 * so layout overflows (crown above the header, frame off the sides,
 * pot clipped) are caught with numbers instead of eyeballing.
 *
 * Usage: node scripts/mobile-geometry.mjs
 */

import { spawn } from 'node:child_process';

const PORT = 4173;
let CDP_PORT = 9231;
const VIEWPORTS = [
  { label: 'iphone-14', width: 390, height: 844 },
  { label: 'iphone-se', width: 375, height: 667 },
  { label: 'android-small', width: 360, height: 640 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      return await (await fetch(url)).json();
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function main() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  try {
    await waitForJson(`http://localhost:${PORT}/`, 80).catch(() => {});
    // A 200 fetch of the root html means the server is up.
    for (let i = 0; i < 60; i += 1) {
      try {
        const res = await fetch(`http://localhost:${PORT}/`);
        if (res.ok) break;
      } catch { /* not up yet */ }
      await sleep(250);
    }

    for (const vp of VIEWPORTS) {
      const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
        '--headless=new',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--hide-scrollbars',
        `--window-size=${vp.width},${vp.height}`,
        '--force-device-scale-factor=1',
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=/tmp/garden-chrome-${vp.label}`,
        'about:blank',
      ], { stdio: 'ignore' });

      try {
        await waitForJson(`http://127.0.0.1:${CDP_PORT}/json`);
        const page = await (await fetch(
          `http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(`http://localhost:${PORT}/`) }`,
          { method: 'PUT' },
        )).json();
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));

        let id = 0;
        const pending = new Map();
        ws.addEventListener('message', (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg.result);
            pending.delete(msg.id);
          }
        });
        const send = (method, params = {}) => new Promise((resolve) => {
          id += 1;
          pending.set(id, resolve);
          ws.send(JSON.stringify({ id, method, params }));
        });
        const evaluate = async (expression) => {
          const result = await send('Runtime.evaluate', { expression, returnByValue: true });
          return result?.result?.value;
        };

        await send('Page.enable');
        await send('Runtime.enable');
        await send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: true,
        });

        console.log(`\n=== ${vp.label} (${vp.width}x${vp.height}) ===`);
        console.log('day  top  bottom  left  right  width  height  vw  vh  headerBottom  panelTop  flags');

        for (let day = 0; day <= 7; day += 1) {
          // Seed a valid garden state at this day and check in.
          const state = JSON.stringify({
            seed: 'probe',
            gardenNumber: 'No. 001',
            avatarTraits: {
              helmetShape: 'rounded',
              material: 'champagne-gold',
              visor: 'black-glass',
              detail: 'noviciado-mark',
            },
            currentDay: day,
            lastCheckIn: Date.now(),
            currentStreak: day,
            longestStreak: day,
            completedWeeks: 0,
            coinBalance: 0,
            rewardHistory: [],
            rewardPending: false,
            devClockOffsetMs: 0,
            message: '',
          });
          await evaluate(`
            localStorage.setItem('noviciado-member-id', 'NV-PROBE');
            localStorage.setItem('noviciado-garden:NV-PROBE', ${JSON.stringify(state)});
            location.reload();
          `);
          await sleep(2600);
          await evaluate(`document.querySelector('.primary-button')?.click()`);
          await sleep(2800);

          const metrics = await evaluate(`(() => {
            const plant = document.querySelector('.garden-plant');
            const header = document.querySelector('.app-header');
            const stage = document.querySelector('.garden-stage');
            const panel = document.querySelector('.ritual-panel');
            if (!plant || !header) return null;
            const r = plant.getBoundingClientRect();
            const h = header.getBoundingClientRect();
            const s = stage.getBoundingClientRect();
            const p = panel ? panel.getBoundingClientRect() : null;
            return {
              top: +r.top.toFixed(1),
              bottom: +r.bottom.toFixed(1),
              left: +r.left.toFixed(1),
              right: +r.right.toFixed(1),
              width: +r.width.toFixed(1),
              height: +r.height.toFixed(1),
              vw: innerWidth,
              vh: innerHeight,
              headerBottom: +h.bottom.toFixed(1),
              stageTop: +s.top.toFixed(1),
              panelTop: p ? +p.top.toFixed(1) : null,
              panelBottom: p ? +p.bottom.toFixed(1) : null,
            };
          })()`);

          if (!metrics) {
            console.log(`${day}  (no plant element)`);
            continue;
          }

          const flags = [];
          if (metrics.top < 0) flags.push('TOP-OFF-SCREEN');
          if (metrics.top < metrics.headerBottom) flags.push('UNDER-HEADER');
          if (metrics.left < 0) flags.push('LEFT-OFF-SCREEN');
          if (metrics.right > metrics.vw) flags.push('RIGHT-OFF-SCREEN');
          if (metrics.bottom > metrics.vh) flags.push('BOTTOM-OFF-SCREEN');
          if (metrics.panelTop !== null && metrics.bottom > metrics.panelTop) flags.push('OVERLAPS-PANEL');
          if (flags.length === 0) flags.push('ok');

          console.log(
            `${day}  ${metrics.top}  ${metrics.bottom}  ${metrics.left}  ${metrics.right}  ` +
            `${metrics.width}  ${metrics.height}  ${metrics.vw}  ${metrics.vh}  ${metrics.headerBottom}  ` +
            `${metrics.panelTop}  panelH=${metrics.panelBottom - metrics.panelTop}  ${flags.join(',')}`,
          );
        }

        ws.close();
      } finally {
        chrome.kill();
        await sleep(1500);
      }
      CDP_PORT += 1;
    }
  } finally {
    vite.kill();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
