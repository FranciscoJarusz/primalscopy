// lib/winCards.js
//
// La tarjeta para compartir un premio de ruleta en X. El intent de X solo
// acepta texto y un link (no se puede adjuntar una imagen), asi que el post
// lleva un link a /staking/win/<id> y esa pagina le dice a X que muestre esta
// imagen como tarjeta grande (twitter:card summary_large_image, 1200x630).
//
// Se arma con sharp: fondo con rayos del color de la rareza, la imagen del
// premio a la izquierda y el texto en Sunzone a la derecha. La fuente y los
// iconos de FOG/APE viven en backend/assets porque el backend se despliega
// aparte del sitio. Cada tarjeta se genera una vez y queda en disco.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ASSETS_ROOT, writeAtomic } = require('./assetStore');
const primalThumbs = require('./primalThumbs');

const ANCHO = 1200;
const ALTO = 630;
const LADO = 400; // la imagen del premio
const DIR = path.join(ASSETS_ROOT, 'staking', 'cards');
const PREMIOS_DIR = path.join(ASSETS_ROOT, 'staking', 'prizes');
const FUENTE = path.join(__dirname, '..', 'assets', 'fonts', 'sunzone-v2.ttf');
const ICONOS = path.join(__dirname, '..', 'assets', 'staking');
const ID_REGEX = /^[0-9a-f-]{8,64}$/;

// Los mismos colores que la pagina (lib/staking.ts, colorRareza).
function colorRareza(chance) {
    if (chance >= 0.25) return '#8b93c9';
    if (chance >= 0.08) return '#4f7bff';
    if (chance >= 0.02) return '#a646ff';
    return '#fdf468';
}

const escapar = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Un texto en Sunzone como imagen, para pegarlo encima.
function texto(markup, { size, width, align = 'left' }) {
    return sharp({
        text: { text: markup, font: `Sunzone ${size}`, fontfile: FUENTE, rgba: true, width, align, dpi: 72, wrap: 'word' }
    }).png().toBuffer();
}

// El fondo: azul oscuro, un brillo y rayos del color de la rareza detras del
// premio.
function fondo(color) {
    const cx = 110 + LADO / 2;
    const cy = ALTO / 2;
    const rayos = Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        const b = a + Math.PI / 30;
        const r = 900;
        return `<polygon points="${cx},${cy} ${cx + Math.cos(a) * r},${cy + Math.sin(a) * r} ${cx + Math.cos(b) * r},${cy + Math.sin(b) * r}" />`;
    }).join('');
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}">
  <defs>
    <radialGradient id="brillo" cx="${cx}" cy="${cy}" r="520" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${color}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="apagar" cx="${cx}" cy="${cy}" r="560" gradientUnits="userSpaceOnUse">
      <stop offset="0.15" stop-color="white" stop-opacity="1"/>
      <stop offset="1" stop-color="white" stop-opacity="0"/>
    </radialGradient>
    <mask id="m"><rect width="${ANCHO}" height="${ALTO}" fill="url(#apagar)"/></mask>
  </defs>
  <rect width="${ANCHO}" height="${ALTO}" fill="#090050"/>
  <rect width="${ANCHO}" height="${ALTO}" fill="url(#brillo)"/>
  <g fill="${color}" fill-opacity="0.22" mask="url(#m)">${rayos}</g>
  <rect x="${110 - 8}" y="${cy - LADO / 2 - 8}" width="${LADO + 16}" height="${LADO + 16}" rx="28" fill="#0b0a4a" stroke="${color}" stroke-width="6"/>
