const express = require('express');
const badges = require('../lib/badgeStore');
const { getAllNicknames } = require('../lib/nicknameStore');

const router = express.Router();
const WALLET_REGEX = /^0x[0-9a-fA-F]{40}$/;

function walletDe(texto) {
    if (WALLET_REGEX.test(texto)) return texto.toLowerCase();
    const buscado = texto.toLowerCase();
    return Object.entries(getAllNicknames()).find(([, apodo]) => apodo.toLowerCase() === buscado)?.[0] ?? null;
}

router.get('/images/:file', (req, res) => {
    const file = badges.imagePath(req.params.file);
    if (!file) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(file, error => {
        if (error && !res.headersSent) res.status(404).end();
    });
});

router.get('/:id', async (req, res) => {
    const wallet = walletDe(String(req.params.id));
    if (!wallet) return res.status(404).json({ error: 'Unknown holder.' });
    try {
        res.set('Cache-Control', 'no-cache');
        res.json({ wallet, ...(await badges.tablero(wallet)) });
    } catch {
        res.status(503).json({ error: "Couldn't reach the blockchain. Try again in a few seconds." });
    }
});

module.exports = router;
