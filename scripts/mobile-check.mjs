/**
 * Mobile smoke test: opens the app at phone size, screenshots the entry
 * screen, taps Check in, waits through the loading moment, screenshots
 * the garden, and reports any console errors.
 *
 * Usage: node scripts/mobile-check.mjs
 */

import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const port = 9229;

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--hide-scrollbars',
  '--window-size=390,844',
  '--force-device-scale-factor=1',
  `--remote-debugging-port=${port}`,
  '--user-data-dir=/tmp/garden-chrome-mobile',
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
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      console.log(`[console-error] ${text}`);
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
  await sleep(4000);

  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/mobile-entry.png', Buffer.from(shot1.data, 'base64'));
  console.log('captured /tmp/mobile-entry.png');

  // tap check-in
  await send('Runtime.evaluate', { expression: `document.querySelector('.primary-button')?.click()` });
  await sleep(3000);

  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/mobile-garden.png', Buffer.from(shot2.data, 'base64'));
  console.log('captured /tmp/mobile-garden.png');

  ws.close();
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => chrome.kill());
