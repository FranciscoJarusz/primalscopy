// lib/labStore.js
//
// Estado del LAB en el volumen: el roll pendiente de cada NFT y el historial.
//
// Un roll pendiente es uno que ya se pago y cuyas dos opciones ya se
// mostraron, pero que el dueño todavia no eligio ni cancelo. Se guarda en
// disco y no en memoria por dos razones:
//   - Recargar la pagina tiene que mostrar las MISMAS dos opciones. Si no, se
//     podria recargar hasta que salga algo bueno sin volver a pagar.
//   - Un reinicio del server (cada deploy) no puede hacer perder un roll pago.
//
// El historial es append-only: cada roll, eleccion y cancelacion queda
// registrado. Como cada roll se cobra, es lo que permite contestar un reclamo.

const fs = require('fs');
const path = require('path');
const { ASSETS_ROOT, writeAtomic } = require('./assetStore');

const LAB_DIR = path.join(ASSETS_ROOT, 'lab');
const PENDING_DIR = path.join(LAB_DIR, 'pending');
const HISTORY_PATH = path.join(LAB_DIR, 'history.jsonl');
// NFTs que el modo de prueba modifico solo en este volumen, con una copia de
// como estaban antes. Ver markSandbox.
const SANDBOX_DIR = path.join(LAB_DIR, 'sandbox');

const TOKEN_ID_REGEX = /^\d{1,10}$/;

function pendingPath(tokenId) {
    const id = String(tokenId);
    if (!TOKEN_ID_REGEX.test(id)) throw new Error(`Token id invalido: ${tokenId}`);
    return path.join(PENDING_DIR, `${id}.json`);
}

function readPending(tokenId) {
    try {
        return JSON.parse(fs.readFileSync(pendingPath(tokenId), 'utf8'));
    } catch {
        return null;
    }
}

function writePending(tokenId, roll) {
    fs.mkdirSync(PENDING_DIR, { recursive: true });
    writeAtomic(pendingPath(tokenId), JSON.stringify(roll, null, 2));
}

function clearPending(tokenId) {
    fs.rmSync(pendingPath(tokenId), { force: true });
}

function appendHistory(entry) {
    fs.mkdirSync(LAB_DIR, { recursive: true });
    fs.appendFileSync(HISTORY_PATH, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

function readHistory() {
    try {
        return fs.readFileSync(HISTORY_PATH, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line));
    } catch {
        return [];
    }
}

// El modo de prueba escribe los traits nuevos solo en el volumen local. El
// riesgo es lo que pasa despues: el customizer publica en produccion leyendo
// la metadata de este volumen, asi que un guardado normal subiria los traits
// de prueba como si fueran reales. Por eso, antes de la primera escritura de
// prueba sobre un NFT se guarda una copia de como estaba, y mientras la marca
// exista publicarNft se niega a subirlo. scripts/lab-reset-sandbox.js
// restaura las copias y borra las marcas.
function markSandbox(tokenId, files) {
    const dir = path.join(SANDBOX_DIR, String(tokenId));
    pendingPath(tokenId); // valida el id antes de armar rutas con el
    if (fs.existsSync(dir)) return; // la copia buena es la de ANTES de la primera prueba

    fs.mkdirSync(dir, { recursive: true });
    const saved = {};
    for (const [name, source] of Object.entries(files)) {
        if (!fs.existsSync(source)) continue;
        fs.copyFileSync(source, path.join(dir, name));
        saved[name] = source;
    }
    // Donde va cada copia. Se escribe al final: si esta el archivo, la copia
    // esta completa.
    writeAtomic(path.join(dir, 'restore.json'), JSON.stringify({ tokenId: String(tokenId), saved, files }, null, 2));
}

function isSandbox(tokenId) {
    return fs.existsSync(path.join(SANDBOX_DIR, String(tokenId)));
}

function listSandbox() {
    try {
        return fs.readdirSync(SANDBOX_DIR);
    } catch {
        return [];
    }
}

function sandboxDir(tokenId) {
    return path.join(SANDBOX_DIR, String(tokenId));
}

module.exports = {
    LAB_DIR,
    readPending,
    writePending,
    clearPending,
    appendHistory,
    readHistory,
    markSandbox,
    isSandbox,
    listSandbox,
    sandboxDir
};
