// El apodo de cada wallet. Leerlos es publico (es lo que muestra /stats);
// cambiar el propio exige la sesion firmada, porque la direccion sola no
// prueba nada, y tener al menos un Primal.

const express = require('express');
const { requireWallet } = require('../middleware/requireWallet');
const ownership = require('../lib/nftOwnership');
const nicknames = require('../lib/nicknameStore');
const profiles = require('../lib/profileStore');

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

router.put('/', requireWallet, async (req, res) => {
    const { value, error } = profiles.validate(req.body);
    if (error) return res.status(400).json({ error });

    const wallet = req.walletAddress.toLowerCase();
    const elegidos = [...new Set([value.avatar, ...value.featured].filter(Boolean))];
    try {
        if (elegidos.length) {
            const owners = await ownership.getTokenOwners(elegidos);
            const ajeno = elegidos.find(id => owners.get(id) !== wallet);
            if (ajeno) return res.status(400).json({ error: `Primal #${ajeno} isn't in your wallet.` });
        } else if (await ownership.getPrimalBalance(req.walletAddress) < 1) {
            return res.status(403).json({ error: 'You need at least one Primal to edit your profile.' });
        }
    } catch {
        return res.status(503).json({ error: "Couldn't check your Primals right now. Try again in a few seconds." });
    }

    let nickname = nicknames.getNickname(wallet);
    if ('nickname' in (req.body || {})) {
        const pedido = String(req.body.nickname ?? '').trim();
        if (!pedido && nickname) {
            nicknames.deleteNickname(wallet);
            nickname = null;
        } else if (pedido && pedido !== nickname) {
            const result = nicknames.setNickname(wallet, pedido);
            if (result.error) return res.status(400).json({ error: result.error });
            nickname = result.nickname;
        }
    }

    res.json({ nickname, profile: profiles.setProfile(wallet, value) });
});

module.exports = router;
