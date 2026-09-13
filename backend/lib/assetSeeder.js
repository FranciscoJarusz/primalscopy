// lib/assetSeeder.js
//
// Trae al volumen los 2712 archivos de la coleccion desde el servidor donde
// viven hoy.
//
// Hace falta ANTES de cambiar el DNS: cuando ipfs.primalcult.xyz apunte a este
// servicio vamos a tener que servir la coleccion entera, no solo los tokens
// que alguien haya customizado. Si el dominio se muda antes de esto, los 2712
// NFTs devuelven 404 en todas las wallets y marketplaces.
//
// Y tiene que correr ANTES del cambio de DNS por otro motivo: se descarga
// desde el mismo dominio que estamos por mudar. Despues del switch, ese
// nombre resuelve a nosotros mismos y no habria de donde traer nada.
//
// Es reanudable: saltea lo que ya esta. Si se corta o el servicio redeploya a
// mitad de camino, se vuelve a lanzar y sigue donde iba.

const assets = require('./assetStore');

const ORIGIN_URL = (process.env.ORIGIN_ASSETS_URL || 'https://ipfs.primalcult.xyz').trim().replace(/\/+$/, '');

// La coleccion es fija: 2712 tokens, del 1 al 2712 sin huecos (verificado
// contra el totalSupply del contrato y contra los archivos del origen). Se
// pueden acotar por env para probar sin bajar los 2 GB.
const FIRST_TOKEN = Number(process.env.SEED_FIRST_TOKEN || 1);
const LAST_TOKEN = Number(process.env.SEED_LAST_TOKEN || 2712);

// Bajo a proposito. El origen es un hosting compartido con sitios de otra
// gente: no es nuestro y no conviene saturarlo.
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 60000;

const state = {
    running: false,
    startedAt: null,
    finishedAt: null,
    done: 0,
    total: 0,
    skipped: 0,
    metadataFetched: 0,
    imagesFetched: 0,
    bytes: 0,
    errors: []
};

function getSeedProgress() {
    const { errors, ...rest } = state;
    return {
        ...rest,
        pending: Math.max(0, state.total - state.done),
        errorCount: errors.length,
        // Solo una muestra: con 2712 tokens una falla sistematica llenaria la
        // respuesta de ruido identico.
        sampleErrors: errors.slice(0, 10)
    };
}

async function fetchWithTimeout(url, signalTimeout = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), signalTimeout);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function seedMetadata(tokenId) {
    if (assets.readMetadata(tokenId)) return false;

    const response = await fetchWithTimeout(`${ORIGIN_URL}/metadata/${tokenId}`);
    if (!response.ok) throw new Error(`metadata ${tokenId}: HTTP ${response.status}`);

    const text = await response.text();
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        // Un hosting caido suele devolver HTML con status 200. Escribir eso
        // como metadata de un NFT seria peor que no escribir nada.
        throw new Error(`metadata ${tokenId}: la respuesta no es JSON`);
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.name) {
        throw new Error(`metadata ${tokenId}: JSON sin campo "name"`);
    }

    assets.writeMetadata(tokenId, parsed);
    state.metadataFetched++;
    state.bytes += text.length;
    return true;
}

async function seedImage(tokenId) {
    if (assets.hasImage(tokenId)) return false;

    const response = await fetchWithTimeout(`${ORIGIN_URL}/images/${tokenId}.gif`);
    if (!response.ok) throw new Error(`imagen ${tokenId}: HTTP ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    // Mismo criterio que arriba: verificar que sea un GIF de verdad y no una
    // pagina de error con status 200.
    if (buffer.length < 1024 || buffer.subarray(0, 4).toString('latin1') !== 'GIF8') {
        throw new Error(`imagen ${tokenId}: no es un GIF (${buffer.length} bytes)`);
    }

    assets.writeImage(tokenId, buffer);
    state.imagesFetched++;
    state.bytes += buffer.length;
    return true;
}

async function seedToken(tokenId) {
    let touched = false;
    try {
        if (await seedMetadata(tokenId)) touched = true;
        if (await seedImage(tokenId)) touched = true;
    } catch (error) {
        state.errors.push(error.message);
    }
    if (!touched) state.skipped++;
    state.done++;
}

async function runSeeding() {
    const queue = [];
    for (let id = FIRST_TOKEN; id <= LAST_TOKEN; id++) queue.push(id);

    state.total = queue.length;

    // Varios workers tomando de la misma cola: mantiene CONCURRENCY pedidos en
    // vuelo sin importar que unos tarden mas que otros.
    let cursor = 0;
    const worker = async () => {
        while (cursor < queue.length) {
            const tokenId = queue[cursor++];
            await seedToken(tokenId);
        }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

function startSeeding() {
    if (state.running) return { started: false, reason: 'Ya hay una migracion en curso.' };

    assets.ensureDirs();
    Object.assign(state, {
        running: true,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        done: 0,
        total: LAST_TOKEN - FIRST_TOKEN + 1,
        skipped: 0,
        metadataFetched: 0,
        imagesFetched: 0,
        bytes: 0,
        errors: []
    });

    // A proposito sin await: son 2 GB y el request que la dispara no puede
    // quedarse esperando. El progreso se consulta aparte.
    runSeeding()
        .catch(error => state.errors.push(`fallo general: ${error.message}`))
        .finally(() => {
            state.running = false;
            state.finishedAt = new Date().toISOString();
            console.log(`[assets] Migracion terminada: ${state.metadataFetched} metadata, ${state.imagesFetched} imagenes, ${state.errors.length} errores.`);
        });

    return { started: true };
}

module.exports = { startSeeding, getSeedProgress, ORIGIN_URL, FIRST_TOKEN, LAST_TOKEN };
