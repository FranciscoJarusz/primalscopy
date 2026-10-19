const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ASSETS_ROOT, writeAtomic } = require('./assetStore');
const { readJson, writeJson, intEntre } = require('./jsonFiles');

const DIR = path.join(ASSETS_ROOT, 'staking');
const WHEELS_PATH = path.join(DIR, 'wheels.json');
const WINS_PATH = path.join(DIR, 'prizes.json');
const VAULT_PATH = path.join(DIR, 'vault.json');
const IMAGES_DIR = path.join(DIR, 'prizes');
const IMAGE_FILE_REGEX = /^[a-z0-9-]{1,60}-\d{13}\.webp$/;
const IMAGE_SIZE = 384;

// Los premios del catalogo que son ruletas. El resto se canjea directo.
const WHEEL_ITEMS = ['lowkey', 'highkey', 'fogkey', 'summon-shard'];
const KINDS = ['fog', 'ape', 'nft'];
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

// El consuelo: lo que toca cuando no toca nada mejor.
const CONSUELO = { id: 'fog-1000', label: '1,000 FOG', kind: 'fog', amount: 1000, weight: 60, stock: null, image: null };

function readWheels() {
    const saved = readJson(WHEELS_PATH, {});
    const wheels = {};
    for (const id of WHEEL_ITEMS) {
        const w = saved.wheels?.[id];
        wheels[id] = {
            prizes: w?.prizes ?? [{ ...CONSUELO }],
            // Solo el Summon shard: el peso de cada Primal del vault.
            ...(id === 'summon-shard' ? { vaultWeight: w?.vaultWeight ?? 10 } : {})
        };
    }
    return { wheels, vault: saved.vault ?? null };
}

const readWins = () => readJson(WINS_PATH, []);
const readVault = () => readJson(VAULT_PATH, { at: null, tokenIds: [] });

// Los Primals del vault que se pueden ganar: los que tiene ahora, menos los
// que ya le tocaron a alguien y todavia no se mandaron.
function vaultPrizes(wheel, wins = readWins()) {
    const reservados = new Set(wins.filter(w => w.prize.kind === 'primal' && w.status === 'pending').map(w => w.prize.tokenId));
    return readVault().tokenIds
        .filter(id => !reservados.has(id))
        .map(tokenId => ({
            id: `primal-${tokenId}`,
            label: `Primal Cult #${tokenId}`,
            kind: 'primal',
            tokenId,
            weight: wheel.vaultWeight,
            stock: 1,
            image: null
        }));
}

function pool(itemId, data = readWheels(), wins = readWins()) {
    const wheel = data.wheels[itemId];
    if (!wheel) return [];
    const propios = wheel.prizes.filter(p => p.weight > 0 && (p.stock === null || p.stock > 0));
    return itemId === 'summon-shard' ? [...propios, ...vaultPrizes(wheel, wins)] : propios;
}

// Se puede comprar si queda algun premio que no sea FOG: si solo quedara el
// consuelo, la key no tendria sentido.
function isAvailable(itemId) {
    return pool(itemId).some(p => p.kind !== 'fog');
}

function publicPrize(p, total) {
    return {
        id: p.id,
        label: p.label,
        kind: p.kind,
        amount: p.amount ?? null,
        tokenId: p.tokenId ?? null,
        image: p.image ?? null,
        stock: p.stock,
        chance: total ? p.weight / total : 0
    };
}

// Si la ruleta tiene algun premio que no sea FOG cargado, aunque hoy no tenga
// stock: la tienda dice "Sold out" y no "Soon".
function hasPrizes(itemId) {
    const data = readWheels();
    const wheel = data.wheels[itemId];
    if (!wheel) return false;
    if (itemId === 'summon-shard' && data.vault && wheel.vaultWeight > 0) return true;
    return wheel.prizes.some(p => p.kind !== 'fog' && p.weight > 0);
}

// Un premio que no sale de una ruleta pero se entrega igual a mano (los APE
// de la tienda). Queda en la misma lista de entregas del admin.
function addDelivery(wallet, itemId, prize, id) {
    const wins = readWins();
    const win = {
        id,
        wallet: wallet.toLowerCase(),
        item: itemId,
        prize: { id: itemId, label: prize.label, kind: prize.kind, amount: prize.amount ?? null, tokenId: null, image: null },
        chance: 1,
        status: 'pending',
        at: new Date().toISOString()
    };
    wins.push(win);
    writeJson(WINS_PATH, wins);
    return win;
}

