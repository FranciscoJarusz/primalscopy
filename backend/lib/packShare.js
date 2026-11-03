const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { guardar } = require('./ogCards');

const ANCHO = 1200;
const ALTO = 630;
const MARGEN = 84;
const ASSETS = path.join(__dirname, '..', 'assets');
const CARTAS_DIR = path.join(ASSETS, 'packs', 'cards');
const TITULO = { fontfile: path.join(ASSETS, 'fonts', 'Marcellus-Regular.ttf'), familia: 'Marcellus' };
const ETIQUETA = { fontfile: path.join(ASSETS, 'fonts', 'BarlowCondensed-SemiBold.ttf'), familia: 'Barlow Condensed SemiBold' };

const CHAMPAGNE = '#aea35d';
const MIST = '#dcd7b7';
const CREMA = '#ece3a8';

const RAREZAS = {
    chosen: { nombre: 'THE CHOSEN', color: '#ffe27a', brillo: '#fff6c8', titulo: 'CHOSEN\nBY THE FOG' },
    legendary: { nombre: 'LEGENDARY', color: '#f3dd85', brillo: '#fff2a8', titulo: 'A LEGEND\nIN THE FOG' },
    epic: { nombre: 'EPIC', color: CHAMPAGNE, brillo: '#c9bb6c', titulo: 'SHINING IN\nTHE FOG' },
    rare: { nombre: 'RARE', color: MIST, brillo: MIST, titulo: 'A RARE FIND\nIN THE FOG' },
    uncommon: { nombre: 'UNCOMMON', color: '#a6a28a', brillo: '#8a8770', titulo: 'FRESH OUT\nOF THE FOG' },
    common: { nombre: 'COMMON', color: '#6e6c5c', brillo: '#6e6c5c', titulo: 'FRESH OUT\nOF THE FOG' },
};
const ORDEN = ['chosen', 'legendary', 'epic', 'rare', 'uncommon', 'common'];

const escapar = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function texto(markup, { fuente, size, width, align = 'left', spacing = 0 }) {
    return sharp({
        text: {
            text: markup,
            font: `${fuente.familia} ${size}`,
            fontfile: fuente.fontfile,
            rgba: true,
            width,
            align,
            dpi: 72,
            spacing,
        },
    }).png().toBuffer();
}

const color = (t, c, espaciado = 0) =>
    `<span foreground="${c}"${espaciado ? ` letter_spacing="${espaciado * 1024}"` : ''}>${escapar(t)}</span>`;

const medidas = async buffer => sharp(buffer).metadata();

