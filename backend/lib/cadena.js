// El cliente de ApeChain que usa todo el backend. APECHAIN_RPC_URL (una o
// varias URLs separadas por coma) va primero y el RPC publico queda de
// respaldo: si uno se cae, viem pasa al siguiente.

const { createPublicClient, http, fallback } = require('viem');
const { apeChain } = require('viem/chains');

const PUBLICO = apeChain.rpcUrls.default.http[0];
const URLS = [...new Set([...(process.env.APECHAIN_RPC_URL || '').split(','), PUBLICO]
    .map(url => url.trim())
    .filter(Boolean))];

function transporte({ timeout } = {}) {
    const transportes = URLS.map(url => http(url, timeout ? { timeout } : {}));
    return transportes.length === 1 ? transportes[0] : fallback(transportes);
}

const client = createPublicClient({ chain: apeChain, transport: transporte() });

module.exports = { client, transporte, URLS };