// Los ultimos premios de las ruletas, para el cartel de /staking. Sin el
// consuelo de FOG (lo que toca casi siempre): solo lo que da ganas de abrir.
function recentWins(limit = 20) {
    return readWins()
        .filter(w => WHEEL_ITEMS.includes(w.item) && !(w.prize.kind === 'fog' && w.chance >= 0.2))
        .slice(-limit)
        .reverse()
        .map(w => ({ id: w.id, wallet: w.wallet, item: w.item, prize: w.prize, chance: w.chance, at: w.at }));
}

// Lo que ve la pagina: cada premio con su probabilidad, del mas comun al mas
// raro.
function publicWheel(itemId) {
    if (!WHEEL_ITEMS.includes(itemId)) return null;
    const premios = pool(itemId);
    const total = premios.reduce((n, p) => n + p.weight, 0);
    return {
        item: itemId,
        available: premios.some(p => p.kind !== 'fog'),
        prizes: premios.map(p => publicPrize(p, total)).sort((a, b) => b.chance - a.chance)
    };
}

/**
 * Sortea el premio de una ruleta para `wallet`, descuenta el stock y lo
 * anota. Quien llama ya cobro el FOG de la key (stakingStore.redeem).
 * Devuelve { win, fog } (fog: lo que hay que acreditar ya) o { error }.
 */
function spin(wallet, itemId, redemptionId) {
    const data = readWheels();
    const wins = readWins();
    const premios = pool(itemId, data, wins);
    const total = premios.reduce((n, p) => n + p.weight, 0);
    if (!total) return { error: 'This reward is sold out.' };

    let r = crypto.randomInt(total);
    let prize = premios[premios.length - 1];
    for (const p of premios) {
        if (r < p.weight) { prize = p; break; }
        r -= p.weight;
    }

    if (prize.kind !== 'primal' && prize.stock !== null) {
        const guardado = data.wheels[itemId].prizes.find(p => p.id === prize.id);
        guardado.stock -= 1;
        writeJson(WHEELS_PATH, data);
    }

    const win = {
        id: redemptionId,
        wallet,
        item: itemId,
        prize: { id: prize.id, label: prize.label, kind: prize.kind, amount: prize.amount ?? null,
            tokenId: prize.tokenId ?? null, image: prize.image ?? null },
        chance: prize.weight / total,
        // El FOG ya queda en la wallet; lo demas lo manda el admin.
        status: prize.kind === 'fog' ? 'credited' : 'pending',
        at: new Date().toISOString()
    };
    wins.push(win);
    writeJson(WINS_PATH, wins);
    return { win, fog: prize.kind === 'fog' ? prize.amount : 0 };
}

function findWin(id) {
    return readWins().find(w => w.id === id) ?? null;
}

function winsOf(wallet) {
    const key = wallet.toLowerCase();
    return readWins().filter(w => w.wallet === key).reverse().slice(0, 50);
}


// Lee de la cadena que Primals tiene el vault. Lo llama el chequeo periodico
// (stakingJob) y el admin. `getTokenOwners` y `totalSupply` vienen de afuera
// para poder simularlos en los tests.
async function refreshVault({ getTokenOwners, totalSupply }) {
    const { vault } = readWheels();
    if (!vault) {
        writeJson(VAULT_PATH, { at: new Date().toISOString(), tokenIds: [] });
        return { tokenIds: [] };
    }
    const ids = Array.from({ length: totalSupply }, (_, i) => String(i + 1));
    const owners = await getTokenOwners(ids);
    const tokenIds = ids.filter(id => owners.get(id) === vault);
    writeJson(VAULT_PATH, { at: new Date().toISOString(), tokenIds });
    return { tokenIds };
}


function adminWheels() {
    const data = readWheels();
    const wins = readWins();
    const vault = readVault();
    const ruletas = {};
    for (const id of WHEEL_ITEMS) {
        const premios = pool(id, data, wins);
        const total = premios.reduce((n, p) => n + p.weight, 0);
        ruletas[id] = {
            ...data.wheels[id],
            chances: Object.fromEntries(premios.map(p => [p.id, total ? p.weight / total : 0])),
            ...(id === 'summon-shard' ? { vaultAvailable: vaultPrizes(data.wheels[id], wins).length } : {})
        };
    }
    return {
        wheels: ruletas,
        vault: { address: data.vault, at: vault.at, count: vault.tokenIds.length },
        wins: wins.slice().reverse().slice(0, 200)
    };
}

/**
 * Reemplaza los premios de una ruleta (y, en el Summon shard, el peso de los
 * Primals del vault). Los premios que ya existian conservan su imagen.
 * Devuelve { ok } o { error }.
 */
