// lib/assetStore.js
//
// Donde viven la metadata y las imagenes publicadas de los NFTs.
//
// Railway permite un solo volumen por servicio y el nuestro esta montado en
// /data/traits, asi que todo lo que se escriba fuera de ahi cae en disco
// efimero y se pierde en el proximo deploy. Por eso estos assets van en una
// carpeta reservada DENTRO del volumen de traits.
//
// Esa carpeta es invisible para el resto del sistema: el panel de admin filtra
// por las 7 categorias conocidas y el customizer recorre CATEGORY_CONFIG, asi
// que ninguno la ve. Igual se declara en NON_CONTENT_ENTRIES para que no
// cuente como "el volumen tiene contenido": si no, el dia que los traits se
// borren, su sola presencia haria creer que el volumen esta poblado y la
// semilla no se copiaria.

const fs = require('fs');
const path = require('path');
const { TRAITS_PATH, GENERATED_DIR } = require('./traitsStore');

const ASSETS_ROOT = path.join(TRAITS_PATH, GENERATED_DIR);
const IMAGES_DIR = path.join(ASSETS_ROOT, 'images');
const METADATA_DIR = path.join(ASSETS_ROOT, 'metadata');
// Que variantes eligio el dueño de cada token. No va dentro de la metadata
// publica: meter campos propios en el JSON de un NFT es pedirle problemas a
// los marketplaces, que lo parsean con sus propias reglas.
const SELECTIONS_DIR = path.join(ASSETS_ROOT, 'selections');

// La URL publica desde la que se sirven estos archivos. Es la que termina
// dentro del campo "image" de la metadata, o sea la que van a leer las wallets
// y los marketplaces.
const PUBLIC_ASSETS_URL = (process.env.PUBLIC_ASSETS_URL || 'https://ipfs.primalcult.xyz').trim().replace(/\/+$/, '');

const TOKEN_ID_REGEX = /^\d{1,10}$/;

function ensureDirs() {
    for (const dir of [IMAGES_DIR, METADATA_DIR, SELECTIONS_DIR]) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function assertTokenId(tokenId) {
    const id = String(tokenId);
    if (!TOKEN_ID_REGEX.test(id)) throw new Error(`Token id invalido: ${tokenId}`);
    return id;
}

// Escritura atomica: primero a un temporal en el mismo directorio y despues
// rename, que es atomico dentro del mismo filesystem. Si el proceso muere a
// mitad de camino, el archivo viejo queda intacto en vez de quedar truncado.
// Un NFT con la imagen a medio escribir se ve roto en todos los marketplaces.
function writeAtomic(filePath, data) {
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, filePath);
}

function metadataPath(tokenId) {
    return path.join(METADATA_DIR, assertTokenId(tokenId));
}

function imagePath(tokenId) {
    return path.join(IMAGES_DIR, `${assertTokenId(tokenId)}.gif`);
}

function selectionPath(tokenId) {
    return path.join(SELECTIONS_DIR, `${assertTokenId(tokenId)}.json`);
}

function readMetadata(tokenId) {
    try {
        return JSON.parse(fs.readFileSync(metadataPath(tokenId), 'utf8'));
    } catch {
        return null;
    }
}

function writeMetadata(tokenId, metadata) {
    ensureDirs();
    writeAtomic(metadataPath(tokenId), JSON.stringify(metadata, null, 2));
}

function writeImage(tokenId, buffer) {
    ensureDirs();
    writeAtomic(imagePath(tokenId), buffer);
}

function readSelection(tokenId) {
    try {
        return JSON.parse(fs.readFileSync(selectionPath(tokenId), 'utf8'));
    } catch {
        return null;
    }
}

function writeSelection(tokenId, selection) {
    ensureDirs();
    writeAtomic(selectionPath(tokenId), JSON.stringify(selection, null, 2));
}

function hasImage(tokenId) {
    try {
        return fs.statSync(imagePath(tokenId)).size > 0;
    } catch {
        return false;
    }
}

// El "?v=" no es decorativo. El archivo se sobreescribe siempre con el mismo
// nombre, asi que sin algo que cambie en la URL los navegadores y los CDN de
// los marketplaces siguen mostrando la version vieja indefinidamente.
function publicImageUrl(tokenId, version) {
    return `${PUBLIC_ASSETS_URL}/images/${assertTokenId(tokenId)}.gif?v=${version}`;
}

function countFiles(dir) {
    try {
        return fs.readdirSync(dir).length;
    } catch {
        return 0;
    }
}

function getAssetsStatus() {
    return {
        assetsRoot: ASSETS_ROOT,
        publicAssetsUrl: PUBLIC_ASSETS_URL,
        images: countFiles(IMAGES_DIR),
        metadata: countFiles(METADATA_DIR),
        selections: countFiles(SELECTIONS_DIR)
    };
}

module.exports = {
    ASSETS_ROOT,
    IMAGES_DIR,
    METADATA_DIR,
    SELECTIONS_DIR,
    PUBLIC_ASSETS_URL,
    ensureDirs,
    readMetadata,
    writeMetadata,
    writeImage,
    readSelection,
    writeSelection,
    hasImage,
    imagePath,
    metadataPath,
    publicImageUrl,
    getAssetsStatus
};
