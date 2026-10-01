// tests/gifComposer.test.js
//
// El armado del GIF final avanza cada capa cuadro por cuadro con un solo
// lienzo, en vez de guardar una copia por cuadro (asi no ocupa ~1,8 GB). Este
// test comprueba que el resultado sea el mismo que con el metodo anterior
// (renderLayerFrames), incluidos los casos que la coleccion real no tiene hoy:
// capas de distinta cantidad de cuadros que vuelven a empezar en distintos
// momentos, y cuadros que borran su zona antes del siguiente (disposal 2).
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');
const { GIFEncoder } = require('gifenc');
const {
    composeGif,
    loadLayer,
    renderLayerFrames,
    compositeOver,
    abrirCapa,
    componerCuadros
} = require('../lib/gifComposer');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-gif-'));
const SIZE = 12;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

// Un GIF de SIZE x SIZE. Cada cuadro pinta un rectangulo de un color (indice
// 1..3) sobre transparente (indice 0), en una posicion distinta.
function crearGif(nombre, cuadros, dispose) {
    const palette = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]];
    const enc = GIFEncoder();
    cuadros.forEach(({ color, x, y, w, h }, i) => {
        const indices = new Uint8Array(SIZE * SIZE);
        for (let fy = y; fy < y + h; fy++) {
            for (let fx = x; fx < x + w; fx++) indices[fy * SIZE + fx] = color;
        }
        enc.writeFrame(indices, SIZE, SIZE, {
            palette,
            transparent: true,
            transparentIndex: 0,
            dispose,
            delay: 100,
            ...(i === 0 ? { repeat: 0 } : {})
        });
    });
    enc.finish();
    const archivo = path.join(TMP, nombre);
    fs.writeFileSync(archivo, Buffer.from(enc.bytes()));
    return archivo;
}

// Lo que hacia composeGif antes: todos los cuadros de cada capa precalculados.
function metodoAnterior(archivos, total) {
    const rendered = archivos.map(a => renderLayerFrames(loadLayer(a)));
    const salida = [];
    for (let i = 0; i < total; i++) {
        const out = new Uint8ClampedArray(SIZE * SIZE * 4);
        for (const r of rendered) compositeOver(out, r[i % r.length]);
        salida.push(out);
    }
    return salida;
}

const iguales = (a, b) => a.length === b.length && a.every((f, i) => Buffer.compare(Buffer.from(f), Buffer.from(b[i])) === 0);

function main() {
    const fondo = crearGif('fondo.gif', [{ color: 1, x: 0, y: 0, w: SIZE, h: SIZE }], 1);
    // 2 cuadros que se borran antes del siguiente (disposal 2).
    const dos = crearGif('dos.gif', [
        { color: 2, x: 1, y: 1, w: 4, h: 4 },
        { color: 3, x: 6, y: 6, w: 4, h: 4 }
    ], 2);
    // 3 cuadros que se acumulan (disposal 1).
    const tres = crearGif('tres.gif', [
        { color: 3, x: 0, y: 0, w: 3, h: 3 },
        { color: 2, x: 3, y: 3, w: 3, h: 3 },
        { color: 1, x: 8, y: 1, w: 2, h: 5 }
    ], 1);

    console.log('\n--- Mismo resultado que el metodo anterior ---');
    for (const [nombre, capas] of [
        ['estatica + 2 cuadros + 3 cuadros (vuelven a empezar en distinto momento)', [fondo, dos, tres]],
        ['3 cuadros + 2 cuadros', [tres, dos]],
        ['solo estatica', [fondo]],
        ['2 cuadros sola', [dos]]
    ]) {
        const total = Math.max(...capas.map(a => loadLayer(a).frames.length));
        // Mas cuadros que los de la capa mas larga, para forzar varias vueltas.
        const vueltas = total * 3;
        const nuevo = componerCuadros(capas.map(abrirCapa), vueltas);
        check(nombre, iguales(nuevo, metodoAnterior(capas, vueltas)));
    }

    console.log('\n--- El GIF completo ---');
    const gif = composeGif([fondo, dos, tres], { size: SIZE });
    check('composeGif arma un GIF valido', gif.subarray(0, 6).toString() === 'GIF89a');
    let error = null;
    try {
        composeGif([fondo], { size: SIZE + 1 });
    } catch (e) {
        error = e;
    }
    check('una capa de otro tamaño da un error claro', /se esperaba/.test(error?.message || ''));

    console.log(`\n${pass} ok, ${fail} fallas`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
}

main();