async function carta(id, alto, grados) {
    const archivo = path.join(CARTAS_DIR, `MW${String(id).padStart(2, '0')}.webp`);
    const ancho = Math.round((alto * 300) / 416);
    const radio = Math.round(ancho * 0.05);
    const mascara = Buffer.from(`<svg width="${ancho}" height="${alto}"><rect width="${ancho}" height="${alto}" rx="${radio}" fill="#fff"/></svg>`);
    const recortada = await sharp(fs.readFileSync(archivo))
        .resize(ancho, alto, { fit: 'cover' })
        .composite([{ input: mascara, blend: 'dest-in' }])
        .png()
        .toBuffer();
    if (!grados) return recortada;
    return sharp(recortada).rotate(grados, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

function fondo(cx, cy, brillo, intensidad) {
    const rayos = Array.from({ length: 36 }, (_, i) => {
        const a = (i / 36) * Math.PI * 2;
        const b = a + Math.PI / 90;
        const r = 1400;
        return `<polygon points="${cx},${cy} ${cx + Math.cos(a) * r},${cy + Math.sin(a) * r} ${cx + Math.cos(b) * r},${cy + Math.sin(b) * r}"/>`;
    }).join('');
    return Buffer.from(`<svg width="${ANCHO}" height="${ALTO}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="halo" cx="${cx}" cy="${cy}" r="420" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="${brillo}" stop-opacity="${0.55 * intensidad}"/>
                <stop offset="0.45" stop-color="${brillo}" stop-opacity="${0.12 * intensidad}"/>
                <stop offset="1" stop-color="${brillo}" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="desvanecer" cx="${cx}" cy="${cy}" r="560" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#fff" stop-opacity="1"/>
                <stop offset="1" stop-color="#fff" stop-opacity="0"/>
            </radialGradient>
            <mask id="m"><rect width="${ANCHO}" height="${ALTO}" fill="url(#desvanecer)"/></mask>
        </defs>
        <rect width="${ANCHO}" height="${ALTO}" fill="#000"/>
        <g mask="url(#m)" fill="${MIST}" fill-opacity="${0.05 + 0.07 * intensidad}">${rayos}</g>
        <rect width="${ANCHO}" height="${ALTO}" fill="url(#halo)"/>
        <rect x="28" y="28" width="${ANCHO - 56}" height="${ALTO - 56}" rx="16" fill="none" stroke="${CHAMPAGNE}" stroke-opacity="0.45" stroke-width="1.5"/>
        <rect x="34" y="34" width="${ANCHO - 68}" height="${ALTO - 68}" rx="12" fill="none" stroke="${CHAMPAGNE}" stroke-opacity="0.18" stroke-width="1"/>
    </svg>`);
}

async function aura(alto, brillo) {
    const ancho = Math.round((alto * 300) / 416);
    const extra = 60;
    const svg = Buffer.from(`<svg width="${ancho + extra * 2}" height="${alto + extra * 2}"><rect x="${extra}" y="${extra}" width="${ancho}" height="${alto}" rx="14" fill="${brillo}"/></svg>`);
    return sharp(svg).blur(22).png().toBuffer();
}

async function generar(pull) {
    const cartas = [...pull.cards].sort((a, b) => ORDEN.indexOf(a.rarity) - ORDEN.indexOf(b.rarity));
    const mejor = RAREZAS[cartas[0].rarity];
    const intensidad = { chosen: 1, legendary: 1, epic: 0.8, rare: 0.55, uncommon: 0.3, common: 0.25 }[cartas[0].rarity];

    const cx = 815;
    const cy = 318;
    const lugares = [
        { orden: 0, dx: 0, alto: 400, grados: 0 },
        { orden: 1, dx: -128, alto: 330, grados: -7 },
        { orden: 2, dx: 128, alto: 330, grados: 7 },
        { orden: 3, dx: -226, alto: 290, grados: -14 },
        { orden: 4, dx: 226, alto: 290, grados: 14 },
    ];

    const capas = [];
    for (const lugar of [...lugares].reverse()) {
        const c = cartas[lugar.orden];
        if (!c) continue;
        const img = await carta(c.id, lugar.alto, lugar.grados);
        const { width, height } = await medidas(img);
        const caida = Math.abs(lugar.dx) * 0.12;
        if (lugar.orden === 0 && intensidad >= 0.5) {
            const halo = await aura(lugar.alto, RAREZAS[c.rarity].brillo);
            const m = await medidas(halo);
            capas.push({ input: halo, left: Math.round(cx - m.width / 2), top: Math.round(cy - m.height / 2) });
        }
        capas.push({ input: img, left: Math.round(cx + lugar.dx - width / 2), top: Math.round(cy + caida - height / 2) });
    }

    const anchoTexto = 440;
    const conteo = ORDEN.map(r => [r, pull.cards.filter(c => c.rarity === r).length]).filter(([, n]) => n);
    const linea = ([r, n]) => `${color('◆', RAREZAS[r].color)}  ${color(`${n} ${RAREZAS[r].nombre}`, MIST, 2)}`;
    const mitad = Math.ceil(conteo.length / 2);
    const columnas = [conteo.slice(0, mitad), conteo.slice(mitad)].filter(c => c.length);
    const nombre = pull.nickname ? pull.nickname.toUpperCase() : null;

    const [etiqueta, titulo, puntos, firma, sitio, ...listas] = await Promise.all([
        texto(color('PRIMAL CULT × MUDWATER', CHAMPAGNE, 4), { fuente: ETIQUETA, size: 22, width: anchoTexto }),
        texto(color(mejor.titulo, CREMA), { fuente: TITULO, size: 62, width: anchoTexto, spacing: -8 }),
        texto(color(`+${pull.points} POINTS`, mejor.color), { fuente: TITULO, size: 40, width: anchoTexto }),
        nombre ? texto(color(`RIPPED BY ${nombre}`, MIST, 2), { fuente: ETIQUETA, size: 22, width: anchoTexto }) : null,
        texto(color('PRIMALCULT.XYZ/MUDWATER', CHAMPAGNE, 3), { fuente: ETIQUETA, size: 22, width: anchoTexto }),
        ...columnas.map(c => texto(c.map(linea).join('\n'), { fuente: ETIQUETA, size: 22, width: 200, spacing: 8 })),
    ]);
    const altosListas = await Promise.all(listas.map(l => medidas(l).then(m => m.height)));
    const lista = await sharp({
        create: { width: anchoTexto, height: Math.max(...altosListas), channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
        .composite(listas.map((l, i) => ({ input: l, left: i * 200, top: 0 })))
        .png()
        .toBuffer();

    const bloques = [
        { img: etiqueta, despues: 18 },
        { img: titulo, despues: 30 },
        { img: lista, despues: 26 },
        { img: puntos, despues: 0 },
    ];
    const altos = await Promise.all(bloques.map(b => medidas(b.img).then(m => m.height)));
    const total = altos.reduce((s, h, i) => s + h + bloques[i].despues, 0);
    let y = Math.round((ALTO - total) / 2) - 16;
    bloques.forEach((b, i) => {
        capas.push({ input: b.img, left: MARGEN, top: y });
        y += altos[i] + b.despues;
    });

    const altoSitio = (await medidas(sitio)).height;
    capas.push({ input: sitio, left: MARGEN, top: ALTO - 64 - altoSitio });
    if (firma) {
        const altoFirma = (await medidas(firma)).height;
        capas.push({ input: firma, left: MARGEN, top: ALTO - 64 - altoSitio - 6 - altoFirma });
    }

    return sharp(fondo(cx, cy, mejor.brillo, intensidad)).composite(capas).png().toBuffer();
}

function tarjetaPack(pull) {
    const datos = { v: 1, cards: pull.cards.map(c => [c.id, c.rarity]), points: pull.points, nickname: pull.nickname };
    return guardar(`pack-${pull.id}`, datos, () => generar(pull));
}

module.exports = { tarjetaPack, generar };
