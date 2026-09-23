/**
 * Mobile states check: day-7 tree frame, watering overlay, member dialog.
 *
 * Usage: node scripts/mobile-states.mjs
 */

import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const port = 9230;

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--hide-scrollbars',
  '--window-size=390,844',
  '--force-device-scale-factor=1',
  `--remote-debugging-port=${port}`,
  '--user-data-dir=/tmp/garden-chrome-mobile2',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  for (let i = 0; i < 40; i += 1) {
    try {
      await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      break;
    } catch {
      await sleep(250);
    }
  }

  const page = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('http://localhost:4173/')}`, { method: 'PUT' })).json();
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
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log(`[exception] ${msg.params.exceptionDetails.text}`);
    }
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(3000);

  // 1) check in
  await send('Runtime.evaluate', { expression: `document.querySelector('.primary-button')?.click()` });
  await sleep(3200);

  // 2) watering overlay (fresh garden can water)
  await send('Runtime.evaluate', { expression: `document.querySelector('.ritual-cta')?.click()` });
  await sleep(2200);
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/mobile-watering.png', Buffer.from(shot.data, 'base64'));
  console.log('captured /tmp/mobile-watering.png');

  // 3) close watering, open member dialog
  await send('Runtime.evaluate', { expression: `document.querySelector('.overlay-skip, .watering-result .primary-button')?.click()` });
  await sleep(800);
  await send('Runtime.evaluate', { expression: `document.querySelector('button[aria-label="Open member profile"]')?.click()` });
  await sleep(1200);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/mobile-member.png', Buffer.from(shot.data, 'base64'));
  console.log('captured /tmp/mobile-member.png');

  // 4) close member, go to day-7 tree preview
  await send('Runtime.evaluate', { expression: `document.querySelector('.profile-close')?.click()` });
  await send('Page.navigate', { url: 'http://localhost:4173/?tree=7' });
  await sleep(3500);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/mobile-tree7.png', Buffer.from(shot.data, 'base64'));
  console.log('captured /tmp/mobile-tree7.png');

  ws.close();
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => chrome.kill());
