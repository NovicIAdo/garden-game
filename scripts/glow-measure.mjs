import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function analyze(label, video, seconds) {
  for (const t of seconds) {
    execFileSync(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', video,
       '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '_g.rgb', '-y'],
    );
    const buf = readFileSync('_g.rgb');
    // frame size from ffprobe would be nicer, but read dims via args
    const W = process.env.GW ? Number(process.env.GW) : 0;
    // reuse: pass dims through env
    const width = Number(process.env.GW);
    const height = Number(process.env.GH);
    if (!width || !height) throw new Error('set GW/GH');

    // Bright tree mask: pixels > 60 luma
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 3;
        if (lum(buf[i], buf[i + 1], buf[i + 2]) > 60) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Glow: max luma in the area outside a padded tree bbox, plus a histogram peak.
    let glowMax = 0;
    let glowSum = 0;
    let glowCount = 0;
    const pad = 60;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (x > minX - pad && x < maxX + pad && y > minY - pad && y < maxY + pad) continue;
        const i = (y * width + x) * 3;
        const l = lum(buf[i], buf[i + 1], buf[i + 2]);
        if (l > glowMax) glowMax = l;
        glowSum += l;
        glowCount += 1;
      }
    }
    console.log(
      `${label} t=${t}s: tree bbox x=${minX}..${maxX} y=${minY}..${maxY}, ` +
      `glowMax=${glowMax.toFixed(0)}, glowAvg=${(glowSum / glowCount).toFixed(2)}`,
    );
  }
}

const [video, ...times] = process.argv.slice(2);
analyze(process.argv[2] ?? 'video', process.argv[2], times.map(Number));
