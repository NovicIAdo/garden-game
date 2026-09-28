import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const W = Number(process.argv[2] ?? 1280);
const H = Number(process.argv[3] ?? 720);
const THRESHOLD = 24;

function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function bboxOf(buf) {
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 3;
      if (lum(buf[i], buf[i + 1], buf[i + 2]) > THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

const samples = [0.5, 1.25, 2, 2.75, 3.5, 4.25];
const union = { minX: W, minY: H, maxX: -1, maxY: -1 };

for (const t of samples) {
  execFileSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', 'public/tree/dream.mp4',
     '-vf', `scale=${W}:${H}`,
     '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '_sample.rgb', '-y'],
  );
  const buf = readFileSync('_sample.rgb');
  const b = bboxOf(buf);
  console.log(`t=${t}s bbox x=${b.minX}..${b.maxX} y=${b.minY}..${b.maxY}`);
  union.minX = Math.min(union.minX, b.minX);
  union.minY = Math.min(union.minY, b.minY);
  union.maxX = Math.max(union.maxX, b.maxX);
  union.maxY = Math.max(union.maxY, b.maxY);
}

const w = union.maxX - union.minX + 1;
const h = union.maxY - union.minY + 1;
console.log(`UNION bbox x=${union.minX}..${union.maxX} (w=${w}) y=${union.minY}..${union.maxY} (h=${h})`);

// Crop window: union bbox + margin, clamped to frame, even dimensions.
const margin = 28;
let x0 = Math.max(0, union.minX - margin);
let y0 = Math.max(0, union.minY - margin);
let x1 = Math.min(W - 1, union.maxX + margin);
let y1 = Math.min(H - 1, union.maxY + margin);
let cw = x1 - x0 + 1;
let ch = y1 - y0 + 1;
if (cw % 2) cw += 1;
if (ch % 2) ch += 1;
console.log(`CROP window x=${x0} y=${y0} w=${cw} h=${ch} aspect=${(cw / ch).toFixed(4)}`);
writeFileSync('_crop.json', JSON.stringify({ x0, y0, cw, ch }, null, 2));
