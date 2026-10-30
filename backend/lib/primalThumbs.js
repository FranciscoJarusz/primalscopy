// Miniaturas de los Primals para el mapa de /staking, que muestra a todos los
// que estan entrenando dispersos en su region: pueden ser cientos a la vez.
//
// Cada Primal es un GIF animado de 2000x2000 de ~530 KB; 600 serian ~300 MB.
// La miniatura es el primer cuadro en WebP estatico de 96 px: ~4 KB.
//
// Sale del servidor de origen, que es la verdad (el dueño cambia NFTs ahi sin
// pasar por este server); la copia local (assetStore.IMAGES_DIR) queda de
// respaldo, salvo donde no se publica (local o pruebas del Forge). Cada 6 horas
// se pregunta al origen si cambio, sin bajar el GIF si no cambio. Si regenerar
// falla, se sirve la vieja.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const assets = require('./assetStore');

const DIR = path.join(assets.ASSETS_ROOT, 'staking-thumbs');
// 96 para el mapa; 192 para la grilla del panel de la region, que los
// muestra a ~80 px (160 reales en pantallas retina).
const LADO = 96;
const LADOS = [96, 192, 384, 512];
const ORIGIN_URL = (process.env.ORIGIN_ASSETS_URL || 'https://ipfs.primalcult.xyz').trim().replace(/\/+$/, '');
const VIDA_REMOTA_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 30000;
const TOKEN_ID_REGEX = /^\d{1,10}$/;

// El origen es un hosting compartido que no es nuestro: pocas a la vez.
const MAX_SIMULTANEAS = 3;
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

function mtime(archivo) {
    try {
        return fs.statSync(archivo).mtimeMs;
    } catch {
        return null;
    }
}

const desdeOrigen = tokenId => !assets.hasImage(tokenId) || require('./metadataSync').syncEnabled(tokenId);

function leerMeta(destino) {
    try {
        return JSON.parse(fs.readFileSync(`${destino}.json`, 'utf8'));
    } catch {
        return null;
    }
}

async function delOrigen(tokenId, meta) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const headers = {};
    if (meta?.etag) headers['If-None-Match'] = meta.etag;
    if (meta?.lastModified) headers['If-Modified-Since'] = meta.lastModified;
    try {
        const respuesta = await fetch(`${ORIGIN_URL}/images/${tokenId}.gif`, { signal: controller.signal, headers });
        if (respuesta.status === 304) return { sinCambios: true };
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return {
            buffer: Buffer.from(await respuesta.arrayBuffer()),
            meta: { etag: respuesta.headers.get('etag'), lastModified: respuesta.headers.get('last-modified') }
        };
    } finally {
        clearTimeout(timer);
    }
}

// La copia local mas nueva que la miniatura: el Primal se acaba de guardar
// en este server y el origen puede no tenerlo todavia.
const localMasNueva = (tokenId, destino) =>
    assets.hasImage(tokenId) && mtime(assets.imagePath(tokenId)) > (mtime(destino) ?? 0);

async function original(tokenId, destino) {
    if (!desdeOrigen(tokenId)) return { buffer: fs.readFileSync(assets.imagePath(tokenId)) };
    if (destino && localMasNueva(tokenId, destino)) {
        return { buffer: fs.readFileSync(assets.imagePath(tokenId)), meta: leerMeta(destino) ?? {} };
    }
    try {
        return await delOrigen(tokenId, mtime(destino) !== null ? leerMeta(destino) : null);
    } catch (error) {
        if (assets.hasImage(tokenId)) return { buffer: fs.readFileSync(assets.imagePath(tokenId)) };
        throw error;
    }
}

function vencida(tokenId, destino) {
    const hecha = mtime(destino);
    if (hecha === null) return true;
    if (!desdeOrigen(tokenId)) return mtime(assets.imagePath(tokenId)) > hecha;
    if (assets.hasImage(tokenId) && !leerMeta(destino)) return true;
    if (localMasNueva(tokenId, destino)) return true;
    return Date.now() - hecha > VIDA_REMOTA_MS;
}

// Devuelve la ruta en disco de la miniatura, generandola si hace falta.
async function miniatura(tokenId, lado = LADO) {
    const id = String(tokenId);
    if (!TOKEN_ID_REGEX.test(id)) throw Object.assign(new Error('Token invalido.'), { status: 404 });
    if (!LADOS.includes(lado)) throw Object.assign(new Error('Tamaño invalido.'), { status: 404 });
    const destino = path.join(DIR, lado === LADO ? `${id}.webp` : `${id}.${lado}.webp`);
    if (!vencida(id, destino)) return destino;

    if (!generando.has(destino)) {
        const trabajo = conTurno(async () => {
            const fuente = await original(id, destino);
            if (fuente.sinCambios) {
                const ahora = new Date();
                fs.utimesSync(destino, ahora, ahora);
                return destino;
            }
            const webp = await sharp(fuente.buffer)
                .resize(lado, lado, { fit: 'cover' })
                .webp({ quality: 80 })
                .toBuffer();
            fs.mkdirSync(DIR, { recursive: true });
            assets.writeAtomic(destino, webp);
            if (fuente.meta) assets.writeAtomic(`${destino}.json`, JSON.stringify(fuente.meta));
            return destino;
        })
            .catch(error => {
                // Mejor una vieja que ninguna.
                if (mtime(destino) !== null) return destino;
                throw error;
            })
            .finally(() => generando.delete(destino));
        generando.set(destino, trabajo);
    }
    return generando.get(destino);
}

async function descarga(tokenId, formato) {
    const id = String(tokenId);
    if (!TOKEN_ID_REGEX.test(id)) throw Object.assign(new Error('Token invalido.'), { status: 404 });
    const { buffer } = await conTurno(() => original(id, null));
    return formato === 'png' ? sharp(buffer).png().toBuffer() : buffer;
}

// GET /api/staking/primal/:tokenId.webp
async function servirMiniatura(req, res) {
    try {
        const archivo = await miniatura(req.params.tokenId, req.query.t ? Number(req.query.t) : LADO);
        // Cinco minutos: un Primal recien guardado (por ejemplo con un Addon)
        // tiene que verse pronto en el perfil.
        res.set('Cache-Control', 'public, max-age=300');
        res.type('image/webp').sendFile(archivo);
    } catch (error) {
        res.status(error.status || 502).json({ error: "Couldn't load that Primal." });
    }
}

// Genera en segundo plano las que faltan (al arrancar y al poner Primals a
// entrenar), para que nadie las espere al abrir el mapa. Solo con el server
// lanzado directo (ver server.js): los tests no tienen por que salir a buscar
// imagenes al origen.
let precalentado = false;
function habilitarPrecalentado() {
    precalentado = true;
}

function precalentar(tokenIds, lado = LADO) {
    if (!precalentado) return;
    for (const id of tokenIds) {
        miniatura(id, lado).catch(error => console.error(`[staking-thumbs] #${id}:`, error.message));
    }
}

let recorriendo = false;
async function precalentarFaltantes(tokenIds, lado = LADO) {
    if (!precalentado || recorriendo) return;
    recorriendo = true;
    try {
        for (const id of tokenIds) {
            if (mtime(path.join(DIR, lado === LADO ? `${id}.webp` : `${id}.${lado}.webp`)) !== null) continue;
            await miniatura(id, lado).catch(error => console.error(`[staking-thumbs] #${id}:`, error.message));
        }
    } finally {
        recorriendo = false;
    }
}

module.exports = { miniatura, descarga, servirMiniatura, precalentar, precalentarFaltantes, habilitarPrecalentado, LADO };
