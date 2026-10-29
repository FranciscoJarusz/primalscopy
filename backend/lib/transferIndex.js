// Las transferencias del contrato, leidas de la cadena: quien tiene cada
// Primal y desde cuando tiene Primals cada wallet. Reemplaza los barridos de
// ownerOf (la coleccion entera cada vez) del explorador, el vault, los raffles
// y las rutas del sitio.
//
// La primera vez recorre todo desde la creacion del contrato, un par de horas
// con el RPC publico; despues lee solo los bloques nuevos. Mientras no esta al
// dia, ownersOf barre como antes.
//
// Lo que tiene que ser exacto en el momento (guardar en el Cultomizer, el
// Forge, poner a entrenar, el chequeo del staking) sigue preguntando ownerOf.

const path = require('path');
const { createPublicClient, toHex } = require('viem');
const { apeChain } = require('viem/chains');
const { ASSETS_ROOT } = require('./assetStore');
const { readJson, writeJson } = require('./jsonFiles');
const { CONTRACT_ADDRESS, getTokenOwners } = require('./nftOwnership');

const STATE_PATH = path.join(ASSETS_ROOT, 'transfers', 'index.json');
const DESDE = Number(process.env.NFT_FROM_BLOCK || 7252166);
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const CERO = '0x0000000000000000000000000000000000000000';
const CONFIRMACIONES = 2;
const PASO_MIN = 500;
const PASO_MAX = 200000;
const RAPIDO_MS = 5000;
const CADA_MS = 20 * 1000;
const AL_DIA_MS = 5 * 60 * 1000;
const GUARDAR_CADA_MS = 10 * 60 * 1000;
const FORMATO = 2;

function fuenteDeLaCadena() {
    const client = createPublicClient({ chain: apeChain, transport: require('./cadena').transporte({ timeout: 30000 }) });
    return {
        head: async () => Number(await client.getBlockNumber({ cacheTime: 0 })),
        getLogs: (desde, hasta) => client.request({
            method: 'eth_getLogs',
            params: [{ address: CONTRACT_ADDRESS, topics: [TRANSFER], fromBlock: toHex(desde), toBlock: toHex(hasta) }]
        }),
        blockTime: async numero => Number((await client.getBlock({ blockNumber: BigInt(numero) })).timestamp) * 1000
    };
}

let fuente = null;
let estado = null;
let version = 0;
let duenosMemo = { version: -1, mapa: null };
let paso = 50000;
let guardadoEn = 0;
let corriendo = null;

const vacio = () => ({
    formato: FORMATO,
    contract: CONTRACT_ADDRESS.toLowerCase(),
    fromBlock: DESDE,
    lastBlock: DESDE - 1,
    headBlock: null,
    owners: {},
    acquiredAt: {},
    minters: {},
    wallets: {}
});

function leer() {
    if (estado) return estado;
    const guardado = readJson(STATE_PATH, null);
    const sirve = guardado?.formato === FORMATO && guardado.contract === CONTRACT_ADDRESS.toLowerCase() && guardado.fromBlock === DESDE;
    estado = sirve ? guardado : vacio();
    estado.syncedAt = null;
    return estado;
}

function guardar() {
    const { syncedAt, ...resto } = leer();
    writeJson(STATE_PATH, resto);
    guardadoEn = Date.now();
}

const direccion = topic => `0x${topic.slice(26)}`.toLowerCase();

function quitar(wallet, quema) {
    const w = estado.wallets[wallet];
    if (!w) return;
    if (!quema) w.sent = (w.sent ?? 0) + 1;
    w.count = Math.max(0, w.count - 1);
    if (w.count === 0) w.since = null;
}

function sumar(wallet, t, minteo) {
    const w = (estado.wallets[wallet] ??= { count: 0, since: null, first: t, minted: 0 });
    if (w.count === 0) w.since = t;
    w.count++;
    if (minteo) w.minted++;
}

// `logs` en orden, cada uno con `t` (la hora del bloque, en ms).
function aplicar(logs) {
    leer();
    for (const log of logs) {
        const from = direccion(log.topics[1]);
        const to = direccion(log.topics[2]);
        const id = BigInt(log.topics[3]).toString();
        if (from !== CERO) quitar(from, to === CERO);
        if (to === CERO) {
            delete estado.owners[id];
            delete estado.acquiredAt[id];
            delete estado.minters[id];
            continue;
        }
        if (from === CERO) estado.minters[id] = to;
        estado.owners[id] = to;
        estado.acquiredAt[id] = log.t;
        sumar(to, log.t, from === CERO);
    }
    if (logs.length) version++;
}

