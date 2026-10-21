// El soft staking (ver lib/stakingStore.js). Poner a entrenar y canjear piden
// la sesion firmada; la tasa y el catalogo son publicos.

const express = require('express');
const { requireWallet } = require('../middleware/requireWallet');
const staking = require('../lib/stakingStore');
const { getTokenOwners } = require('../lib/nftOwnership');
const listings = require('../lib/marketplaceListings');
const primalThumbs = require('../lib/primalThumbs');
const wheels = require('../lib/stakingWheels');
const winCards = require('../lib/winCards');
const { getNickname } = require('../lib/nicknameStore');
const { treasuryConfig, verifyPayment } = require('../lib/forgePayments');
const { parseEther } = require('viem');

// Lo publico de un premio para compartirlo: que fue, de que key, y quien lo
// gano (el apodo, o la wallet corta).
function premioPublico(id) {
    const win = /^[0-9a-f-]{8,64}$/.test(String(id)) ? wheels.findWin(id) : null;
    if (!win) return null;
    const item = staking.getConfig().catalog.find(i => i.id === win.item);
    return {
        win,
        datos: {
            id: win.id,
            prize: win.prize,
            chance: win.chance,
            item: win.item,
            itemLabel: item?.label ?? win.item,
            name: getNickname(win.wallet) || `${win.wallet.slice(0, 6)}...${win.wallet.slice(-4)}`,
            at: win.at
        }
    };
}

const router = express.Router();
const MAX_TOKENS = 500;
// Que tan vieja puede ser la lista de OpenSea al poner a entrenar. Pedirla
// entera en cada stake eran varias paginas por click; con un minuto, alguien
// que lista y stakea enseguida igual sale en el proximo chequeo (10 min).
const LISTADOS_MAX_EDAD_MS = 60 * 1000;

router.get('/config', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json(staking.publicConfig());
});

// Los Primals que estan entrenando en cada region, para dibujarlos en el mapa.
router.get('/map', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json({ periods: staking.trainingByPeriod() });
});

// Un icono de premio subido desde el admin. El nombre cambia con cada icono
// nuevo, asi que se cachea para siempre.
router.get('/icons/:file', (req, res) => {
    const file = staking.iconPath(req.params.file);
    if (!file) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(file, error => {
        if (error && !res.headersSent) res.status(404).end();
    });
});

// La miniatura de un Primal para el mapa (ver lib/primalThumbs.js).
router.get('/primal/:tokenId.webp', primalThumbs.servirMiniatura);

// Los premios de una ruleta (LOWKEY, HIGHKEY, FOGKEY, Summon shard) con su
// probabilidad, para mostrarlos y para armar la animacion.
router.get('/wheel/:item', (req, res) => {
    const wheel = wheels.publicWheel(req.params.item);
    if (!wheel) return res.status(404).json({ error: 'Unknown wheel.' });
    res.set('Cache-Control', 'no-cache');
    res.json(wheel);
});

// Los ultimos premios de las ruletas, para el cartel "en vivo" de /staking.
router.get('/recent-wins', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json({ wins: wheels.recentWins() });
});

// Un premio ganado, para la pagina /staking/win/<id> que se comparte en X.
router.get('/win/:id', (req, res) => {
    const p = premioPublico(req.params.id);
    if (!p) return res.status(404).json({ error: 'Unknown prize.' });
    res.json(p.datos);
});

// La tarjeta de ese premio (1200x630) que X muestra en el post.
router.get('/win/:id/card.png', async (req, res) => {
    const p = premioPublico(req.params.id);
    if (!p) return res.status(404).end();
    try {
        const archivo = await winCards.tarjeta(p.win, { nombre: p.datos.name, llave: p.datos.itemLabel });
        res.set('Cache-Control', 'public, max-age=86400');
        res.type('image/png').sendFile(archivo);
    } catch (error) {
        res.status(error.status || 500).end();
    }
});

// La imagen de un premio, subida desde el admin. El nombre cambia con cada
// imagen nueva, asi que se cachea para siempre.
router.get('/prizes/:file', (req, res) => {
    const file = wheels.imagePath(req.params.file);
    if (!file) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(file, error => {
        if (error && !res.headersSent) res.status(404).end();
    });
});

// El saldo de FOG y las insignias de cada wallet, para el ranking de /stats.
router.get('/leaderboard', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json({ wallets: staking.leaderboard() });
});

router.get('/me', requireWallet, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(staking.walletSummary(req.walletAddress));
});