function updateWheel(itemId, { prizes, vaultWeight } = {}) {
    const data = readWheels();
    const wheel = data.wheels[itemId];
    if (!wheel) return { error: 'Unknown wheel.' };
    if (!Array.isArray(prizes) || prizes.length > 50) return { error: 'A wheel can have up to 50 prizes.' };

    const nuevos = [];
    for (const p of prizes) {
        const label = String(p?.label || '').trim().slice(0, 60);
        if (!label) return { error: 'Every prize needs a name.' };
        if (!KINDS.includes(p?.kind)) return { error: `${label}: pick what kind of prize it is.` };
        const weight = intEntre(p.weight, 0, 1000000);
        if (weight === null) return { error: `${label}: the weight must be a whole number, 0 or more.` };
        const stock = p.stock === null || p.stock === '' || p.stock === undefined ? null : intEntre(p.stock, 0, 1000000);
        if (stock === null && !(p.stock === null || p.stock === '' || p.stock === undefined)) {
            return { error: `${label}: the stock must be a whole number, or empty for unlimited.` };
        }
        let amount = null;
        if (p.kind !== 'nft') {
            amount = intEntre(p.amount, 1, 1000000000);
            if (amount === null) return { error: `${label}: how much ${p.kind === 'fog' ? 'FOG' : 'APE'} does it give?` };
        }
        const id = /^[a-z0-9-]{1,40}$/.test(String(p.id || '')) ? p.id : crypto.randomUUID().slice(0, 8);
        if (nuevos.some(x => x.id === id)) return { error: 'Two prizes have the same id.' };
        const anterior = wheel.prizes.find(x => x.id === id);
        nuevos.push({ id, label, kind: p.kind, amount, weight, stock, image: anterior?.image ?? null });
    }

    for (const viejo of wheel.prizes) {
        if (viejo.image && !nuevos.some(n => n.id === viejo.id)) borrarImagen(viejo.image);
    }
    wheel.prizes = nuevos;
    if (itemId === 'summon-shard' && vaultWeight !== undefined) {
        const w = intEntre(vaultWeight, 0, 1000000);
        if (w === null) return { error: 'The weight of each vault Primal must be a whole number, 0 or more.' };
        wheel.vaultWeight = w;
    }
    writeJson(WHEELS_PATH, data);
    return { ok: true };
}

function setVault(address) {
    const data = readWheels();
    if (address && !ADDRESS_REGEX.test(String(address))) return { error: 'That is not a wallet address.' };
    data.vault = address ? String(address).toLowerCase() : null;
    writeJson(WHEELS_PATH, data);
    return { ok: true };
}

// Marca una entrega como enviada (o la vuelve a pendiente), con una nota
// opcional (el hash de la transaccion, por ejemplo).
function setWinStatus(id, { status, note } = {}) {
    if (!['pending', 'sent'].includes(status)) return { error: 'Invalid status.' };
    const wins = readWins();
    const win = wins.find(w => w.id === id);
    if (!win) return { error: 'Unknown prize.' };
    if (win.status === 'credited') return { error: 'FOG prizes are credited on their own.' };
    win.status = status;
    win.note = String(note || '').trim().slice(0, 200) || undefined;
    win.sentAt = status === 'sent' ? new Date().toISOString() : undefined;
    writeJson(WINS_PATH, wins);
    return { ok: true };
}


function borrarImagen(file) {
    if (!file || !IMAGE_FILE_REGEX.test(file)) return;
    fs.rm(path.join(IMAGES_DIR, file), { force: true }, () => {});
}

function imagePath(file) {
    return IMAGE_FILE_REGEX.test(String(file)) ? path.join(IMAGES_DIR, file) : null;
}

async function setPrizeImage(itemId, prizeId, buffer) {
    if (!readWheels().wheels[itemId]?.prizes.some(p => p.id === prizeId)) return { error: 'Unknown prize. Save the wheel first.', status: 404 };
    let webp;
    try {
        webp = await require('sharp')(buffer, { animated: true })
            .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 88 })
            .toBuffer();
    } catch {
        return { error: "That file isn't an image we can read.", status: 400 };
    }
    const data = readWheels();
    const prize = data.wheels[itemId]?.prizes.find(p => p.id === prizeId);
    if (!prize) return { error: 'Unknown prize. Save the wheel first.', status: 404 };
    const file = `${itemId}-${prizeId}-${Date.now()}.webp`.toLowerCase();
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    writeAtomic(path.join(IMAGES_DIR, file), webp);
    borrarImagen(prize.image);
    prize.image = file;
    writeJson(WHEELS_PATH, data);
    return { ok: true, image: file };
}

module.exports = {
    WHEEL_ITEMS,
    isAvailable,
    hasPrizes,
    addDelivery,
    recentWins,
    publicWheel,
    spin,
    findWin,
    winsOf,
    refreshVault,
    adminWheels,
    updateWheel,
    setVault,
    setWinStatus,
    setPrizeImage,
    imagePath
};
