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

const CATEGORY_CONFIG = [
    { fsName: 'BACKGROUND', apiName: 'Background' },
    { fsName: 'FUR', apiName: 'Fur' },
    { fsName: 'TUNIC', apiName: 'Tunic' },
    { fsName: 'FACE', apiName: 'Face' },
    { fsName: 'EYES', apiName: 'Eyes' },
    { fsName: 'HAT', apiName: 'Hat' },
    { fsName: 'EFFECT', apiName: 'Effect' }
];

function normalizeKey(value) {
    return String(value || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}

function getCategoryFromInput(traitType) {
    const normalizedType = normalizeKey(traitType);
    return CATEGORY_CONFIG.find(category => {
        return normalizeKey(category.fsName) === normalizedType || normalizeKey(category.apiName) === normalizedType;
    }) || null;
}

function safeReadDir(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir);
}

function getImageFilesFromDir(dir) {
    return safeReadDir(dir)
        .filter(file => /\.(png|gif|bmp|webp)$/i.test(file))
        .sort((a, b) => a.localeCompare(b));
}

function findVariantDirectoryByValue(categoryDir, rawValue) {
    const directories = safeReadDir(categoryDir).filter(item => {
        return fs.statSync(path.join(categoryDir, item)).isDirectory();
    });

    const normalizedRawValue = normalizeKey(rawValue);
    return directories.find(dir => normalizeKey(dir) === normalizedRawValue) || null;
}

function buildVariantsForCategory(fsCategoryName) {
    const categoryDir = path.join(ASSETS_PATH, 'traits', fsCategoryName);
    const variantDirectories = safeReadDir(categoryDir)
        .filter(item => fs.statSync(path.join(categoryDir, item)).isDirectory())
        .sort((a, b) => a.localeCompare(b));

    const variants = variantDirectories
        .map(variantDir => {
            const variantPath = path.join(categoryDir, variantDir);
            const files = getImageFilesFromDir(variantPath);
            if (files.length === 0) return null;

            return {
                name: variantDir,
                imageUrl: `/assets/traits/${fsCategoryName}/${variantDir}/${files[0]}`,
                isNone: false
            };
        })
        .filter(Boolean);

    const categoryNoneFile = path.join(categoryDir, 'none.png.bmp');
    const globalNoneFile = path.join(ASSETS_PATH, 'traits', 'none.png.bmp');

    if (fs.existsSync(categoryNoneFile)) {
        variants.unshift({
            name: 'None',
            imageUrl: `/assets/traits/${fsCategoryName}/none.png.bmp`,
            isNone: true
        });
    } else if (fs.existsSync(globalNoneFile)) {
        variants.unshift({
            name: 'None',
            imageUrl: '/assets/traits/none.png.bmp',
            isNone: true
        });
    } else {
        variants.unshift({
            name: 'None',
            imageUrl: null,
            isNone: true
        });
    }

    return variants;
}

async function getNftMetadata(nftId) {
    try {
        const { data } = await axios.get(`${METADATA_BASE_URL}${nftId}`);
        return data;
    } catch (err) {
        console.error(`[ERROR] No metadata for NFT ${nftId} ->`, err.message);
        return null;
    }
}

async function getCustomizationOptions(req, res) {
    try {
        const { nftId } = req.params;
        const metadata = await getNftMetadata(nftId);
        const customizationOptions = {};

        const traitValuesByCategory = {};
        for (const category of CATEGORY_CONFIG) {
            traitValuesByCategory[category.fsName] = 'None';
        }

        if (metadata) {
            if (Array.isArray(metadata.attributes)) {
                for (const attr of metadata.attributes) {
                    if (!attr || !attr.trait_type) continue;
                    const category = getCategoryFromInput(attr.trait_type);
                    if (!category) continue;
                    traitValuesByCategory[category.fsName] = attr.value || 'None';
                }
            } else if (typeof metadata === 'object') {
                for (const [key, value] of Object.entries(metadata)) {
                    const category = getCategoryFromInput(key);
                    if (!category) continue;
                    traitValuesByCategory[category.fsName] = value || 'None';
                }
            }
        }

        for (const category of CATEGORY_CONFIG) {
            const categoryDir = path.join(ASSETS_PATH, 'traits', category.fsName);
            const variants = buildVariantsForCategory(category.fsName);

            if (variants.length === 0 || !fs.existsSync(categoryDir)) continue;

            const rawCurrentValue = traitValuesByCategory[category.fsName];
            const matchedDir = findVariantDirectoryByValue(categoryDir, rawCurrentValue);
            const currentValue = matchedDir || 'None';

            customizationOptions[category.apiName] = {
                currentValue,
                variants
            };
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
        if (imageUrl && imageUrl !== '__NONE__') {
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