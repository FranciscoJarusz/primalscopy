// controllers/nftcontroller.js - VERSIÓN FINAL Y LIMPIA

const axios = require('axios');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const METADATA_BASE_URL = 'https://ipfs.primalcult.xyz/metadata/';
const ASSETS_PATH = path.join(__dirname, '../assets');
const GENERATED_IMAGES_PATH = path.join(__dirname, '../generated_images');
const NFT_WIDTH = 2000;
const NFT_HEIGHT = 2000;

async function getNftMetadata(nftId) {
    try {
        const { data } = await axios.get(`${METADATA_BASE_URL}${nftId}`);
        return data;
    } catch (err) {
        console.error(`[ERROR] No metadata for NFT ${nftId} ->`, err.message);
        return null;
    }
}

function getTraitVariants(traitType, traitValue) {
    const dir = path.join(ASSETS_PATH, 'traits', traitType, traitValue);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.png') || f.endsWith('.gif'));
}

async function getCustomizationOptions(req, res) {
    try {
        const { nftId } = req.params;
        const metadata = await getNftMetadata(nftId);
        if (!metadata) {
            return res.status(404).json({ error: 'Metadata not found' });
        }
        const customizationOptions = {};
        if (!metadata.attributes) {
            return res.json(customizationOptions);
        }
        const nftTraits = metadata.attributes.filter(attr =>
            attr.value && attr.value !== 'None' && attr.trait_type
        );
        for (const trait of nftTraits) {
            const traitType = trait.trait_type;
            const currentValue = trait.value;
            const files = getTraitVariants(traitType, currentValue);
            if (files.length > 0) {
                customizationOptions[traitType] = {
                    currentValue,
                    variants: files.map(file => ({
                        name: path.parse(file).name,
                        imageUrl: `/assets/traits/${traitType}/${currentValue}/${file}`
                    }))
                };
            }
        }
        res.json(customizationOptions);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error.' });
    }
}

async function generateAndSaveNftImage(req, res) {
    const { nftId, selectedVariants } = req.body;
    if (!nftId || !selectedVariants) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos.' });
    }

    const layerOrder = ['Background', 'Fur', 'Tunic', 'Face', 'Eyes', 'Hat', 'Effect'];
    const layers = [];
    
    for (const traitType of layerOrder) {
        const imageUrl = selectedVariants[traitType];
        if (imageUrl) {
            // Convierte la URL relativa (ej: /assets/...) en una ruta de archivo local
            const imagePath = path.join(__dirname, '..', imageUrl.startsWith('/') ? imageUrl.substring(1) : imageUrl);
            if (fs.existsSync(imagePath)) {
                layers.push({ input: imagePath });
            } else {
                console.warn(`[WARN] Archivo no encontrado para la capa ${traitType}: ${imagePath}`);
            }
        }
    }

    if (layers.length === 0) {
        return res.status(500).json({ error: 'No se encontraron capas para generar la imagen.' });
    }

    if (!fs.existsSync(GENERATED_IMAGES_PATH)) {
        fs.mkdirSync(GENERATED_IMAGES_PATH, { recursive: true });
    }

    const fileName = `custom_${nftId}_${Date.now()}.png`;
    const outputPath = path.join(GENERATED_IMAGES_PATH, fileName);

    try {
        await sharp({ create: { width: NFT_WIDTH, height: NFT_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
            .composite(layers)
            .png()
            .toFile(outputPath);
        res.json({ imageUrl: `/generated_images/${fileName}` });
    } catch (err) {
        res.status(500).json({ error: 'Falló la generación de la imagen.', detail: err.message });
    }
}

// NO exportamos getNftLayers ni getProxiedMetadata si no se usan aquí.
// Mantenemos la exportación limpia.
module.exports = {
    getCustomizationOptions,
    generateAndSaveNftImage
};