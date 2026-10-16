// Deterministic 96px white-on-transparent closet doorway and cross.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
const size = 96, pixels = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const arch = y >= 36 || (x - 48) ** 2 + (y - 36) ** 2 <= 30 ** 2;
  const doorway = x >= 18 && x <= 78 && y >= 6 && y <= 88 && arch;
  const cross = (x >= 44 && x <= 52 && y >= 29 && y <= 69) || (x >= 33 && x <= 63 && y >= 40 && y <= 48);
  if (doorway && !cross) pixels.fill(255, y * (size * 4 + 1) + 1 + x * 4, y * (size * 4 + 1) + 5 + x * 4);
}
function chunk(type, data) {
  const bytes = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, bytes, checksum]);
}
const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
writeFileSync(new URL('../public/assets/icons/notification-badge.png', import.meta.url), Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
]));
