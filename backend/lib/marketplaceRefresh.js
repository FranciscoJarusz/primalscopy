// lib/marketplaceRefresh.js
//
// Le pide a los marketplaces que vuelvan a leer un NFT despues de guardarlo.
//
// Por que hace falta: la ficha del NFT carga la imagen desde su URL, que lleva
// ?v=<version> y cambia en cada guardado, asi que esa se actualiza sola. Pero
// la miniatura de las grillas la genera y cachea el marketplace en su propio
// CDN cuando indexa el token por primera vez, y de esa no se entera nunca.
// Resultado: adentro se ve la customizacion nueva y en la grilla la vieja.
//
// Es best-effort a proposito: que un marketplace no conteste no puede hacer
// fallar un guardado que ya se escribio bien.

const OPENSEA_API_KEY = (process.env.OPENSEA_API_KEY || '').trim();
const OPENSEA_CHAIN = (process.env.OPENSEA_CHAIN || 'ape_chain').trim();
const CONTRACT_ADDRESS = (process.env.NFT_CONTRACT_ADDRESS || '0xe277A7643562775C4f4257E23B068ba8F45608b4').trim();

// El guardado ya tarda entre 5 y 15 segundos. Se espera la respuesta para
// poder informar si quedo encolado, pero con un techo corto: si OpenSea esta
// lento, no vale la pena hacer esperar mas al usuario.
const TIMEOUT_MS = 8000;

function isConfigured() {
    return OPENSEA_API_KEY.length > 0;
}

async function refreshOpenSea(tokenId) {
    // ignoreCachedItemUrls es la clave: sin el, OpenSea re-lee la metadata pero
    // se queda con la imagen que ya tenia cacheada, que es justo el problema.
    const url = `https://api.opensea.io/api/v2/chain/${OPENSEA_CHAIN}`
        + `/contract/${CONTRACT_ADDRESS}/nfts/${tokenId}/refresh?ignoreCachedItemUrls=true`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'x-api-key': OPENSEA_API_KEY, accept: 'application/json' },
            signal: controller.signal
        });
        if (!response.ok) {
            return { ok: false, status: response.status, detail: (await response.text()).slice(0, 200) };
        }
        return { ok: true, status: response.status };
    } catch (error) {
        return { ok: false, detail: error.name === 'AbortError' ? 'timeout' : error.message };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Avisa a los marketplaces. Nunca tira: el llamador ya escribio el NFT y un
 * fallo aca solo significa que la miniatura va a tardar mas en actualizarse.
 */
async function refreshToken(tokenId) {
    if (!isConfigured()) {
        return { requested: false, reason: 'OPENSEA_API_KEY no esta definida' };
    }

    const opensea = await refreshOpenSea(tokenId);
    if (!opensea.ok) {
        console.warn(`[marketplaces] OpenSea no acepto el refresh del ${tokenId}:`, opensea.status || '', opensea.detail || '');
    }
    return { requested: opensea.ok, opensea };
}

module.exports = { refreshToken, isConfigured, OPENSEA_CHAIN, CONTRACT_ADDRESS };
