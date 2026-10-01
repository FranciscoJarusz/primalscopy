// routes/profileRoutes.js
//
// El apodo de cada wallet. Leerlos es publico (es lo que muestra /stats);
// cambiar el propio exige la sesion firmada, porque la direccion sola no
// prueba nada, y tener al menos un Primal.

const express = require('express');
const { requireWallet } = require('../middleware/requireWallet');
const ownership = require('../lib/nftOwnership');
const nicknames = require('../lib/nicknameStore');

const router = express.Router();

router.get('/nicknames', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(nicknames.getAllNicknames());
});

router.put('/nickname', requireWallet, async (req, res) => {
    let balance;
    try {
        balance = await ownership.getPrimalBalance(req.walletAddress);
    } catch {
        return res.status(503).json({ error: "Couldn't check your Primals right now. Try again in a few seconds." });
    }
    if (balance < 1) {
        return res.status(403).json({ error: 'You need at least one Primal to set a nickname.' });
    }

    const result = nicknames.setNickname(req.walletAddress, req.body?.nickname);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
});

module.exports = router;
