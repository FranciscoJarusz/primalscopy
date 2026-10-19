const express = require('express');
const exiled = require('../lib/exiledStore');

const router = express.Router();

const MAX_FALLOS = 10;
const VENTANA_MS = 15 * 60 * 1000;
const fallos = new Map();

router.get('/', (req, res) => res.json({ tokenIds: exiled.TOKEN_IDS }));

router.post('/code', (req, res) => {
    const ahora = Date.now();
    const entrada = fallos.get(req.ip);
    if (entrada && entrada.hasta > ahora && entrada.cuenta >= MAX_FALLOS) {
        return res.status(429).json({ valid: false, error: 'too many attempts. the beacon stops listening.' });
    }
    if (exiled.esValido(req.body?.code)) return res.json({ valid: true });
    if (fallos.size > 10000) {
        for (const [ip, e] of fallos) if (e.hasta <= ahora) fallos.delete(ip);
    }
    if (!entrada || entrada.hasta <= ahora) fallos.set(req.ip, { cuenta: 1, hasta: ahora + VENTANA_MS });
    else entrada.cuenta++;
    res.json({ valid: false });
});

module.exports = router;
