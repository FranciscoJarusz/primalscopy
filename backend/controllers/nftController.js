// controllers/nftcontroller.js - VERSIÓN FINAL Y LIMPIA

const axios = require('axios');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const {
    TRAITS_PATH,
    GLOBAL_DIR,
    IMAGE_EXTENSION_REGEX
} = require('../lib/traitsStore');

const METADATA_BASE_URL = 'https://ipfs.primalcult.xyz/metadata/';
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
        .filter(file => IMAGE_EXTENSION_REGEX.test(file))
        .sort((a, b) => a.localeCompare(b));
}

function stripImageExtensions(fileName) {
    return String(fileName || '')
        .replace(IMAGE_EXTENSION_REGEX, '')
        .replace(IMAGE_EXTENSION_REGEX, '');
}

// Las carpetas de variantes se corresponden con valores de trait de la metadata.
// _GLOBAL no es un valor posible: es el cajón de traits que se ofrecen a todos
// los NFTs, así que nunca puede elegirse como carpeta base.
function getVariantDirectories(categoryDir) {
    return safeReadDir(categoryDir)
        .filter(item => item !== GLOBAL_DIR)
        .filter(item => fs.statSync(path.join(categoryDir, item)).isDirectory())
        .sort((a, b) => a.localeCompare(b));
}

function findVariantDirectoryByValue(categoryDir, rawValue) {
    const directories = getVariantDirectories(categoryDir);

    const normalizedRawValue = normalizeKey(rawValue);
    return directories.find(dir => normalizeKey(dir) === normalizedRawValue) || null;
}

function buildVariantsFromDirectory(fsCategoryName, directoryName, isGlobal) {
    if (!directoryName) return [];

    const targetDir = path.join(TRAITS_PATH, fsCategoryName, directoryName);

    return getImageFilesFromDir(targetDir).map(file => ({
        name: stripImageExtensions(file),
        imageUrl: `/assets/traits/${fsCategoryName}/${directoryName}/${file}`,
        isNone: false,
        isGlobal
    }));
}

// Un NFT ve las variantes de su propia carpeta (las que comparten su valor de
// trait) más todo lo que viva en _GLOBAL.
function buildVariantsForCategory(fsCategoryName, directoryName) {
    const ownVariants = buildVariantsFromDirectory(fsCategoryName, directoryName, false);
    const globalVariants = buildVariantsFromDirectory(fsCategoryName, GLOBAL_DIR, true);

    const seen = new Set(ownVariants.map(variant => normalizeKey(variant.name)));
    const uniqueGlobals = globalVariants.filter(variant => !seen.has(normalizeKey(variant.name)));

    return [...ownVariants, ...uniqueGlobals];
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
            traitValuesByCategory[category.fsName] = '';
        }

        if (metadata) {
            if (Array.isArray(metadata.attributes)) {
                for (const attr of metadata.attributes) {
                    if (!attr || !attr.trait_type) continue;
                    const category = getCategoryFromInput(attr.trait_type);
                    if (!category) continue;
                    traitValuesByCategory[category.fsName] = attr.value || '';
                }
            } else if (typeof metadata === 'object') {
                for (const [key, value] of Object.entries(metadata)) {
                    const category = getCategoryFromInput(key);
                    if (!category) continue;
                    traitValuesByCategory[category.fsName] = value || '';
                }
            }
        }

        for (const category of CATEGORY_CONFIG) {
            const categoryDir = path.join(TRAITS_PATH, category.fsName);
            if (!fs.existsSync(categoryDir)) continue;

            const rawCurrentValue = traitValuesByCategory[category.fsName];
            const matchedDir = findVariantDirectoryByValue(categoryDir, rawCurrentValue);
            const directoryCandidates = getVariantDirectories(categoryDir);
            const selectedDirectory = matchedDir || directoryCandidates[0] || null;
            const variants = buildVariantsForCategory(category.fsName, selectedDirectory);

            if (variants.length === 0) continue;

            const matchedVariantByValue = variants.find(variant => {
                return normalizeKey(variant.name) === normalizeKey(rawCurrentValue);
            });
            const currentValue = matchedVariantByValue?.name || variants[0].name;

            customizationOptions[category.apiName] = {
                currentValue,
                variants
            };
        }

        // El listado cambia cada vez que se sube o borra un trait desde el
        // panel, así que el navegador tiene que revalidar siempre. Con el ETag
        // que agrega Express, si no cambió nada la respuesta es un 304 barato.
        res.set('Cache-Control', 'no-cache');
        res.json(customizationOptions);
    } catch (error) {
        console.error('[ERROR] getCustomizationOptions ->', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
}

// Las URLs que manda el front son del tipo /assets/traits/HAT/BOHO/BOHO.gif.
// Con el volumen persistente esa ruta ya no vive dentro del repo, así que hay
// que reescribir el prefijo antes de tocar el disco.
function resolveLayerPath(imageUrl) {
    const normalizedUrl = imageUrl.startsWith('/') ? imageUrl.substring(1) : imageUrl;
    const traitsPrefix = 'assets/traits/';

    if (normalizedUrl.startsWith(traitsPrefix)) {
        const relative = normalizedUrl.substring(traitsPrefix.length);
        const resolved = path.resolve(TRAITS_PATH, relative);
        // Defensa contra ../ en la URL entrante.
        if (!resolved.startsWith(path.resolve(TRAITS_PATH))) return null;
        return resolved;
    }

    return path.join(__dirname, '..', normalizedUrl);
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
            const imagePath = resolveLayerPath(imageUrl);
            if (imagePath && fs.existsSync(imagePath)) {
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

module.exports = {
    getCustomizationOptions,
    generateAndSaveNftImage,
    // Reutilizados por el panel de admin para no duplicar la config de categorías.
    CATEGORY_CONFIG,
    normalizeKey,
    getVariantDirectories
};