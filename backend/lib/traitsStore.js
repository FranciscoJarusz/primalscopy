// lib/traitsStore.js
// Fuente de verdad para la ubicacion de los traits en disco.
//
// En Railway el filesystem del contenedor es efimero: todo lo que se sube se
// pierde en el siguiente deploy. Por eso TRAITS_PATH apunta a un volumen
// persistente montado en el dashboard (ej: /data/traits) y, la primera vez que
// arranca con el volumen vacio, se siembra con los assets versionados del repo.
// A partir de ahi el volumen es la unica fuente de verdad y se puede crear,
// renombrar y borrar cualquier trait, incluidos los originales.

const fs = require('fs');
const path = require('path');

const SEED_TRAITS_PATH = path.join(__dirname, '..', 'assets', 'traits');
const TRAITS_PATH = process.env.TRAITS_PATH
    ? path.resolve(process.env.TRAITS_PATH)
    : SEED_TRAITS_PATH;

// Carpeta especial dentro de cada categoria: sus archivos se ofrecen a TODOS
// los NFTs, sin importar el valor del trait que traiga su metadata.
const GLOBAL_DIR = '_GLOBAL';

const IMAGE_EXTENSION_REGEX = /\.(png|gif|bmp|webp)$/i;

function isUsingPersistentVolume() {
    return TRAITS_PATH !== SEED_TRAITS_PATH;
}

function directoryHasEntries(dir) {
    try {
        return fs.readdirSync(dir).length > 0;
    } catch {
        return false;
    }
}

// Copia recursiva del seed al volumen. fs.cpSync existe desde Node 16.7.
function seedTraitsIfEmpty() {
    if (!isUsingPersistentVolume()) {
        console.log(`[traits] Usando assets del repo en ${TRAITS_PATH} (sin volumen persistente).`);
        return;
    }

    fs.mkdirSync(TRAITS_PATH, { recursive: true });

    if (directoryHasEntries(TRAITS_PATH)) {
        console.log(`[traits] Volumen persistente ya poblado en ${TRAITS_PATH}.`);
        return;
    }

    if (!fs.existsSync(SEED_TRAITS_PATH)) {
        console.warn(`[traits] Volumen vacio y no hay assets semilla en ${SEED_TRAITS_PATH}.`);
        return;
    }

    console.log(`[traits] Volumen vacio. Sembrando desde ${SEED_TRAITS_PATH}...`);
    fs.cpSync(SEED_TRAITS_PATH, TRAITS_PATH, { recursive: true });
    console.log('[traits] Semilla copiada. El volumen es ahora la unica fuente de verdad.');
}

module.exports = {
    TRAITS_PATH,
    SEED_TRAITS_PATH,
    GLOBAL_DIR,
    IMAGE_EXTENSION_REGEX,
    isUsingPersistentVolume,
    seedTraitsIfEmpty
};
