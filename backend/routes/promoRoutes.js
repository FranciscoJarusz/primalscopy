// El canje de codigos promocionales (ver lib/promoStore.js). Hace falta la
// sesion firmada, para saber a que wallet darle el premio, pero no un Primal.
//
// Los intentos con codigos que no existen tienen limite, por wallet y por IP:
// sin eso alguien podria probar de a miles hasta acertar uno. Crear wallets
// nuevas no cuesta nada, por eso tambien va por IP, con un tope mas alto
// porque varias personas pueden compartirla (un wifi, una red movil). Un
// codigo vencido o agotado no cuenta: ese no es alguien adivinando. Los
// contadores viven en memoria; un reinicio los pone en cero, y eso esta bien.

const express = require('express');
const { requireWallet } = require('../middleware/requireWallet');
const promo = require('../lib/promoStore');

const router = express.Router();

const MAX_FALLOS = { wallet: 8, ip: 30 };
const VENTANA_MS = 15 * 60 * 1000;
const fallos = new Map();

function bloqueado(clave, ahora) {
    const entrada = fallos.get(clave);
    if (!entrada || entrada.hasta <= ahora) return false;
    return entrada.cuenta >= MAX_FALLOS[clave.split(':')[0]];
}

function anotarFallo(clave, ahora) {
    // Que un ataque con muchas IPs no haga crecer el mapa para siempre.
    if (fallos.size > 10000) {
        for (const [c, e] of fallos) if (e.hasta <= ahora) fallos.delete(c);
    }
    const entrada = fallos.get(clave);
    if (!entrada || entrada.hasta <= ahora) fallos.set(clave, { cuenta: 1, hasta: ahora + VENTANA_MS });
    else entrada.cuenta++;
}

router.post('/redeem', requireWallet, (req, res) => {
    const ahora = Date.now();
    const claves = [`wallet:${req.walletAddress.toLowerCase()}`, `ip:${req.ip}`];
    if (claves.some(c => bloqueado(c, ahora))) {
        return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.', reason: 'rate-limited' });
    }

    const result = promo.redeem(req.walletAddress, req.body?.code);
    if (result.error) {
        if (result.reason === 'invalid') claves.forEach(c => anotarFallo(c, ahora));
        return res.status(400).json(result);
    }
    res.json(result);
});

module.exports = router;
