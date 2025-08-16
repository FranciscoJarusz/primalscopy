// Reemplaza todo el contenido de nftRoutes.js con esto:

const express = require('express');

const { 
  getCustomizationOptions, 
  generateAndSaveNftImage, 
  getProxiedMetadata,
  getNftLayers // <-- IMPORTA LA NUEVA FUNCIÓN
} = require('../controllers/nftController');


const router = express.Router();

// ... (tus otras rutas siguen igual) ...

// AÑADE ESTA NUEVA RUTA
router.post('/get-layers', getNftLayers);

// 1. Ruta para obtener la metadata (usa la función getProxiedMetadata)
router.get('/:nftId/metadata', getProxiedMetadata);

// 2. Ruta para obtener las opciones de personalización (usa la función getCustomizationOptions)
router.get('/:nftId/customize-options', getCustomizationOptions);

// 3. Ruta para generar la imagen (usa la función generateAndSaveNftImage)
router.post('/customize', generateAndSaveNftImage);

module.exports = router;