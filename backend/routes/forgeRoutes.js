// routes/forgeRoutes.js
//
// El Forge: rolls que cambian los traits de un NFT.
// Ver controllers/forgeController.js.

const express = require('express');
const router = express.Router();

const { requireWallet, requireTokenOwner } = require('../middleware/requireWallet');
const {
    getForgeStatus,
    roll,
    choose,
    cancel,
    myPayments,
    registerPayment
} = require('../controllers/forgeController');

// Los pagos son de la wallet, no de un NFT: el roll pagado se puede usar en
// cualquier Primal de esa wallet. Van antes de /:nftId para que "payments" no
// se tome como un numero de token.
router.get('/payments/me', requireWallet, myPayments);
router.post('/payments', requireWallet, registerPayment);

// Publica: si el NFT puede usar el Forge, sus traits y su roll pendiente.
router.get('/:nftId', getForgeStatus);

// Todo lo que escribe exige ser el dueño del NFT en este momento. Un roll
// pendiente es del NFT y no de quien lo pago: si el NFT se vende antes de
// resolverlo, lo resuelve el dueño nuevo.
router.post('/:nftId/roll', requireWallet, requireTokenOwner, roll);
router.post('/:nftId/choose', requireWallet, requireTokenOwner, choose);
router.post('/:nftId/cancel', requireWallet, requireTokenOwner, cancel);

module.exports = router;