</svg>`);
}

// La imagen del premio en LADO x LADO: la subida en el admin, la miniatura del
// Primal, o el icono de FOG/APE con la cantidad encima.
async function imagenPremio(prize) {
    let fuente = null;
    if (prize.image && /^[a-z0-9-]+-\d{13}\.webp$/.test(prize.image)) fuente = path.join(PREMIOS_DIR, prize.image);
    else if (prize.kind === 'primal' && prize.tokenId) fuente = await primalThumbs.miniatura(prize.tokenId, 192);
    else if (prize.kind === 'fog') fuente = path.join(ICONOS, 'fog.webp');
    else if (prize.kind === 'ape') {
        const n = prize.amount ?? 0;
        fuente = path.join(ICONOS, `${n >= 100 ? '100ape' : n >= 50 ? '50ape' : '10ape'}.webp`);
    }

    const capas = [];
    if (fuente && fs.existsSync(fuente)) {
        const img = await sharp(fuente, { animated: false })
            .resize(LADO - 24, LADO - 24, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
        capas.push({ input: img, left: 12, top: 12 });
    }
    if (prize.kind === 'fog' || prize.kind === 'ape') {
        // La cantidad encima del icono, con una sombra oscura detras: el orbe
        // de FOG es claro y el amarillo solo no se leia.
        const numero = Number(prize.amount ?? 0).toLocaleString('en-US');
        const cantidad = await texto(`<span foreground="#fdf468">${numero}</span>`, { size: 96, width: LADO, align: 'center' });
        const meta = await sharp(cantidad).metadata();
        const sombra = await sharp(await texto(`<span foreground="#090050">${numero}</span>`, { size: 96, width: LADO, align: 'center' }))
            .extend({ top: 20, bottom: 20, left: 20, right: 20, background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .blur(9)
            .png()
            .toBuffer();
        const left = Math.round((LADO - meta.width) / 2);
        const top = Math.round((LADO - meta.height) / 2);
        capas.push({ input: sombra, left: left - 20, top: top - 20 + 4 });
        capas.push({ input: sombra, left: left - 20, top: top - 20 + 4 });
        capas.push({ input: cantidad, left, top });
    }
    return sharp({ create: { width: LADO, height: LADO, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(capas)
        .png()
        .toBuffer();
}

/**
 * Devuelve la ruta del PNG de la tarjeta de un premio (la genera la primera
 * vez). `win` es un premio de stakingWheels; `nombre`, el apodo o la wallet
 * corta; `llave`, el nombre de la key ("LOWKEY").
 */
async function tarjeta(win, { nombre, llave }) {
    if (!ID_REGEX.test(win.id)) throw Object.assign(new Error('Invalid id.'), { status: 404 });
    const destino = path.join(DIR, `${win.id}.png`);
    if (fs.existsSync(destino)) return destino;

    const color = colorRareza(win.chance ?? 1);
    const x = 110 + LADO + 70;
    const ancho = ANCHO - x - 70;
    const [premio, quien, cual, desde, sitio] = await Promise.all([
        imagenPremio(win.prize),
        texto(`<span foreground="#dfe8ff">${escapar(nombre)} won</span>`, { size: 44, width: ancho }),
        texto(`<span foreground="${color === '#8b93c9' ? '#ffffff' : color}">${escapar(win.prize.label)}</span>`, { size: 78, width: ancho }),
        texto(`<span foreground="#dfe8ff">opening a ${escapar(llave)}</span>`, { size: 40, width: ancho }),
        texto('<span foreground="#fdf468">PRIMALCULT.XYZ/STAKING</span>', { size: 34, width: ancho })
    ]);
    const alto = async b => (await sharp(b).metadata()).height;
    const [hQuien, hCual, hDesde] = await Promise.all([alto(quien), alto(cual), alto(desde)]);
    // El bloque de texto centrado en alto, con el sitio abajo.
    const bloque = hQuien + 18 + hCual + 22 + hDesde;
    let y = Math.max(60, Math.round((ALTO - bloque) / 2) - 20);
    const capas = [{ input: premio, left: 110, top: ALTO / 2 - LADO / 2 }];
    capas.push({ input: quien, left: x, top: y });
    y += hQuien + 18;
    capas.push({ input: cual, left: x, top: y });
    y += hCual + 22;
    capas.push({ input: desde, left: x, top: y });
    capas.push({ input: sitio, left: x, top: ALTO - 70 });

    const png = await sharp(fondo(color)).composite(capas).png().toBuffer();
    fs.mkdirSync(DIR, { recursive: true });
    writeAtomic(destino, png);
    return destino;
}

module.exports = { tarjeta, colorRareza };