// POST /api/staking/stake  { tokenIds: ['12', ...], days: 30 }
router.post('/stake', requireWallet, async (req, res) => {
    const tokenIds = [...new Set((req.body?.tokenIds || []).map(String))];
    if (tokenIds.length === 0 || tokenIds.length > MAX_TOKENS || !tokenIds.every(staking.isValidTokenId)) {
        return res.status(400).json({ error: 'Pick the Primals to stake.', reason: 'invalid-tokens' });
    }
    if (!staking.getConfig().enabled) {
        return res.status(503).json({ error: 'Staking is closed right now.', reason: 'closed' });
    }

    const wallet = req.walletAddress.toLowerCase();
    let owners;
    let listed = new Map();
    try {
        owners = await getTokenOwners(tokenIds);
    } catch {
        return res.status(503).json({ error: "Couldn't check your Primals right now. Try again in a few seconds.", reason: 'chain-unavailable' });
    }
    if (listings.isConfigured()) {
        try {
            listed = await listings.getListings({ maxAgeMs: LISTADOS_MAX_EDAD_MS });
        } catch {
            return res.status(503).json({ error: "Couldn't check marketplace listings right now. Try again in a few seconds.", reason: 'listings-unavailable' });
        }
    }

    const ownedIds = new Set(tokenIds.filter(id => owners.get(id) === wallet));
    const listedIds = new Set(tokenIds.filter(id => listed.get(id)?.has(wallet)));
    const result = staking.startStakes(wallet, tokenIds, req.body?.days, { ownedIds, listedIds });
    if (result.error) return res.status(400).json(result);

    primalThumbs.precalentar(result.started.map(s => s.tokenId));
    res.status(result.started.length ? 201 : 200).json({
        started: result.started.map(s => s.tokenId),
        rejected: result.rejected,
        ...staking.walletSummary(wallet)
    });
});

// POST /api/staking/redeem  { item: 'forge-roll' }
router.post('/redeem', requireWallet, (req, res) => {
    const result = staking.redeem(req.walletAddress, String(req.body?.item || ''));
    if (result.error) {
        const { status, ...body } = result;
        return res.status(status).json(body);
    }
    res.json(result);
});

// POST /api/staking/buy-fog  { txHash }
// Acredita FOG por una transferencia de APE al treasury. El front reintenta
// mientras responde 409 not-confirmed; llamarlo otra vez con el mismo hash no
// suma de nuevo.
router.post('/buy-fog', requireWallet, async (req, res) => {
    const txHash = String(req.body?.txHash || '').toLowerCase();
    try {
        const config = treasuryConfig();
        if (!config) return res.status(503).json({ error: "Payments aren't set up.", code: 'not-configured' });
        if (!staking.isPurchase(txHash)) {
            const ventana = staking.fogSaleWindow();
            if (!ventana) return res.status(409).json({ error: 'The FOG sale is closed.', code: 'closed' });
            const payment = await verifyPayment(txHash, req.walletAddress, config, {
                minWei: parseEther(String(staking.MIN_APE)),
                what: 'FOG',
                notBefore: ventana.from
            });
            if (payment.blockTime > ventana.until) {
                return res.status(409).json({ error: 'That payment arrived after the FOG sale closed.', code: 'closed' });
            }
            const result = staking.buyFog(req.walletAddress, payment);
            if (result.error) return res.status(result.status).json({ error: result.error, code: result.code });
            return res.status(201).json(result);
        }
        const result = staking.buyFog(req.walletAddress, { txHash });
        if (result.error) return res.status(result.status).json({ error: result.error, code: result.code });
        res.json(result);
    } catch (error) {
        res.status(error.status || 500).json({ error: error.status ? error.message : "Couldn't check the payment.", code: error.code });
    }
});

// POST /api/staking/unstake  { tokenIds: ['12', ...] }
// Sacarlo antes de tiempo paga solo el FOG base. Si la cadena contesta, los
// dias se acreditan hasta ahora; si no, hasta la ultima verificacion.
router.post('/unstake', requireWallet, async (req, res) => {
    const tokenIds = [...new Set((req.body?.tokenIds || []).map(String))];
    if (tokenIds.length === 0 || tokenIds.length > MAX_TOKENS || !tokenIds.every(staking.isValidTokenId)) {
        return res.status(400).json({ error: 'Pick the Primals to unstake.', reason: 'invalid-tokens' });
    }
    const wallet = req.walletAddress.toLowerCase();
    let ownedIds = null;
    try {
        const owners = await getTokenOwners(tokenIds);
        ownedIds = new Set(tokenIds.filter(id => owners.get(id) === wallet));
    } catch { /* sin cadena: se acreditan solo los dias ya verificados */ }

    const result = staking.unstake(wallet, tokenIds, { ownedIds });
    res.json({ ...result, ...staking.walletSummary(wallet) });
});

module.exports = router;
