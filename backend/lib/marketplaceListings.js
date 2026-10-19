// Un Primal listado no puede entrenar. Solo OpenSea: Magic Eden ya no soporta
// ApeChain.
//
// Se pide la coleccion entera y no token por token: son un par de paginas
// (117 listados de 51 tokens al probarlo), contra un pedido por Primal en
// staking.

const OPENSEA_API_KEY = (process.env.OPENSEA_API_KEY || '').trim();
const OPENSEA_COLLECTION = (process.env.OPENSEA_COLLECTION_SLUG || 'primalcult').trim();
const TIMEOUT_MS = 15000;
const MAX_PAGES = 50;

function isConfigured() {
    return OPENSEA_API_KEY.length > 0;
}

async function fetchPage(next) {
    const url = `https://api.opensea.io/api/v2/listings/collection/${OPENSEA_COLLECTION}/all?limit=100`
        + (next ? `&next=${encodeURIComponent(next)}` : '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            headers: { 'x-api-key': OPENSEA_API_KEY, accept: 'application/json' },
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`OpenSea respondio ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

// La ultima lectura buena, para no pedirle la coleccion entera a OpenSea en
// cada stake (ver maxAgeMs).
let ultima = null;

/**
 * Un Map tokenId -> Set de wallets (en minusculas) que lo tienen listado.
 * Va con quien lo lista porque OpenSea puede seguir mostrando el listado de un
 * dueño anterior: ese no cuenta contra el dueño actual.
 *
 * Tira si OpenSea no contesta: el llamador no puede tomar "no pude
 * preguntar" como "no esta listado".
 *
 * Con `maxAgeMs` devuelve la ultima lectura si tiene menos de esa edad. El
 * chequeo periodico pide siempre una nueva (y deja la suya para los demas).
 */
async function getListings({ maxAgeMs = 0 } = {}) {
    if (ultima && Date.now() - ultima.at < maxAgeMs) return ultima.listed;
    const at = Date.now();
    const listed = new Map();
    let next = '';
    for (let page = 0; page < MAX_PAGES; page++) {
        const data = await fetchPage(next);
        for (const listing of data.listings || []) {
            const tokenId = String(listing.asset?.identifier
                ?? listing.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria ?? '');
            const offerer = String(listing.protocol_data?.parameters?.offerer || '').toLowerCase();
            if (!/^\d+$/.test(tokenId)) continue;
            if (!listed.has(tokenId)) listed.set(tokenId, new Set());
            listed.get(tokenId).add(offerer);
        }
        next = data.next;
        if (!next) break;
    }
    ultima = { at, listed };
    return listed;
}

module.exports = { isConfigured, getListings };