// Algunos RPC no mandan blockTimestamp en los logs: esos se piden por bloque.
async function conFechas(logs) {
    const porBloque = new Map();
    for (const log of logs) {
        if (log.blockTimestamp) {
            log.t = Number(BigInt(log.blockTimestamp)) * 1000;
            continue;
        }
        const numero = Number(BigInt(log.blockNumber));
        if (!porBloque.has(numero)) porBloque.set(numero, await fuente.blockTime(numero));
        log.t = porBloque.get(numero);
    }
    return logs;
}

async function avanzar() {
    fuente ??= fuenteDeLaCadena();
    const e = leer();
    const head = (await fuente.head()) - CONFIRMACIONES;
    e.headBlock = head;
    const cambiosAntes = version;
    while (e.lastBlock < head) {
        const desde = e.lastBlock + 1;
        const hasta = Math.min(desde + paso - 1, head);
        const inicio = Date.now();
        let logs;
        try {
            logs = await fuente.getLogs(desde, hasta);
        } catch (error) {
            if (paso <= PASO_MIN) throw error;
            paso = Math.max(PASO_MIN, Math.floor(paso / 2));
            continue;
        }
        if (Date.now() - inicio < RAPIDO_MS) paso = Math.min(PASO_MAX, paso * 2);
        aplicar(await conFechas(logs));
        e.lastBlock = hasta;
        if (Date.now() - guardadoEn > GUARDAR_CADA_MS) guardar();
    }
    e.syncedAt = Date.now();
    if (version !== cambiosAntes || Date.now() - guardadoEn > GUARDAR_CADA_MS) guardar();
}

// Una a la vez: si el admin lo pide mientras corre la automatica, espera esa.
function sincronizar() {
    corriendo ??= avanzar().finally(() => { corriendo = null; });
    return corriendo;
}

function alDia() {
    const { syncedAt } = leer();
    return Boolean(syncedAt) && Date.now() - syncedAt < AL_DIA_MS;
}

// Tokens -> dueño en minusculas, o null si el indice no esta al dia. Es el
// mismo Map mientras no haya transferencias nuevas.
function duenos() {
    if (!alDia()) return null;
    if (duenosMemo.version !== version) duenosMemo = { version, mapa: new Map(Object.entries(estado.owners)) };
    return duenosMemo.mapa;
}

// Mismo formato que getTokenOwners (null si el token no existe): del indice si
// esta al dia, si no de la cadena.
async function ownersOf(ids) {
    const mapa = duenos();
    if (!mapa) return getTokenOwners(ids);
    return new Map(ids.map(String).map(id => [id, mapa.get(id) ?? null]));
}

const iso = t => (t ? new Date(t).toISOString() : null);

// Desde cuando tiene Primals sin haber quedado en cero (`since`), su primera
// compra o minteo (`first`), cuantos minteo, cuantos de esos sigue teniendo y
// cuantos mando a otra wallet (ventas incluidas). null si el indice no esta al dia.
function holderSince(wallet) {
    if (!alDia()) return null;
    const key = String(wallet).toLowerCase();
    const w = estado.wallets[key];
    if (!w) return { since: null, first: null, minted: 0, mintedHeld: 0, sent: 0 };
    const mintedHeld = Object.entries(estado.minters).filter(([id, m]) => m === key && estado.owners[id] === key).length;
    return { since: iso(w.since), first: iso(w.first), minted: w.minted, mintedHeld, sent: w.sent ?? 0 };
}

function status() {
    const e = leer();
    const total = e.headBlock === null ? null : e.headBlock - e.fromBlock + 1;
    return {
        ready: alDia(),
        fromBlock: e.fromBlock,
        lastBlock: e.lastBlock,
        headBlock: e.headBlock,
        progress: total ? Math.min(1, Math.max(0, (e.lastBlock - e.fromBlock + 1) / total)) : 0,
        syncedAt: iso(e.syncedAt),
        tokens: Object.keys(e.owners).length,
        holders: Object.values(e.wallets).filter(w => w.count > 0).length,
        running: Boolean(corriendo)
    };
}

function startTransferIndex() {
    const tick = () => sincronizar()
        .then(() => setTimeout(tick, CADA_MS).unref())
        .catch(error => {
            console.warn(`[transfers] No se pudo leer la cadena: ${error.message}`);
            setTimeout(tick, CADA_MS * 3).unref();
        });
    tick();
}

function usarFuente(otra) {
    fuente = otra;
    estado = null;
    version++;
    paso = 50000;
}

module.exports = { startTransferIndex, sincronizar, alDia, duenos, ownersOf, holderSince, status, usarFuente, aplicar, STATE_PATH };
