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

// El trim no es cosmetico. Pegar la ruta en el dashboard de Railway arrastraba
// un espacio adelante, y como " /data/traits" no empieza con "/", path.resolve
// lo tomaba como relativo y lo colgaba del cwd: "/app/ /data/traits", una
// carpeta en disco efimero al lado del volumen real, que quedaba vacio. Todo
// funcionaba salvo que se perdia en cada reinicio.
const RAW_TRAITS_PATH = (process.env.TRAITS_PATH || '').trim();
const TRAITS_PATH = RAW_TRAITS_PATH
    ? path.resolve(RAW_TRAITS_PATH)
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

// Entradas que un volumen recien creado trae solo, o que escribimos nosotros:
// ninguna cuenta como contenido real. Un volumen ext4 nuevo viene con
// lost+found, y eso alcanzaba para que el directorio pareciera poblado y la
// semilla no se copiara nunca, dejando el customizer sin un solo trait.
const NON_CONTENT_ENTRIES = new Set([MARKER_FILE, 'lost+found', '.DS_Store', 'Thumbs.db']);

function isContentEntry(entry) {
    return !NON_CONTENT_ENTRIES.has(entry) && !entry.startsWith('.');
}

// "Tiene contenido" significa que hay al menos una carpeta de categoria, no que
// el directorio no este vacio.
function directoryHasEntries(dir) {
    try {
        return fs.readdirSync(dir).some(entry => {
            if (!isContentEntry(entry)) return false;
            try {
                return fs.statSync(path.join(dir, entry)).isDirectory();
            } catch {
                return false;
            }
        });
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

// Una ruta relativa en produccion es casi siempre un valor mal pegado: el
// volumen se monta en una ruta absoluta, nunca colgando del cwd.
function hasRelativePathMistake() {
    return Boolean(RAW_TRAITS_PATH) && !path.isAbsolute(RAW_TRAITS_PATH);
}

function getStorageStatus() {
    const marker = readMarker();
    return {
        traitsPath: TRAITS_PATH,
        rawTraitsPath: RAW_TRAITS_PATH,
        configuredViaEnv: isUsingPersistentVolume(),
        isRealMountPoint: isRealMountPoint(TRAITS_PATH),
        relativePathMistake: hasRelativePathMistake(),
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
    if (hasRelativePathMistake()) {
        console.error('='.repeat(70));
        console.error('[traits] TRAITS_PATH es una ruta RELATIVA, casi seguro un error.');
        console.error(`[traits] Valor recibido: ${JSON.stringify(RAW_TRAITS_PATH)}`);
        console.error(`[traits] Resuelto contra ${process.cwd()} queda: ${TRAITS_PATH}`);
        console.error('[traits] El mount path de un volumen es SIEMPRE absoluto (ej: /data/traits).');
        console.error('='.repeat(70));
    }

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
