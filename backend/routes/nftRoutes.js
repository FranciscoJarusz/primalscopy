// routes/nftRoutes.js - VERSIÓN FINAL Y LIMPIA

const express = require('express');
const router = express.Router();

// CAMBIO CLAVE: Solo importamos las funciones que SÍ existen en el controlador.
const {
    getCustomizationOptions,
    generateAndSaveNftImage
} = require('../controllers/nftController.js');

// Ruta para obtener las opciones de personalización de un NFT.
// El frontend llama a: /api/nft/:nftId/customize-options
router.get('/:nftId/customize-options', getCustomizationOptions);

// Ruta para generar la imagen final.
// El frontend deberá llamar a: /api/nft/generate-image
router.post('/generate-image', generateAndSaveNftImage);


// IMPORTANTE: Ya no hay rutas para 'get-layers', 'metadata' o 'customize' porque no se usan o
// han sido renombradas para ser más claras.

module.exports = router;