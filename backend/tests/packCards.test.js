// Prueba que la lista de cartas de los packs (lib/packCards.js) coincida con el
// arte: cada carta tiene dibujados arriba tantos rombos como su rareza, y una
// insignia con el color de su categoria. Si alguien cambia una imagen y no la
// lista (o al reves), esto lo marca antes de subir.
//
// Correr con: npm test

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { CARTAS, RAREZAS } = require('../lib/packCards');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok   ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

const CARPETAS = [
    path.join(__dirname, '..', 'assets', 'packs', 'cards'),
    path.join(__dirname, '..', '..', 'web', 'public', 'packs', 'cards'),
    path.join(__dirname, '..', '..', 'web', 'public', 'packs', 'cards', 'sm'),
].filter(d => fs.existsSync(d));

// Las legendary y la chosen tienen insignias con diseno propio: en esas solo
// se miran los rombos.
const CATEGORIAS = {
    Fogreach: [30, 94, 72],
    Otherside: [152, 133, 93],
    Community: [165, 113, 26],
    Primal: [77, 113, 180],
    Mythic: [158, 40, 220],
    Exiled: [144, 60, 61],
    Wardens: [48, 92, 114],
};

async function leer(archivo) {
    const { data, info } = await sharp(archivo).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, W: info.width, H: info.height };
}

function rombos({ data, W, H }) {
    const blanco = new Array(W).fill(false);
    for (let y = Math.round(H * 0.02); y < Math.round(H * 0.05); y++) {
        for (let x = Math.round(W * 0.3); x < Math.round(W * 0.65); x++) {
            const i = (y * W + x) * 3;
            if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) blanco[x] = true;
        }
    }
    const minimo = W * 0.01;
    let n = 0;
    let desde = -1;
    for (let x = 0; x <= W; x++) {
        if (blanco[x] && desde < 0) desde = x;
        if (!blanco[x] && desde >= 0) {
            if (x - desde >= minimo) n++;
            desde = -1;
        }
    }
    return n;
}

function colorInsignia({ data, W, H }) {
    const canales = [[], [], []];
    for (let y = Math.round(H * 0.035); y < Math.round(H * 0.065); y++) {
        for (let x = Math.round(W * 0.665); x < Math.round(W * 0.84); x++) {
            const i = (y * W + x) * 3;
            const px = [data[i], data[i + 1], data[i + 2]];
            if (Math.min(...px) > 200 || Math.max(...px) < 40) continue;
            px.forEach((v, k) => canales[k].push(v));
        }
    }
    return canales.map(c => c.sort((a, b) => a - b)[c.length >> 1]);
}

function categoriaDe(color) {
    let mejor = null;
    let distancia = Infinity;
    for (const [nombre, ref] of Object.entries(CATEGORIAS)) {
        const d = Math.hypot(...ref.map((v, k) => v - color[k]));
        if (d < distancia) [mejor, distancia] = [nombre, d];
    }
    return distancia < 30 ? mejor : null;
}

(async () => {
    console.log('\n--- La lista ---');
    check('las ids van de 1 en adelante sin huecos', CARTAS.every((c, i) => c.id === i + 1));
    check('hay una sola Chosen', CARTAS.filter(c => c.rarity === 'chosen').length === 1);

    for (const carpeta of CARPETAS) {
        console.log(`\n--- ${path.relative(path.join(__dirname, '..', '..'), carpeta)} ---`);
        const sobran = fs.readdirSync(carpeta).filter(f => /^MW\d+\.webp$/.test(f) && !CARTAS.some(c => f === archivoDe(c)));
        check('no hay imagenes de cartas que no esten en la lista', sobran.length === 0, `(${sobran.join(', ')})`);
        const malas = [];
        for (const c of CARTAS) {
            const archivo = path.join(carpeta, archivoDe(c));
            if (!fs.existsSync(archivo)) {
                malas.push(`#${c.id} sin imagen`);
                continue;
            }
            const img = await leer(archivo);
            const tier = RAREZAS.indexOf(c.rarity) + 1;
            const n = rombos(img);
            if (n !== tier) malas.push(`#${c.id} ${c.name}: ${n} rombos en la imagen, ${c.rarity} en la lista`);
            if (tier > 4) continue;
            const cat = categoriaDe(colorInsignia(img));
            if (cat !== c.category) malas.push(`#${c.id} ${c.name}: insignia ${cat ?? 'desconocida'}, ${c.category} en la lista`);
        }
        check(`las ${CARTAS.length} cartas coinciden con su arte`, malas.length === 0, `\n        ${malas.join('\n        ')}`);
    }

    console.log(`\n${pass} ok, ${fail} fallas`);
    process.exit(fail ? 1 : 0);
})();

function archivoDe(c) {
    return `MW${String(c.id).padStart(2, '0')}.webp`;
}
