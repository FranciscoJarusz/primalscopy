// routes/nftRoutes.js

const express = require('express');
const router = express.Router();

const { getCustomizationOptions } = require('../controllers/nftController.js');
const { requireWallet, requireTokenOwner } = require('../middleware/requireWallet');
const { checkOwnership } = require('../lib/nftOwnership');
const { saveCustomization, getCustomization } = require('../controllers/customizationController.js');
const { listRecentCustomizations } = require('../controllers/feedController.js');

// Las ultimas customizaciones publicadas, para la pantalla "Recent
// Customizations". Va antes que las rutas con :nftId para que un token que se
// llamara "recent-customizations" no se la coma; ademas es publica y no lleva
// ninguna guarda.
router.get('/recent-customizations', listRecentCustomizations);

// Ruta para obtener las opciones de personalización de un NFT.
// El frontend llama a: /api/nft/:nftId/customize-options
router.get('/:nftId/customize-options', getCustomizationOptions);

// Le dice al front si la wallet de la sesion es dueña de este token, para
// mostrar o esconder el boton de guardar. Es solo para la interfaz: la
// seguridad real la hace requireTokenOwner en el endpoint que escribe, porque
// cualquiera puede saltearse el front y hacer el POST a mano.
//
// Responde 200 siempre (con isOwner true o false). Que no seas el dueño no es
// un error, es la respuesta a la pregunta.
router.get('/:nftId/ownership', requireWallet, async (req, res) => {
    const result = await checkOwnership(req.walletAddress, req.params.nftId);

    if (result.status === 'chain-unavailable') {
        return res.status(503).json({ error: "Couldn't reach the blockchain. Try again in a few seconds." });
    }
    if (result.status === 'invalid-token-id') {
        return res.status(400).json({ error: 'Invalid Primal id.' });
    }
    if (result.status === 'token-not-found') {
        return res.status(404).json({ error: `Primal #${req.params.nftId} doesn't exist.` });
    }

    res.json({
        tokenId: req.params.nftId,
        wallet: req.walletAddress,
        owner: result.owner,
        isOwner: result.status === 'owner'
    });
});

// Guardar la customizacion. Las dos guardas van encadenadas y en este orden:
// requireWallet prueba quien es, requireTokenOwner que sea dueño del token en
// este momento. Sin las dos, cualquiera podria reescribir el NFT de otro.
router.post('/:nftId/customization', requireWallet, requireTokenOwner, saveCustomization);

// Lectura publica: que customizacion tiene aplicada este token. No expone
// nada que no este ya en la metadata publica.
router.get('/:nftId/customization', getCustomization);

module.exports = router;