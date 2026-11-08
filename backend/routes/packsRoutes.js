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

router.get('/config', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json(packs.publicConfig());
});

router.get('/leaderboard', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json(packs.leaderboard());
});

router.get('/pull/:id', (req, res) => {
    const datos = packs.pull(req.params.id);
    if (!datos) return res.status(404).json({ error: 'Pack not found.' });
    res.set('Cache-Control', 'public, max-age=300');
    res.json(datos);
});

router.get(['/og/:id.jpg', '/og/:id.png'], async (req, res) => {
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

router.get('/me', requireWallet, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(packs.resumen(req.walletAddress, { tier: await nivel(req) }));
});

router.post('/register', requireWallet, async (req, res) => {
    const result = packs.register(req.walletAddress, req.body || {});
    if (result.error) return responder(res, result);
    res.json(packs.resumen(req.walletAddress, { tier: await nivel(req) }));
});

router.post('/open', requireWallet, async (req, res) => {
    const tier = await nivel(req);
    if (!tier) return responder(res, sinCadena);
    responder(res, packs.open(req.walletAddress, { tier }));
});

router.post('/extra', requireWallet, async (req, res) => {
    const txHash = String(req.body?.txHash || '').toLowerCase();
    try {
        const tesoro = treasuryConfig();
        if (!tesoro) return res.status(503).json({ error: "Payments aren't set up.", reason: 'not-configured' });
        let payment = { txHash };
        if (!packs.isExtraPayment(txHash)) {
            const puede = packs.puedeComprarExtra(req.walletAddress);
            if (puede.error) return responder(res, puede);
            const config = packs.getConfig();
            payment = await verifyPayment(txHash, req.walletAddress, tesoro, {
                minWei: parseEther(String(config.extraPrice)),
                what: 'an extra pack',
                notBefore: config.openedAt ? Date.parse(config.openedAt) : null,
            });
        }
        const result = packs.buyExtra(req.walletAddress, payment, { tier: await nivel(req) });
        if (result.error) return responder(res, result);
        res.status(result.created ? 201 : 200).json({ me: result.me });
    } catch (error) {
        res.status(error.status || 500).json({ error: error.status ? error.message : "Couldn't check the payment.", code: error.code });
    }
});

const ultimaBusqueda = new Map();
const ESPERA_BUSQUEDA = 20_000;

router.post('/extra/recover', requireWallet, async (req, res) => {
    const wallet = req.walletAddress.toLowerCase();
    const tesoro = treasuryConfig();
    if (!tesoro) return res.status(503).json({ error: "Payments aren't set up.", reason: 'not-configured' });
    const puede = packs.puedeComprarExtra(wallet);
    if (puede.error && puede.reason !== 'max-extras') return responder(res, puede);
    const antes = ultimaBusqueda.get(wallet) || 0;
    if (Date.now() - antes < ESPERA_BUSQUEDA) {
        return res.status(429).json({ error: 'Checking too often. Try again in a few seconds.', reason: 'too-soon' });
    }
    ultimaBusqueda.set(wallet, Date.now());
    const tier = await nivel(req);
    try {
        const recovered = await pagosPerdidos.recuperarExtras(wallet, tesoro, { tier });
        res.json({ recovered, me: packs.resumen(wallet, { tier }) });
    } catch {
        ultimaBusqueda.delete(wallet);
        res.status(503).json({ error: "Couldn't check your payments right now. Try again in a minute.", reason: 'rpc-error' });
    }
});

router.put('/solana', requireWallet, (req, res) => {
    responder(res, packs.setSolana(req.walletAddress, req.body?.address));
});

module.exports = router;
