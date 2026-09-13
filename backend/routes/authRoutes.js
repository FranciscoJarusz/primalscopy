// routes/authRoutes.js
//
// Login por firma de wallet, en dos pasos:
//
//   POST /api/auth/nonce   { address }            -> { nonce, message }
//   POST /api/auth/verify  { nonce, signature }   -> { address, token }
//
// El cliente hace firmar a la wallet exactamente el `message` que devuelve el
// primer paso, sin modificarlo. El server verifica contra el mensaje que el
// mismo emitio, no contra texto que mande el cliente.

const express = require('express');
const { createNonce, verifySignature, isWalletAuthEnabled } = require('../lib/walletAuth');
const { requireWallet } = require('../middleware/requireWallet');

const router = express.Router();

router.post('/nonce', (req, res) => {
    if (!isWalletAuthEnabled()) {
        return res.status(503).json({
            error: 'La autenticacion por wallet esta deshabilitada. Defini WALLET_JWT_SECRET en el servidor.'
        });
    }
    try {
        const { address } = req.body || {};
        res.json(createNonce(address));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/verify', async (req, res) => {
    try {
        const { nonce, signature } = req.body || {};
        res.json(await verifySignature({ nonce, signature }));
    } catch (error) {
        // 401 y no 400: el pedido estaba bien formado, lo que fallo es la
        // prueba de identidad.
        res.status(401).json({ error: error.message });
    }
});

// Para que el front sepa si la sesion que tiene guardada sigue valiendo, sin
// tener que hacer firmar de nuevo al usuario en cada carga de pagina.
router.get('/me', requireWallet, (req, res) => {
    res.json({ address: req.walletAddress });
});

module.exports = router;
