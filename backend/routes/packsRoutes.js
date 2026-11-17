const express = require('express');
const { parseEther } = require('viem');
const { requireWallet } = require('../middleware/requireWallet');
const packs = require('../lib/packsStore');
const staking = require('../lib/stakingStore');
const packShare = require('../lib/packShare');
const transferIndex = require('../lib/transferIndex');
const { getPrimalBalance } = require('../lib/nftOwnership');
const { treasuryConfig, verifyPayment } = require('../lib/forgePayments');
const pagosPerdidos = require('../lib/pagosPerdidos');

const router = express.Router();
const temporada = express.Router({ mergeParams: true });

function responder(res, result) {
    if (result.error) {
        const { status, ...body } = result;
        return res.status(status || 400).json(body);
    }
    res.json(result);
}

const ultimoBalance = new Map();

async function primalsDe(wallet) {
    const mapa = transferIndex.duenos();
    if (mapa) {
        let n = 0;
        for (const dueno of mapa.values()) if (dueno === wallet) n++;
        return n;
    }
    try {
        const n = await getPrimalBalance(wallet);
        ultimoBalance.set(wallet, n);
        return n;
    } catch {
        return ultimoBalance.get(wallet) ?? null;
    }
}

async function nivel(req) {
    const wallet = req.walletAddress.toLowerCase();
    const primals = await primalsDe(wallet);
    if (primals === null) return null;
    if (primals < 1) return 'none';
    return staking.isStaking(wallet) ? 'staker' : 'holder';
}

const sinCadena = { error: "Couldn't check your Primals right now. Try again in a few seconds.", reason: 'rpc-error', status: 503 };

temporada.get('/config', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json(req.temporada.publicConfig());
});

temporada.get('/leaderboard', async (req, res) => {
    res.set('Cache-Control', 'no-cache');
    await req.temporada.resolverSorteos().catch(() => {});
    res.json(req.temporada.leaderboard());
});

temporada.get('/pull/:id', (req, res) => {
    const datos = packs.pull(req.params.id);
    if (!datos) return res.status(404).json({ error: 'Pack not found.' });
    res.set('Cache-Control', 'public, max-age=300');
    res.json(datos);
});

temporada.get(['/og/:id.jpg', '/og/:id.png'], async (req, res) => {
    const datos = packs.pull(req.params.id);
    if (!datos) return res.status(404).end();
    try {
        res.set('Cache-Control', 'public, max-age=3600');
        res.type('image/jpeg').sendFile(await packShare.tarjetaPack(datos));
    } catch (error) {
        console.error('[og] pack:', error.message);
        res.status(502).end();
    }
});

temporada.get('/me', requireWallet, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    await req.temporada.resolverSorteos().catch(() => {});
    res.json(req.temporada.resumen(req.walletAddress, { tier: await nivel(req) }));
});

temporada.post('/register', requireWallet, async (req, res) => {
    const result = req.temporada.register(req.walletAddress, req.body || {});
    if (result.error) return responder(res, result);
    res.json(req.temporada.resumen(req.walletAddress, { tier: await nivel(req) }));
});

temporada.post('/open', requireWallet, async (req, res) => {
    const tier = await nivel(req);
    if (!tier) return responder(res, sinCadena);
    responder(res, req.temporada.open(req.walletAddress, { tier }));
});

temporada.post('/upgrade', requireWallet, async (req, res) => {
    const tier = await nivel(req);
    if (!tier) return responder(res, sinCadena);
    responder(res, req.temporada.upgrade(req.walletAddress, { kind: String(req.body?.kind || ''), cards: req.body?.cards }, { tier }));
});

temporada.post('/extra', requireWallet, async (req, res) => {
    const txHash = String(req.body?.txHash || '').toLowerCase();
    try {
        const tesoro = treasuryConfig();
        if (!tesoro) return res.status(503).json({ error: "Payments aren't set up.", reason: 'not-configured' });
        let payment = { txHash };
        if (!packs.isExtraPayment(txHash)) {
            const puede = req.temporada.puedeComprarExtra(req.walletAddress);
            if (puede.error) return responder(res, puede);
            const config = req.temporada.getConfig();
            payment = await verifyPayment(txHash, req.walletAddress, tesoro, {
                minWei: parseEther(String(config.extraPrice)),
                what: 'an extra pack',
                notBefore: config.openedAt ? Date.parse(config.openedAt) : null,
            });
        }
        const result = req.temporada.buyExtra(req.walletAddress, payment, { tier: await nivel(req) });
        if (result.error) return responder(res, result);
        res.status(result.created ? 201 : 200).json({ me: result.me });
    } catch (error) {
        res.status(error.status || 500).json({ error: error.status ? error.message : "Couldn't check the payment.", code: error.code });
    }
});

const ultimaBusqueda = new Map();
const ESPERA_BUSQUEDA = 20_000;

temporada.post('/extra/recover', requireWallet, async (req, res) => {
    const wallet = req.walletAddress.toLowerCase();
    const tesoro = treasuryConfig();
    if (!tesoro) return res.status(503).json({ error: "Payments aren't set up.", reason: 'not-configured' });
    const puede = req.temporada.puedeComprarExtra(wallet);
    if (puede.error && puede.reason !== 'max-extras') return responder(res, puede);
    const antes = ultimaBusqueda.get(wallet) || 0;
    if (Date.now() - antes < ESPERA_BUSQUEDA) {
        return res.status(429).json({ error: 'Checking too often. Try again in a few seconds.', reason: 'too-soon' });
    }
    ultimaBusqueda.set(wallet, Date.now());
    const tier = await nivel(req);
    try {
        const recovered = await pagosPerdidos.recuperarExtras(wallet, tesoro, { tier, temporada: req.temporada });
        res.json({ recovered, me: req.temporada.resumen(wallet, { tier }) });
    } catch {
        ultimaBusqueda.delete(wallet);
        res.status(503).json({ error: "Couldn't check your payments right now. Try again in a minute.", reason: 'rpc-error' });
    }
});

temporada.put('/solana', requireWallet, (req, res) => {
    responder(res, req.temporada.setSolana(req.walletAddress, req.body?.address));
});

router.use('/s/:season', (req, res, next) => {
    req.temporada = packs.temporada(String(req.params.season));
    if (!req.temporada) return res.status(404).json({ error: 'Season not found.' });
    next();
}, temporada);
router.use((req, res, next) => {
    req.temporada = packs.actual();
    next();
}, temporada);

module.exports = router;
