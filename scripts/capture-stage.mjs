/**
 * Headless stage-preview capture for the garden tree.
 *
 * Usage: node scripts/capture-stage.mjs <stage> <outfile.png>
 *
 * Opens the dev server's `?tree=<stage>` preview route in headless Chrome
 * (software WebGL via SwiftShader), waits for the scene to render in real
 * time, and saves a PNG screenshot. Used to verify the procedural tree's
 * growth stages against the TREE/ reference renders.
 */

import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const stage = Number(process.argv[2]);
const out = process.argv[3];
const port = 9223;

if (!Number.isFinite(stage) || !out) {
  console.error('usage: node scripts/capture-stage.mjs <stage 0-7> <outfile.png>');
  process.exit(1);
}

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(CHROME, [
  '--headless=new',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--hide-scrollbars',
  '--window-size=560,800',
  `--remote-debugging-port=${port}`,
  '--user-data-dir=/tmp/garden-chrome-cdp',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cdpJson(path, method = 'GET') {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method });
  if (!response.ok) {
    throw new Error(`CDP HTTP ${response.status} for ${path}`);
  }
  return response.json();
}

async function main() {
  let targets = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      targets = await cdpJson('/json');
      break;
    } catch {
      await sleep(250);
    }
  }
  if (!targets) {
    throw new Error('Chrome DevTools endpoint not reachable');
  }

  const page = await cdpJson(`/json/new?${encodeURIComponent(`http://localhost:4173/?tree=${stage}`)}`, 'PUT');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let messageId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    messageId += 1;
    pending.set(messageId, { resolve, reject });
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  // Real-time wait: page load + first WebGL frames + growth settle.
  await sleep(4500);

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`captured ${out}`);
  ws.close();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => chrome.kill());
