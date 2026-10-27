const express = require('express');
const { requireWallet } = require('../middleware/requireWallet');
const raffles = require('../lib/raffleStore');
const staking = require('../lib/stakingStore');
const { getPrimalBalance } = require('../lib/nftOwnership');

const router = express.Router();

function responder(res, result, ok = 200) {
    if (result.error) {
        const { status, ...body } = result;
        return res.status(status || 400).json(body);
    }
    res.status(ok).json(result);
}

router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json(raffles.publicList());
});

router.get('/images/:file', (req, res) => {
    const file = raffles.imagePath(req.params.file);
    if (!file) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(file, error => {
        if (error && !res.headersSent) res.status(404).end();
    });
});

router.get('/me', requireWallet, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let holder = null;
    try {
        holder = (await getPrimalBalance(req.walletAddress)) > 0;
    } catch { /* sin cadena: el front no muestra si entra gratis */ }
    res.json({ holder, balance: staking.balanceDe(req.walletAddress), entries: raffles.entriesOf(req.walletAddress), wins: raffles.winsOf(req.walletAddress) });
});

router.get('/:id', (req, res) => {
    const raffle = raffles.isValidId(req.params.id) ? raffles.findPublic(req.params.id) : null;
    if (!raffle) return res.status(404).json({ error: 'Unknown raffle.' });
    res.set('Cache-Control', 'no-cache');
    res.json(raffle);
});

router.post('/:id/enter', requireWallet, async (req, res) => {
    let isHolder;
    try {
        isHolder = (await getPrimalBalance(req.walletAddress)) > 0;
    } catch {
        return res.status(503).json({ error: "Couldn't check your Primals right now. Try again in a few seconds.", reason: 'chain-unavailable' });
    }
    responder(res, raffles.enter(req.walletAddress, req.params.id, { isHolder }), 201);
});

router.post('/:id/tickets', requireWallet, (req, res) => {
    responder(res, raffles.buyTickets(req.walletAddress, req.params.id, req.body?.quantity), 201);
});

module.exports = router;
