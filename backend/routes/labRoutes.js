// routes/labRoutes.js
//
// El LAB (nombre provisorio): rolls que cambian los traits de un NFT.
// Ver controllers/labController.js.

const express = require('express');
const router = express.Router();

const { requireWallet, requireTokenOwner } = require('../middleware/requireWallet');
const { getLabStatus, roll, choose, cancel } = require('../controllers/labController');

// Publica: si el NFT puede usar el LAB, sus traits y su roll pendiente.
router.get('/:nftId', getLabStatus);

// Todo lo que escribe exige ser el dueño del NFT en este momento. Un roll
// pendiente es del NFT y no de quien lo pago: si el NFT se vende antes de
// resolverlo, lo resuelve el dueño nuevo.
router.post('/:nftId/roll', requireWallet, requireTokenOwner, roll);
router.post('/:nftId/choose', requireWallet, requireTokenOwner, choose);
router.post('/:nftId/cancel', requireWallet, requireTokenOwner, cancel);

module.exports = router;
