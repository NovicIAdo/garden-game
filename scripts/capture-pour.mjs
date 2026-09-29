import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const PORT = 4173;
const CDP_PORT = 9237;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      return await (await fetch(url)).json();
    } catch {
      await sleep(250);
    }
  }
  throw new Error('timeout');
}

async function main() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 60; i += 1) {
      try {
        const res = await fetch(`http://localhost:${PORT}/`);
        if (res.ok) break;
      } catch { /* wait */ }
      await sleep(250);
    }

    const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
      '--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--hide-scrollbars', '--window-size=390,844', '--force-device-scale-factor=1',
      `--remote-debugging-port=${CDP_PORT}`, '--user-data-dir=/tmp/garden-chrome-pour',
      'about:blank',
    ], { stdio: 'ignore' });

    try {
      await waitForJson(`http://127.0.0.1:${CDP_PORT}/json`);
      const page = await (await fetch(
        `http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(`http://localhost:${PORT}/`)}`,
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
        if (msg.method === 'Runtime.exceptionThrown') {
          console.log(`[exception] ${msg.params.exceptionDetails.text}`);
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
        width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
      });
      await sleep(2200);

      // check in
      await evaluate(`document.querySelector('.primary-button')?.click()`);
      await sleep(3200);

      // water; capture at three moments of the pour
      await evaluate(`document.querySelector('.ritual-cta')?.click()`);
      await sleep(950);
      let shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync('/tmp/pour-1.png', Buffer.from(shot.data, 'base64'));
      await sleep(250);
      shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync('/tmp/pour-2.png', Buffer.from(shot.data, 'base64'));
      await sleep(250);
      shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync('/tmp/pour-3.png', Buffer.from(shot.data, 'base64'));
      console.log('captured /tmp/pour-1..3.png');

      ws.close();
    } finally {
      chrome.kill();
    }
  } finally {
    vite.kill();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
