// lib/traitThumbs.js
//
// Miniaturas de los traits para las grillas (customizer, panel de admin).
//
// Cada trait es un GIF animado de 2000x2000 que en la grilla se muestra a unos
// 200 px. El navegador igual tiene que decodificar y animar los 2000x2000 de
// cada uno, y con una docena a la vez la pagina laggea. La miniatura es el
// mismo GIF en WebP animado de 256 px: mismos cuadros y mismo ritmo, ~60 veces
// menos pixeles por cuadro, y la transparencia intacta (en JPG las capas
// quedarian con un recuadro de fondo). El preview grande sigue usando el GIF
// original.
//
// Se generan todas en segundo plano al arrancar el server (generarTodas), para
// que nadie tenga que esperar la primera vez; la primera corrida lleva unos
// minutos de CPU y despues solo se chequea que existan. Un trait nuevo subido
// desde /admin se genera en el momento (generarAhora). Y si igual alguien pide
// una que falta, se genera ahi. Si se sube de nuevo el mismo trait, el
// original queda mas nuevo que la miniatura y se regenera sola.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { TRAITS_PATH, GENERATED_DIR } = require('./traitsStore');
const { ASSETS_ROOT, writeAtomic } = require('./assetStore');

const THUMBS_DIR = path.join(ASSETS_ROOT, 'thumbs');

// Dos tamaños:
//   chica   256 px con perdida: las grillas, con celdas chicas y muchas a la
//           vez. Lo que importa es que sean livianas.
//   grande  640 px sin perdida: las previews de las opciones del Forge, que se
//           ven a ~290 px (580 reales en pantallas retina). Con perdida, aun
//           al 95%, los trazos quedaban con artefactos; sin perdida se ven
//           igual que el original.
//   grilla  500 px sin perdida, tomando pixeles: la grilla del customizer.
//           Es el arte en su tamaño real (los GIFs son bloques de 4x4 a 2000
//           px), asi que comprime mucho mejor que la grande: esta, suavizada,
//           pesaba ~720 KB en fondos con ruido.
//   preview 1000 px sin perdida: las capas del preview del customizer, que se
//           ve hasta 500 px (1000 reales en retina). Con el GIF original de
//           2000 px el navegador decodificaba 7 capas de 4 millones de pixeles
//           por cuadro y la pagina se trababa. Se achica tomando pixeles y no
//           promediando: el arte esta hecho en bloques de 4x4, asi que a la
//           mitad quedan bloques de 2x2 identicos, sin bordes suavizados.
// El esfuerzo de compresion de la grande va en 1 y no en 4: sale un 25% mas
// rapida y pesa casi lo mismo (medido sobre 41 traits: 269 ms y 172 KB contra
// 351 ms y 169 KB).
const TAMANOS = {
    chica: { lado: 256, webp: { quality: 70, effort: 4 }, sufijo: '' },
    grande: { lado: 640, webp: { lossless: true, effort: 1 }, sufijo: '.640' },
    grilla: { lado: 500, kernel: 'nearest', webp: { lossless: true, effort: 1 }, sufijo: '.500' },
    preview: { lado: 1000, kernel: 'nearest', webp: { lossless: true, effort: 1 }, sufijo: '.1000' },
};
const LADO = TAMANOS.chica.lado;
const EXTENSIONES = /\.(gif|png|webp)$/i;

// Cuantas se generan a la vez. La primera visita a una grilla pide una docena
// juntas, y sin limite eso son una docena de sharp compitiendo por la CPU del
// server mientras atiende todo lo demas.
const MAX_SIMULTANEAS = 2;
let enCurso = 0;
const esperando = [];

async function conTurno(fn) {
    if (enCurso >= MAX_SIMULTANEAS) await new Promise(res => esperando.push(res));
    enCurso++;
    try {
        return await fn();
    } finally {
        enCurso--;
        esperando.shift()?.();
    }
}

// Si dos pedidos llegan juntos por la misma miniatura, se genera una sola vez.
const generando = new Map();

function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}

// La ruta del trait original, validada: tiene que ser una imagen dentro de
// TRAITS_PATH y fuera de _generated (ahi viven metadata e imagenes de NFTs,
// que no son traits).
function rutaOriginal(relativa) {
    const limpia = path.normalize(decodeURIComponent(String(relativa || ''))).replace(/^([/\\])+/, '');
    if (!EXTENSIONES.test(limpia)) throw httpError(404, 'No es una imagen de trait.');
    const original = path.resolve(TRAITS_PATH, limpia);
    const raiz = path.resolve(TRAITS_PATH) + path.sep;
    if (!original.startsWith(raiz)) throw httpError(404, 'Ruta invalida.');
    if (path.relative(raiz, original).split(path.sep)[0] === GENERATED_DIR) {
        throw httpError(404, 'Ruta invalida.');
    }
    return { original, relativa: path.relative(raiz, original) };
}

