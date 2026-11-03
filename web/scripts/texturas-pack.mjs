import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/packs');
const origen = path.join(dir, 'pack.webp');

const { data, info } = await sharp(origen).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;

const ancho = 220;
const alto = Math.round((ancho * H) / W);
const d = new Float32Array(ancho * alto);
for (let y = 0; y < alto; y++)
    for (let x = 0; x < ancho; x++) {
        const px = Math.floor(((x + 0.5) / ancho) * W);
        const py = Math.floor(((y + 0.5) / alto) * H);
        const borde = x === 0 || y === 0 || x === ancho - 1 || y === alto - 1;
        d[y * ancho + x] = !borde && data[(py * W + px) * 4 + 3] > 127 ? 1e9 : 0;
    }
const D = Math.SQRT2;
const ver = (x, y) => (x < 0 || y < 0 || x >= ancho || y >= alto ? 0 : d[y * ancho + x]);
for (let y = 0; y < alto; y++)
    for (let x = 0; x < ancho; x++) {
        const k = y * ancho + x;
        d[k] = Math.min(d[k], ver(x - 1, y) + 1, ver(x, y - 1) + 1, ver(x - 1, y - 1) + D, ver(x + 1, y - 1) + D);
    }
for (let y = alto - 1; y >= 0; y--)
    for (let x = ancho - 1; x >= 0; x--) {
        const k = y * ancho + x;
        d[k] = Math.min(d[k], ver(x + 1, y) + 1, ver(x, y + 1) + 1, ver(x + 1, y + 1) + D, ver(x - 1, y + 1) + D);
    }
for (let k = 0; k < d.length; k++) d[k] /= ancho;

for (let y = Math.round(H * 0.085); y < H * 0.915; y++) {
    const cy = Math.min(alto - 1, Math.floor((y / H) * alto));
    for (let x = 0; x < W; x++) {
        const cx = Math.min(ancho - 1, Math.floor((x / W) * ancho));
        const dist = d[cy * ancho + cx];
        if (dist >= 0.075) continue;
        const f = Math.min(1, Math.max(0, (0.075 - dist) / 0.03));
        const k = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) data[k + c] = data[k + c] * (1 - f) + 10 * f;
    }
}

const metal = Buffer.alloc(W * H);
const brillo = Buffer.alloc(W * H);
for (let i = 0, k = 0; i < W * H; i++, k += 4) {
    const r = data[k];
    const g = data[k + 1];
    const b = data[k + 2];
    const oro = Math.min(1, Math.max(0, (r + g) / 2 - b - 15) / 50) * Math.min(1, r / 120);
    metal[i] = Math.round(110 + oro * 145);
    brillo[i] = Math.round(oro * 255);
}

const crudo = (buf, canales) => sharp(buf, { raw: { width: W, height: H, channels: canales } });
await crudo(data, 4).webp({ quality: 88, alphaQuality: 100 }).toFile(path.join(dir, 'pack-color.webp'));
await crudo(metal, 1).webp({ quality: 80 }).toFile(path.join(dir, 'pack-metal.webp'));
await crudo(brillo, 1).webp({ quality: 80 }).toFile(path.join(dir, 'pack-brillo.webp'));
await sharp(origen).resize({ width: 600 }).webp({ quality: 85, alphaQuality: 100 }).toFile(path.join(dir, 'pack-chico.webp'));
console.log('Texturas del pack generadas en', dir);
