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

// Marcador escrito en el propio volumen. Si sobrevive a un reinicio, el
// almacenamiento es persistente de verdad; si desaparece siempre, no lo es.
// Es la prueba historica que complementa a isRealMountPoint().
const MARKER_FILE = '.storage-marker.json';

function isUsingPersistentVolume() {
    return TRAITS_PATH !== SEED_TRAITS_PATH;
}

// El marcador no cuenta como contenido: si lo contaramos, el directorio nunca
// pareceria vacio y la semilla no se copiaria jamas.
function directoryHasEntries(dir) {
    try {
        return fs.readdirSync(dir).filter(entry => entry !== MARKER_FILE).length > 0;
    } catch {
        return false;
    }
}

// Un volumen montado es un filesystem distinto al del contenedor, asi que su
// device id difiere del de su directorio padre. Si coinciden, TRAITS_PATH es
// solo una carpeta comun en disco efimero: se escribe bien, se lee bien, y se
// pierde entero en el proximo reinicio.
function isRealMountPoint(dir) {
    try {
        return fs.statSync(dir).dev !== fs.statSync(path.dirname(dir)).dev;
    } catch {
        return false;
    }
}

function readMarker() {
    try {
        return JSON.parse(fs.readFileSync(path.join(TRAITS_PATH, MARKER_FILE), 'utf8'));
    } catch {
        return null;
    }
}

function writeMarker(marker) {
    try {
        fs.writeFileSync(path.join(TRAITS_PATH, MARKER_FILE), JSON.stringify(marker, null, 2));
    } catch (err) {
        console.warn('[traits] No se pudo escribir el marcador:', err.message);
    }
}

function getStorageStatus() {
    const marker = readMarker();
    return {
        traitsPath: TRAITS_PATH,
        configuredViaEnv: isUsingPersistentVolume(),
        isRealMountPoint: isRealMountPoint(TRAITS_PATH),
        marker,
        // Si el marcador no sobrevivio a ningun reinicio, se perdieron datos.
        survivedRestart: Boolean(marker && marker.boots > 1)
    };
}

// Copia recursiva del seed al volumen. fs.cpSync existe desde Node 16.7.
function seedTraitsIfEmpty() {
    if (!isUsingPersistentVolume()) {
        console.log(`[traits] Usando assets del repo en ${TRAITS_PATH} (sin volumen persistente).`);
        return;
    }

    fs.mkdirSync(TRAITS_PATH, { recursive: true });

    const mounted = isRealMountPoint(TRAITS_PATH);
    const previous = readMarker();

    // Esto es lo que hacia que el bug fuera invisible: sin volumen real, cada
    // reinicio encontraba el directorio vacio, volvia a sembrar, y todo lo que
    // habian subido desde el panel desaparecia sin un solo error.
    if (!mounted) {
        console.error('='.repeat(70));
        console.error('[traits] PELIGRO: TRAITS_PATH NO es un volumen montado.');
        console.error(`[traits] Ruta: ${TRAITS_PATH}`);
        console.error('[traits] Se esta escribiendo en el disco efimero del contenedor:');
        console.error('[traits] TODO lo que se suba desde /admin se va a perder al reiniciar.');
        console.error('[traits] Revisar que el mount path del volumen en Railway sea');
        console.error('[traits] exactamente igual al valor de TRAITS_PATH.');
        console.error('='.repeat(70));
    }

    if (previous) {
        console.log(`[traits] Marcador encontrado: creado ${previous.createdAt}, ${previous.boots} arranque(s).`);
    } else if (mounted) {
        console.log('[traits] Sin marcador previo: es el primer arranque sobre este volumen.');
    } else {
        console.error('[traits] Sin marcador previo, y van varios arranques: se perdio el contenido.');
    }

    writeMarker({
        createdAt: previous?.createdAt || new Date().toISOString(),
        lastBootAt: new Date().toISOString(),
        boots: (previous?.boots || 0) + 1,
        mounted
    });

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
    seedTraitsIfEmpty,
    getStorageStatus
};
