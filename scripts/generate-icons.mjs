/**
 * Adaptime uygulama ikonlarını (PNG) üretir.
 *
 * Harici bağımlılık yok: RGBA pikseller çizilir, zlib ile PNG olarak yazılır.
 * Çalıştırma: `node scripts/generate-icons.mjs`
 *
 * - icon-192 / icon-512: yuvarlatılmış köşeli, "any" amaçlı.
 * - maskable-192 / maskable-512: tam kanamalı zemin + güvenli alanda içerik.
 * - apple-touch-icon: iOS ana ekran simgesi (köşeleri iOS kendisi yuvarlar).
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "latin1");
  const body = Buffer.concat([typeBuffer, data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Yuvarlatılmış dikdörtgen için işaretli uzaklık (negatif = içinde). */
function sdRoundRect(x, y, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(x - cx) - (halfW - radius);
  const dy = Math.abs(y - cy) - (halfH - radius);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Noktanın doğru parçasına uzaklığı (akrep/yelkovan çizimi için). */
function sdSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy || 1;
  const t = Math.min(1, Math.max(0, (wx * vx + wy * vy) / len2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function coverage(distance) {
  // 1 px yumuşak kenar (anti-aliasing).
  return Math.min(1, Math.max(0, 0.5 - distance));
}

function blend(out, index, r, g, b, alpha) {
  if (alpha <= 0) return;
  const inv = 1 - alpha;
  out[index] = Math.round(r * alpha + out[index] * inv);
  out[index + 1] = Math.round(g * alpha + out[index + 1] * inv);
  out[index + 2] = Math.round(b * alpha + out[index + 2] * inv);
  out[index + 3] = Math.round(255 * alpha + out[index + 3] * inv);
}

function drawIcon(size, { maskable }) {
  const pixels = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const radius = maskable ? 0 : size * 0.22;
  // Maskable ikonlarda içerik güvenli alanda kalmalı (kenardan %20 pay).
  const scale = maskable ? 0.62 : 0.82;
  const ringRadius = size * 0.3 * (scale / 0.82);
  const ringWidth = Math.max(size * 0.052 * (scale / 0.82), 3);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const d = maskable
        ? -1
        : sdRoundRect(x + 0.5, y + 0.5, center, center, center, center, radius);
      const bgAlpha = maskable ? 1 : coverage(d);
      if (bgAlpha <= 0) continue;

      // Dikey degrade: #6366f1 → #4f46e5
      const t = y / size;
      blend(
        pixels,
        index,
        Math.round(99 + (79 - 99) * t),
        Math.round(102 + (70 - 102) * t),
        Math.round(241 + (229 - 241) * t),
        bgAlpha,
      );
    }
  }

  // Saat: halka + iki akrep + merkez noktası (beyaz).
  const cx = center;
  const cy = center;
  const hourAngle = -Math.PI / 3; // 14:00 yönü
  const minuteAngle = -Math.PI / 2 + Math.PI / 6; // 10 dakika

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      if (pixels[index + 3] === 0) continue;
      const px = x + 0.5;
      const py = y + 0.5;
      const dist = Math.hypot(px - cx, py - cy);

      const ring = coverage(Math.abs(dist - ringRadius) - ringWidth / 2);
      const dot = coverage(dist - ringWidth * 0.85);
      const hourHand = coverage(
        sdSegment(px, py, cx, cy, cx + Math.cos(hourAngle) * ringRadius * 0.52, cy + Math.sin(hourAngle) * ringRadius * 0.52) -
          ringWidth * 0.42,
      );
      const minuteHand = coverage(
        sdSegment(px, py, cx, cy, cx + Math.cos(minuteAngle) * ringRadius * 0.78, cy + Math.sin(minuteAngle) * ringRadius * 0.78) -
          ringWidth * 0.32,
      );

      const alpha = Math.max(ring, dot, hourHand, minuteHand);
      if (alpha > 0) blend(pixels, index, 255, 255, 255, alpha);
    }
  }

  return encodePng(size, size, pixels);
}

mkdirSync(OUT_DIR, { recursive: true });

const outputs = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "maskable-192.png", size: 192, maskable: true },
  { file: "maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: true },
];

for (const { file, size, maskable } of outputs) {
  const png = drawIcon(size, { maskable });
  writeFileSync(join(OUT_DIR, file), png);
  console.log(`${file}: ${size}x${size}, ${(png.length / 1024).toFixed(1)} kB`);
}
