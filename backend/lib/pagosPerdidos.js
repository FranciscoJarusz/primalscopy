const { parseEther } = require('viem');

const BLOCKSCOUT = (process.env.BLOCKSCOUT_URL || 'https://apechain.calderaexplorer.xyz').replace(/\/+$/, '');
const PAGINAS = 5;

async function pagosAlTesoro(wallet, treasury, desdeMs = null) {
    const destino = treasury.toLowerCase();
    const pagos = [];
    let siguiente = '';
    for (let i = 0; i < PAGINAS; i++) {
        const r = await fetch(`${BLOCKSCOUT}/api/v2/addresses/${wallet}/transactions?filter=from${siguiente}`, {
            signal: AbortSignal.timeout(10_000),
        });
        if (!r.ok) throw new Error(`Blockscout ${r.status}`);
        const datos = await r.json();
        for (const t of datos.items || []) {
            if (desdeMs !== null && Date.parse(t.timestamp) < desdeMs) return pagos;
            if (t.result === 'success' && String(t.to?.hash || '').toLowerCase() === destino) {
                pagos.push({ txHash: String(t.hash).toLowerCase(), valueWei: String(t.value) });
            }
        }
        if (!datos.next_page_params) break;
        siguiente = '&' + new URLSearchParams(datos.next_page_params);
    }
    return pagos;
}

async function recuperarExtras(wallet, tesoro, { tier = null } = {}) {
    const packs = require('./packsStore');
    const config = packs.getConfig();
    const desde = config.openedAt ? Date.parse(config.openedAt) : null;
    const minWei = parseEther(String(config.extraPrice));
    const candidatos = (await module.exports.pagosAlTesoro(wallet, tesoro.treasury, desde)).filter(p =>
        BigInt(p.valueWei || 0) >= minWei
        && !packs.isExtraPayment(p.txHash)
        && !require('./forgeStore').getPayment(p.txHash)
        && !require('./stakingStore').isPurchase(p.txHash));

    let recuperados = 0;
    for (const { txHash } of candidatos) {
        try {
            const pago = await require('./forgePayments').verifyPayment(txHash, wallet, tesoro, {
                minWei,
                what: 'an extra pack',
                notBefore: desde,
            });
            if (packs.buyExtra(wallet, pago, { tier, source: 'recovered' }).created) recuperados++;
        } catch {
            /* sin confirmar o rechazado: se vuelve a intentar la proxima vez */
        }
    }
    return recuperados;
}

module.exports = { pagosAlTesoro, recuperarExtras };
