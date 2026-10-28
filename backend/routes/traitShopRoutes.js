const express = require('express');
const { requireWallet } = require('../middleware/requireWallet');
const shop = require('../lib/traitShopStore');
const staking = require('../lib/stakingStore');
const { getPrimalBalance } = require('../lib/nftOwnership');

const router = express.Router();

// Lo que esta wallet ya desbloqueo y su FOG, para el customizer.
router.get('/me', requireWallet, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ unlocked: shop.unlockedBy(req.walletAddress), balance: staking.balanceDe(req.walletAddress) });
});

router.post('/unlock', requireWallet, async (req, res) => {
    const trait = String(req.body?.trait || '');
    if (shop.isFree(trait)) {
        let primals;
        try {
            primals = await getPrimalBalance(req.walletAddress);
        } catch {
            return res.status(503).json({ error: "Couldn't check your Primals right now. Try again in a few seconds.", reason: 'chain-unavailable' });
        }
        if (primals === 0) {
            return res.status(403).json({ error: 'This free drop is only for Primal holders.', reason: 'not-holder' });
        }
    }
    const result = shop.unlock(req.walletAddress, trait);
    if (result.error) return res.status(result.status).json({ error: result.error, reason: result.reason });
    res.json(result);
});

module.exports = router;
