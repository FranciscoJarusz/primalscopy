// Todo lo que entro en APE: los rolls del Forge pagados y las compras de FOG.
// Los rolls con codigo o con FOG no movieron APE y no estan.

const DAY_MS = 24 * 60 * 60 * 1000;

function pagosEnApe() {
    const forge = Object.values(require('./forgeStore').readPayments())
        .filter(p => !p.source && p.txHash)
        .map(p => ({
            kind: 'forge',
            at: p.paidAt,
            wallet: String(p.wallet).toLowerCase(),
            valueWei: p.valueWei,
            txHash: p.txHash.toLowerCase(),
            chainId: p.chainId ?? null,
            status: p.status,
            tokenId: p.tokenId ?? null
        }));
    const fog = require('./stakingStore').comprasDeFog().map(c => ({
        kind: 'fog',
        at: c.at,
        wallet: c.wallet,
        valueWei: c.valueWei,
        txHash: c.txHash,
        fog: c.fog
    }));
    return [...forge, ...fog].sort((a, b) => b.at.localeCompare(a.at));
}

function resumen(limite = 200, now = Date.now()) {
    const pagos = pagosEnApe();
    const total = (lista) => ({
        count: lista.length,
        apeWei: lista.reduce((n, p) => n + BigInt(p.valueWei || 0), 0n).toString()
    });
    const periodo = desde => {
        const lista = pagos.filter(p => Date.parse(p.at) >= desde);
        return { forge: total(lista.filter(p => p.kind === 'forge')), fog: total(lista.filter(p => p.kind === 'fog')) };
    };
    return {
        totals: {
            all: periodo(0),
            days30: periodo(now - 30 * DAY_MS),
            days7: periodo(now - 7 * DAY_MS)
        },
        wallets: new Set(pagos.map(p => p.wallet)).size,
        payments: pagos.slice(0, limite),
        more: Math.max(0, pagos.length - limite)
    };
}

module.exports = { pagosEnApe, resumen };
