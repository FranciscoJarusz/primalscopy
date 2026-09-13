// routes/nftRoutes.js - VERSIÓN FINAL Y LIMPIA

const express = require('express');
const router = express.Router();

// CAMBIO CLAVE: Solo importamos las funciones que SÍ existen en el controlador.
const {
    getCustomizationOptions,
    generateAndSaveNftImage
} = require('../controllers/nftController.js');
const { requireWallet } = require('../middleware/requireWallet');
const { checkOwnership } = require('../lib/nftOwnership');

// Ruta para obtener las opciones de personalización de un NFT.
// El frontend llama a: /api/nft/:nftId/customize-options
router.get('/:nftId/customize-options', getCustomizationOptions);

// Ruta para generar la imagen final.
// El frontend deberá llamar a: /api/nft/generate-image
router.post('/generate-image', generateAndSaveNftImage);


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
        return res.status(503).json({ error: 'No se pudo consultar la blockchain. Reintenta en unos segundos.' });
    }
    if (result.status === 'invalid-token-id') {
        return res.status(400).json({ error: 'ID de NFT invalido.' });
    }
    if (result.status === 'token-not-found') {
        return res.status(404).json({ error: `El NFT #${req.params.nftId} no existe.` });
    }

    res.json({
        tokenId: req.params.nftId,
        wallet: req.walletAddress,
        owner: result.owner,
        isOwner: result.status === 'owner'
    });
});

// IMPORTANTE: Ya no hay rutas para 'get-layers', 'metadata' o 'customize' porque no se usan o
// han sido renombradas para ser más claras.

module.exports = router;