// Estado del Forge en el volumen: el roll pendiente de cada NFT, los pagos y el
// historial.
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
const { readJson, writeJson, appendJsonLine, readJsonLines } = require('./jsonFiles');

const FORGE_DIR = path.join(ASSETS_ROOT, 'forge');
const PENDING_DIR = path.join(FORGE_DIR, 'pending');
const HISTORY_PATH = path.join(FORGE_DIR, 'history.jsonl');
// NFTs que el modo de prueba modifico solo en este volumen, con una copia de
// como estaban antes. Ver markSandbox.
const SANDBOX_DIR = path.join(FORGE_DIR, 'sandbox');

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
    appendJsonLine(HISTORY_PATH, entry);
}

function readHistory() {
    return readJsonLines(HISTORY_PATH, 'forge');
}

// Pagos verificados, por hash: { wallet, valueWei, blockNumber, status,
// rollId?, ... }. `status` es 'available' (roll pagado sin usar) o 'used'. Un
// hash que ya esta aca no se vuelve a aceptar, este usado o no: es lo que
// impide cobrar dos rolls con la misma transferencia.
//
// Tambien guarda los rolls gratis de los codigos promocionales (ver
// lib/promoStore.js), con `source: 'promo'` y una clave "promo:..." en vez de
// un hash, y los que se compran con FOG en el staking (lib/stakingStore.js),
// con `source: 'fog'` y una clave "fog:...". Valen igual que un pago, pero no
// son plata: el que haga la cuenta del treasury tiene que mirar solo los de
// `source` vacio.
//
// Todas las funciones de aca son sincronicas a proposito: leer, decidir y
// escribir sin un await en el medio hace que dos pedidos a la vez no puedan
// tomar el mismo pago.
const PAYMENTS_PATH = path.join(FORGE_DIR, 'payments.json');

function readPayments() {
    return readJson(PAYMENTS_PATH, {});
}

function writePayments(payments) {
    writeJson(PAYMENTS_PATH, payments);
}

function getPayment(txHash) {
    return readPayments()[String(txHash).toLowerCase()] || null;
}

// Registra un pago nuevo como roll disponible. Devuelve false si el hash ya
// estaba registrado (no lo pisa).
function addPayment(payment) {
    const payments = readPayments();
    const key = payment.txHash.toLowerCase();
    if (payments[key]) return false;
    payments[key] = { ...payment, status: 'available', paidAt: new Date().toISOString() };
    writePayments(payments);
    return true;
}

function sameWallet(a, b) {
    return String(a).toLowerCase() === String(b).toLowerCase();
}

// Rolls gratis de un codigo promocional. Las claves arrancan con "promo:", que
// nunca puede chocar con un hash (esos son 0x...). Devuelve las claves.
function addPromoCredits(wallet, code, amount) {
    const payments = readPayments();
    const paidAt = new Date().toISOString();
    const keys = [];
    for (let i = 0; i < amount; i++) {
        const key = `promo:${code}:${wallet.toLowerCase()}:${i}`;
        if (payments[key]) continue;
        payments[key] = { source: 'promo', code, wallet: wallet.toLowerCase(), status: 'available', paidAt };
        keys.push(key);
    }
    writePayments(payments);
    return keys;
}

// Un roll comprado con FOG. `redemptionId` es unico por canje, asi que
// llamarla dos veces con el mismo no da dos rolls. Devuelve la clave.
function addFogCredit(wallet, redemptionId) {
    const payments = readPayments();
    const key = `fog:${redemptionId}`;
    if (!payments[key]) {
        payments[key] = {
            source: 'fog',
            redemptionId,
            wallet: wallet.toLowerCase(),
            status: 'available',
            paidAt: new Date().toISOString()
        };
        writePayments(payments);
    }
    return key;
}

// Solo cuentan los pagos de la red configurada: un pago de prueba en anvil
// no puede valer como roll pagado cuando se cobra en ApeChain. Los rolls de un
// codigo o de FOG no son de ninguna red.
function isAvailableFor(payment, wallet, chainId) {
    return payment.status === 'available'
        && sameWallet(payment.wallet, wallet)
        && (Boolean(payment.source) || Number(payment.chainId) === Number(chainId));
}

function availablePayments(wallet, chainId) {
    return Object.values(readPayments())
        .filter(p => isAvailableFor(p, wallet, chainId))
        .sort((a, b) => a.paidAt.localeCompare(b.paidAt));
}

// Toma el roll pagado mas viejo de la wallet y lo marca como usado por
// `rollId`. Devuelve el pago con su clave en `id`, o null si la wallet no
// tiene ninguno. Los gratis se gastan antes que los pagados, asi un roll que
// costo plata es lo ultimo que se usa.
function takePayment(wallet, chainId, rollId, tokenId) {
    const payments = readPayments();
    const [oldest] = Object.entries(payments)
        .filter(([, p]) => isAvailableFor(p, wallet, chainId))
        .sort(([, a], [, b]) =>
            (a.source ? 0 : 1) - (b.source ? 0 : 1)
            || a.paidAt.localeCompare(b.paidAt));
    if (!oldest) return null;

    const [key, payment] = oldest;
    payments[key] = { ...payment, status: 'used', rollId, tokenId: String(tokenId), usedAt: new Date().toISOString() };
    writePayments(payments);
    return { ...payments[key], id: key };
}

// Deshace takePayment si el roll fallo despues de tomar el pago. Recibe el
// `id` que devolvio takePayment.
function returnPayment(id) {
    const payments = readPayments();
    const key = String(id);
    if (!payments[key]) return;
    const { rollId, tokenId, usedAt, ...rest } = payments[key];
    payments[key] = { ...rest, status: 'available' };
    writePayments(payments);
}

// El modo de prueba escribe los traits nuevos solo en el volumen local. El
// riesgo es lo que pasa despues: el customizer publica en produccion leyendo
// la metadata de este volumen, asi que un guardado normal subiria los traits
// de prueba como si fueran reales. Por eso, antes de la primera escritura de
// prueba sobre un NFT se guarda una copia de como estaba, y mientras la marca
// exista publicarNft se niega a subirlo. scripts/forge-reset-sandbox.js
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
    FORGE_DIR,
    readPending,
    writePending,
    clearPending,
    appendHistory,
    readHistory,
    getPayment,
    readPayments,
    addPayment,
    addPromoCredits,
    addFogCredit,
    availablePayments,
    takePayment,
    returnPayment,
    markSandbox,
    isSandbox,
    listSandbox,
    sandboxDir
};
