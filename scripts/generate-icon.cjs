// Procedurally generates the app icon (no external image deps).
// Draws a rounded dark tile with a bright ">_" terminal glyph, encodes
// raw pixels to PNG by hand (zlib deflate + zlib.crc32, both built into Node),
// and packs a handful of sizes into a Windows .ico for the installer.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'build');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SRC_ASSETS_DIR = path.join(__dirname, '..', 'src', 'assets');

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

// distance from point p to segment [a,b]
function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;
  let t = abLenSq === 0 ? 0 : (apx * abx + apy * aby) / abLenSq;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function roundedSquareDist(px, py, size, radius) {
  // distance to a rounded square centered box (negative = inside)
  const half = size / 2;
  const qx = Math.abs(px - half) - (half - radius);
  const qy = Math.abs(py - half) - (half - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

function renderIcon(size) {
  const S = 4; // supersample factor
  const hi = size * S;
  const buf = new Float64Array(hi * hi * 4);

  const bgTop = [26, 22, 21]; // #1a1615
  const bgBottom = [11, 9, 9]; // #0b0909
  const glowColor = [255, 106, 61]; // coral glow
  const glyphTop = [255, 165, 92]; // warm amber-orange
  const glyphBottom = [255, 79, 54]; // coral-red

  const radius = hi * 0.22;

  // chevron ">" geometry (in hi-res pixel space)
  const cx = hi * 0.44;
  const cy = hi * 0.5;
  const armLen = hi * 0.19;
  const thickness = hi * 0.085;
  const p0 = [cx - armLen * 0.55, cy - armLen];
  const p1 = [cx + armLen * 0.65, cy];
  const p2 = [cx - armLen * 0.55, cy + armLen];

  // underscore bar
  const barY = cy + hi * 0.225;
  const barX0 = cx + hi * 0.04;
  const barX1 = cx + hi * 0.34;
  const barThickness = hi * 0.075;

  for (let y = 0; y < hi; y++) {
    for (let x = 0; x < hi; x++) {
      const idx = (y * hi + x) * 4;
      const d = roundedSquareDist(x + 0.5, y + 0.5, hi, radius);
      const coverage = clamp(0.5 - d, 0, 1);
      if (coverage <= 0) continue;

      const t = (y + x) / (hi * 2);
      let r = mix(bgTop[0], bgBottom[0], t);
      let g = mix(bgTop[1], bgBottom[1], t);
      let b = mix(bgTop[2], bgBottom[2], t);

      // soft glow behind glyph
      const glowD = distToSegment(x, y, p0[0], p0[1], p1[0], p1[1]);
      const glowD2 = distToSegment(x, y, p1[0], p1[1], p2[0], p2[1]);
      const glow = clamp(1 - Math.min(glowD, glowD2) / (hi * 0.22), 0, 1);
      const glowAlpha = Math.pow(glow, 2) * 0.55;
      r = mix(r, glowColor[0], glowAlpha);
      g = mix(g, glowColor[1], glowAlpha);
      b = mix(b, glowColor[2], glowAlpha);

      // chevron strokes
      const dSeg1 = distToSegment(x, y, p0[0], p0[1], p1[0], p1[1]) - thickness / 2;
      const dSeg2 = distToSegment(x, y, p1[0], p1[1], p2[0], p2[1]) - thickness / 2;
      const chevronCoverage = clamp(0.5 - Math.min(dSeg1, dSeg2), 0, 1);

      // underscore bar (rounded rect via segment distance with thickness)
      const dBar = distToSegment(x, y, barX0, barY, barX1, barY) - barThickness / 2;
      const barCoverage = clamp(0.5 - dBar, 0, 1);

      const glyphCoverage = clamp(chevronCoverage + barCoverage, 0, 1);
      const glyphT = clamp((x / hi - 0.3) * 1.4, 0, 1);
      const gr = mix(glyphTop[0], glyphBottom[0], glyphT);
      const gg = mix(glyphTop[1], glyphBottom[1], glyphT);
      const gb = mix(glyphTop[2], glyphBottom[2], glyphT);
      r = mix(r, gr, glyphCoverage);
      g = mix(g, gg, glyphCoverage);
      b = mix(b, gb, glyphCoverage);

      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = coverage * 255;
    }
  }

  // downsample hi -> size (box filter)
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const idx = ((y * S + sy) * hi + (x * S + sx)) * 4;
          r += buf[idx];
          g += buf[idx + 1];
          b += buf[idx + 2];
          a += buf[idx + 3];
        }
      }
      const n = S * S;
      const oidx = (y * size + x) * 4;
      out[oidx] = clamp(Math.round(r / n), 0, 255);
      out[oidx + 1] = clamp(Math.round(g / n), 0, 255);
      out[oidx + 2] = clamp(Math.round(b / n), 0, 255);
      out[oidx + 3] = clamp(Math.round(a / n), 0, 255);
    }
  }
  return out;
}

function crc32(buf) {
  return zlib.crc32(buf) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildIco(pngsBySize) {
  const sizes = Object.keys(pngsBySize).map(Number).sort((a, b) => a - b);
  const count = sizes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  const imageDatas = [];
  let offset = 6 + count * 16;

  for (const size of sizes) {
    const png = pngsBySize[size];
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // width (0 = 256)
    entry[1] = size >= 256 ? 0 : size; // height
    entry[2] = 0; // color palette
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32BE ? null : null;
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    imageDatas.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...imageDatas]);
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!fs.existsSync(SRC_ASSETS_DIR)) fs.mkdirSync(SRC_ASSETS_DIR, { recursive: true });

  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  const pngs = {};
  for (const size of sizes) {
    const rgba = renderIcon(size);
    pngs[size] = encodePNG(size, rgba);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), pngs[512]);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'app-icon.png'), pngs[256]);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'app-icon-32.png'), pngs[32]);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'app-icon-16.png'), pngs[16]);
  // Imported as a module by TitleBar.tsx — public/ paths only resolve
  // correctly under the dev server, not under file:// in a packaged build.
  fs.writeFileSync(path.join(SRC_ASSETS_DIR, 'app-icon.png'), pngs[256]);

  const ico = buildIco({ 16: pngs[16], 32: pngs[32], 48: pngs[48], 256: pngs[256] });
  fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), ico);

  console.log('Generated icons in build/ and public/');
}

main();
