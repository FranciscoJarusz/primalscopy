// tests/traitThumbs.test.js
//
// Prueba las miniaturas de traits: que salgan animadas y chicas, que se
// guarden y no se regeneren de gusto, que se regeneren si el trait original
// cambia, y que no se pueda pedir nada fuera de la carpeta de traits.
//
// Correr con: npm test

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'primal-thumbs-'));
process.env.TRAITS_PATH = TMP;

const { miniatura, generarTodas, listarTraits, THUMBS_DIR, LADO } = require('../lib/traitThumbs');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => ok
    ? (pass++, console.log(`  ok    ${name}`))
    : (fail++, console.log(`  FALLA ${name} ${detail}`));

async function rechaza(ruta, tamano) {
    try {
        await miniatura(ruta, tamano);
        return false;
    } catch (error) {
        return error.status === 404;
    }
}

// Un GIF animado de 3 cuadros de 600x600, con transparencia.
async function crearGif(destino) {
    const cuadros = [];
    for (const color of [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 0]]) {
        cuadros.push(await sharp({ create: { width: 600, height: 600, channels: 4, background: { r: color[0], g: color[1], b: color[2], alpha: color[3] / 255 } } }).png().toBuffer());
    }
    const gif = await sharp(cuadros, { join: { animated: true } }).gif({ delay: [100, 100, 100] }).toBuffer();
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, gif);
}

async function main() {
    const original = path.join(TMP, 'HAT', 'SPIKES', 'SPIKES-01.gif');
    await crearGif(original);
    fs.mkdirSync(path.join(TMP, '_generated', 'metadata'), { recursive: true });
    fs.writeFileSync(path.join(TMP, '_generated', 'metadata', 'foto.gif'), 'no es un trait');
    fs.writeFileSync(path.join(TMP, 'HAT', 'notas.txt'), 'hola');

    console.log('\n--- Generar ---');
    const archivo = await miniatura('HAT/SPIKES/SPIKES-01.gif');
    check('queda guardada en la carpeta de miniaturas',
        archivo === path.join(THUMBS_DIR, 'HAT', 'SPIKES', 'SPIKES-01.gif.webp') && fs.existsSync(archivo), archivo);
    const meta = await sharp(fs.readFileSync(archivo), { animated: true }).metadata();
    check('es WebP', meta.format === 'webp', meta.format);
    check('sigue animada, con los mismos cuadros', meta.pages === 3, `(${meta.pages})`);
    check(`mide ${LADO} px`, meta.width === LADO && meta.pageHeight === LADO, `(${meta.width}x${meta.pageHeight})`);
    check('conserva la transparencia', meta.hasAlpha === true);
    check('pesa menos que el original', fs.statSync(archivo).size < fs.statSync(original).size);

    const grande = await miniatura('HAT/SPIKES/SPIKES-01.gif', 'grande');
    const metaGrande = await sharp(fs.readFileSync(grande), { animated: true }).metadata();
    check('la grande es otro archivo', grande !== archivo && grande.endsWith('SPIKES-01.gif.640.webp'), grande);
    check('la grande no se agranda (el original mide 600)', metaGrande.width === 600 && metaGrande.pages === 3,
        `(${metaGrande.width}, ${metaGrande.pages})`);
    const grilla = await miniatura('HAT/SPIKES/SPIKES-01.gif', 'grilla');
    const metaGrilla = await sharp(fs.readFileSync(grilla), { animated: true }).metadata();
    check('la de grilla es otro archivo', grilla.endsWith('SPIKES-01.gif.500.webp'), grilla);
    check('la de grilla mide 500, animada y sin perdida',
        metaGrilla.width === 500 && metaGrilla.pages === 3 && fs.readFileSync(grilla).includes('VP8L'),
        `(${metaGrilla.width} px, ${metaGrilla.pages} cuadros)`);
    const preview = await miniatura('HAT/SPIKES/SPIKES-01.gif', 'preview');
    const metaPreview = await sharp(fs.readFileSync(preview), { animated: true }).metadata();
    check('la del preview es otro archivo', preview.endsWith('SPIKES-01.gif.1000.webp'), preview);
    check('la del preview sigue animada y no se agranda', metaPreview.pages === 3 && metaPreview.width === 600,
        `(${metaPreview.pages} cuadros, ${metaPreview.width} px)`);
    check('la del preview es sin perdida', fs.readFileSync(preview).includes('VP8L'));
    check('un tamaño inventado -> 404', await rechaza('HAT/SPIKES/SPIKES-01.gif', 'enorme'));

    console.log('\n--- Cache ---');
    const antes = fs.statSync(archivo).mtimeMs;
    await new Promise(res => setTimeout(res, 20));
    await miniatura('HAT/SPIKES/SPIKES-01.gif');
    check('pedirla otra vez no la regenera', fs.statSync(archivo).mtimeMs === antes);

    const [a, b] = await Promise.all([miniatura('HAT/SPIKES/SPIKES-01.gif'), miniatura('HAT/SPIKES/SPIKES-01.gif')]);
    check('dos pedidos juntos dan el mismo archivo', a === b);

    // El admin sube de nuevo el trait: el original queda mas nuevo.
    const futuro = new Date(Date.now() + 60_000);
    fs.utimesSync(original, futuro, futuro);
    await miniatura('HAT/SPIKES/SPIKES-01.gif');
    check('si el original cambia, se regenera', fs.statSync(archivo).mtimeMs > antes);

    console.log('\n--- Generar todas al arrancar ---');
    const otro = path.join(TMP, 'FACE', 'GRIN', 'GRIN-01.gif');
    await crearGif(otro);
    check('lista los traits y no lo de _generated',
        JSON.stringify(listarTraits().sort()) === JSON.stringify(['FACE/GRIN/GRIN-01.gif', 'HAT/SPIKES/SPIKES-01.gif']),
        JSON.stringify(listarTraits()));
    await generarTodas();
    const chicaNueva = path.join(THUMBS_DIR, 'FACE', 'GRIN', 'GRIN-01.gif.webp');
    const grandeNueva = path.join(THUMBS_DIR, 'FACE', 'GRIN', 'GRIN-01.gif.640.webp');
    check('genera las dos miniaturas de lo que faltaba', fs.existsSync(chicaNueva) && fs.existsSync(grandeNueva));
    const mtimes = () => [chicaNueva, grandeNueva].map(f => fs.statSync(f).mtimeMs).join();
    const primera = mtimes();
    await generarTodas();
    check('una segunda corrida no regenera nada', mtimes() === primera);

    console.log('\n--- Rutas que no valen ---');
    check('un trait que no existe -> 404', await rechaza('HAT/SPIKES/NO-EXISTE.gif'));
    check('algo que no es imagen -> 404', await rechaza('HAT/notas.txt'));
    check('salir de la carpeta con .. -> 404', await rechaza('../../etc/passwd.gif'));
    check('.. codificado -> 404', await rechaza('%2e%2e/%2e%2e/secreto.gif'));
    check('lo de _generated no es un trait -> 404', await rechaza('_generated/metadata/foto.gif'));

    console.log(`\n${pass} ok, ${fail} fallas`);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
