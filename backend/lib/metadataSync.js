// lib/metadataSync.js
//
// La metadata vigente de un token, leida del hosting de la coleccion.
//
// El volumen guarda una copia de cada metadata que este server escribio, pero
// esa copia no es la fuente de verdad: el dueño de la coleccion puede cambiar
// un NFT directo en el hosting, sin pasar por aca. Paso con el #54 (octubre
// 2026): el hosting decia Golden/Black/Blindfold y el volumen seguia con
// Aquamarine/White/Trader. El customizer ofrecia los traits viejos y, peor,
// guardar desde ahi habria publicado la metadata vieja encima del cambio del
// dueño.
//
// Por eso se consulta el hosting cada vez. Si los traits o la imagen cambiaron
// por afuera, se pone al dia la copia del volumen y la seleccion guardada se
// da por vencida: describia capas de una imagen que ya no es la publicada.

const axios = require('axios');
const assets = require('./assetStore');
const remote = require('./remotePublisher');
const forge = require('./forgeStore');

// Vacia desactiva la consulta y deja solo la copia del volumen. Es lo que
// corresponde el dia que ipfs.primalcult.xyz apunte a este mismo server.
const ORIGIN_METADATA_URL = (process.env.ORIGIN_METADATA_URL ?? 'https://ipfs.primalcult.xyz/metadata/').trim();

const TIMEOUT_MS = 8000;

async function fetchOrigin(tokenId) {
    const { data } = await axios.get(`${ORIGIN_METADATA_URL}${tokenId}`, {
        timeout: TIMEOUT_MS,
        headers: { 'Cache-Control': 'no-cache' }
    });
    if (!data || typeof data !== 'object') {
        throw Object.assign(new Error('La metadata original no es un JSON valido.'), { status: 502 });
    }
    return data;
}

// Solo si este server publica en el hosting tiene sentido tomarlo como la
// verdad. Si no publica (local sin credenciales, o un token con cambios de
// prueba del Forge), lo que hay en el volumen es a proposito distinto, y
// "ponerlo al dia" borraria justo lo que se esta probando.
function syncEnabled(tokenId) {
    return Boolean(ORIGIN_METADATA_URL) && remote.isConfigured() && !forge.isSandbox(tokenId);
}

// La imagen y los traits son lo que dibuja la seleccion. Si cambio solo la
// descripcion, la seleccion sigue valiendo.
function sameDrawing(a, b) {
    return a?.image === b?.image
        && JSON.stringify(a?.attributes ?? null) === JSON.stringify(b?.attributes ?? null);
}

function supersedeSelection(tokenId, origin) {
    const selection = assets.readSelection(tokenId);
    if (!selection?.applied) return;
    assets.writeSelection(tokenId, {
        ...selection,
        applied: null,
        // Lo de antes queda a mano por si hay que entender que paso.
        superseded: {
            at: new Date().toISOString(),
            previousApplied: selection.applied,
            image: origin.image || null
        }
    });
}

/**
 * La metadata vigente del token. Tira (con status 502) solo si no hay ninguna
 * copia: si el hosting no contesta pero el volumen tiene una, se usa esa.
 */
async function currentMetadata(tokenId) {
    const local = assets.readMetadata(tokenId);
    if (local && !syncEnabled(tokenId)) return local;

    let origin;
    try {
        origin = await fetchOrigin(tokenId);
    } catch (error) {
        if (local) return local;
        throw Object.assign(
            new Error(`No se pudo leer la metadata del NFT #${tokenId}: ${error.message}`),
            { status: error.status || 502 }
        );
    }

    if (!local) {
        assets.writeMetadata(tokenId, origin);
        return origin;
    }
    if (JSON.stringify(local) === JSON.stringify(origin)) return local;

    if (!sameDrawing(local, origin)) {
        console.warn(`[metadata] El NFT #${tokenId} cambio fuera de este server; se toma la version del hosting.`);
        supersedeSelection(tokenId, origin);
    }
    assets.writeMetadata(tokenId, origin);
    return origin;
}

module.exports = { currentMetadata, sameDrawing };