function mtime(archivo) {
    try {
        return fs.statSync(archivo).mtimeMs;
    } catch {
        return null;
    }
}

// Devuelve la ruta en disco de la miniatura, generandola si hace falta.
async function miniatura(relativa, tamano = 'chica') {
    const config = TAMANOS[tamano];
    if (!config) throw httpError(404, 'Tamaño de miniatura invalido.');
    const { original, relativa: rel } = rutaOriginal(relativa);
    const fuente = mtime(original);
    if (fuente === null) throw httpError(404, 'Ese trait no existe.');

    const destino = path.join(THUMBS_DIR, `${rel}${config.sufijo}.webp`);
    const hecha = mtime(destino);
    if (hecha !== null && hecha >= fuente) return destino;

    if (!generando.has(destino)) {
        const trabajo = conTurno(async () => {
            // Se le pasa el contenido y no la ruta: con la ruta, sharp deja el
            // archivo abierto en su cache, y en Windows eso impide reemplazar
            // el trait desde /admin.
            const webp = await sharp(fs.readFileSync(original), { animated: true })
                .resize(config.lado, config.lado, {
                    fit: 'inside',
                    withoutEnlargement: true,
                    kernel: config.kernel,
                })
                .webp(config.webp)
                .toBuffer();
            fs.mkdirSync(path.dirname(destino), { recursive: true });
            writeAtomic(destino, webp);
            return destino;
        }).finally(() => generando.delete(destino));
        generando.set(destino, trabajo);
    }
    return generando.get(destino);
}

// Rutas relativas de todos los traits, fuera de _generated.
function listarTraits(dir = TRAITS_PATH, base = '') {
    const out = [];
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = base ? `${base}/${entrada.name}` : entrada.name;
        if (entrada.isDirectory()) {
            if (!base && entrada.name === GENERATED_DIR) continue;
            out.push(...listarTraits(path.join(dir, entrada.name), rel));
        } else if (EXTENSIONES.test(entrada.name)) {
            out.push(rel);
        }
    }
    return out;
}

// Las dos miniaturas de un trait, ya. Para lo que se sube desde /admin.
function generarAhora(relativa) {
    for (const tamano of Object.keys(TAMANOS)) {
        miniatura(relativa, tamano).catch(error => console.error('[thumbs]', relativa, error.message));
    }
}

// Genera las que falten, de a una: se espera cada una antes de pedir la
// siguiente, asi un pedido real nunca queda detras de mas de una en la cola.
// Primero las del preview y las grandes, que son las que se ven mas grandes.
async function generarTodas() {
    const inicio = Date.now();
    let hechas = 0;
    let revisadas = 0;
    for (const tamano of ['preview', 'grilla', 'grande', 'chica']) {
        for (const rel of listarTraits()) {
            revisadas++;
            try {
                const destino = path.join(THUMBS_DIR, `${rel}${TAMANOS[tamano].sufijo}.webp`);
                const antes = mtime(destino);
                await miniatura(rel, tamano);
                if (mtime(destino) !== antes) hechas++;
            } catch (error) {
                console.error('[thumbs]', rel, error.message);
            }
        }
    }
    if (hechas) {
        console.log(`[thumbs] ${hechas} miniaturas generadas en ${Math.round((Date.now() - inicio) / 1000)} s (${revisadas} revisadas).`);
    }
}

// GET /assets/thumbs/<la misma ruta que en /assets/traits>[?t=grande]
async function servirMiniatura(req, res) {
    try {
        const archivo = await miniatura(req.params[0], req.query.t || 'chica');
        // Una hora de cache y despues se revalida: si un trait se reemplaza
        // desde /admin, la miniatura nueva llega en ese rato.
        res.set('Cache-Control', 'public, max-age=3600');
        res.type('image/webp').sendFile(archivo);
    } catch (error) {
        if (!error.status) console.error('[thumbs]', error);
        res.status(error.status || 500).end();
    }
}

module.exports = { miniatura, servirMiniatura, generarTodas, generarAhora, listarTraits, THUMBS_DIR, LADO, TAMANOS };
