const express = require('express');
const { requireWallet } = require('../middleware/requireWallet');
const shop = require('../lib/traitShopStore');
const staking = require('../lib/stakingStore');

const router = express.Router();

// Lo que esta wallet ya desbloqueo y su FOG, para el customizer.
router.get('/me', requireWallet, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ unlocked: shop.unlockedBy(req.walletAddress), balance: staking.balanceDe(req.walletAddress) });
});

router.post('/unlock', requireWallet, (req, res) => {
    const result = shop.unlock(req.walletAddress, String(req.body?.trait || ''));
    if (result.error) return res.status(result.status).json({ error: result.error, reason: result.reason });
    res.json(result);
});

module.exports = router;
