// Las insignias del perfil (beta). Todas se definen desde el admin: nombre,
// imagen y regla. La regla es automatica (una metrica de la wallet comparada
// con un valor) o manual (la lista de wallets que la tienen).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ASSETS_ROOT, writeAtomic } = require('./assetStore');
const { readJson, writeJson } = require('./jsonFiles');

const DIR = path.join(ASSETS_ROOT, 'badges');
const DEFS_PATH = path.join(DIR, 'badges.json');
const IMAGES_DIR = path.join(DIR, 'images');
const IMAGE_FILE_REGEX = /^[a-z0-9-]{1,40}-\d{13}\.webp$/;
const ID_REGEX = /^[a-z0-9-]{1,40}$/;
const WALLET_REGEX = /^0x[0-9a-f]{40}$/;
const IMAGE_SIZE = 512;
const DAY_MS = 24 * 60 * 60 * 1000;

const METRICAS = [
    { id: 'primals', label: 'Primals held' },
    { id: 'oneOfOnes', label: '1/1s held' },
    { id: 'minted', label: 'Primals minted' },
    { id: 'mintedHeld', label: 'Minted Primals still held' },
    { id: 'sent', label: 'Primals sent or sold' },
    { id: 'daysHolding', label: 'Days holding without dropping to zero' },
    { id: 'firstYear', label: 'Year of the first Primal' },
    { id: 'customizations', label: 'Cultomizer saves' },
    { id: 'forgeRolls', label: 'Forge rolls' },
    { id: 'traitDrops', label: 'Trait drops bought' },
    { id: 'stakingBest', label: 'Longest staking streak (days)' },
    { id: 'stakingNow', label: 'Primals staking now' },
    { id: 'fogEarned', label: 'FOG earned' },
    { id: 'stakedPeriod', label: 'Stakes started in a period', param: 'Period in days' },
    { id: 'redeemed', label: 'Shop redemptions', param: 'Item id (empty: any)' },
    { id: 'nickname', label: 'Has a nickname (1 = yes)' },
    { id: 'xProfile', label: 'Has X in the profile (1 = yes)' }
];
const OPS = ['>=', '<=', '='];

const auto = (id, name, description, metric, op, value, param = '') =>
    ({ id, name, description, kind: 'auto', metric, op, value, param, wallets: [], holdersOnly: true, hidden: false, enabled: true, image: null });
const manual = (id, name, description) =>
    ({ id, name, description, kind: 'manual', metric: 'primals', op: '>=', value: 1, param: '', wallets: [], holdersOnly: false, hidden: false, enabled: true, image: null });

// Las del boceto de Trout, para arrancar. Se editan o borran desde el admin.
const SEMILLA = [
    auto('one-of-one', '1/1 Owner', 'Holds a 1/1.', 'oneOfOnes', '>=', 1),
    auto('primal-holder', 'Primal Holder', 'Holds at least one Primal.', 'primals', '>=', 1),
    auto('class-of-2024', 'Class of 2024', 'First Primal in 2024.', 'firstYear', '=', 2024),
    auto('mint-loyal', 'Mint Loyal', 'Still holds a Primal they minted.', 'mintedHeld', '>=', 1),
    auto('diamond-hands', 'Diamond Hands', 'Never sent or sold a Primal.', 'sent', '<=', 0),
    auto('cultomized', 'Cultomized', 'Saved a look in the Cultomizer.', 'customizations', '>=', 1),
    auto('fog-earned', 'FOG Earned', 'Earned 1,000 FOG staking.', 'fogEarned', '>=', 1000),
    ...[7, 14, 30, 90, 120].map(d => auto(`staking-${d}`, `Staking ${d}D`, `${d} days staking in a row.`, 'stakingBest', '>=', d)),
    auto('varnoss', 'Varnoss Resident', 'Staked in Varnoss Island.', 'stakedPeriod', '>=', 1, '7'),
    auto('baum', 'Baum Resident', 'Staked in Baum Land.', 'stakedPeriod', '>=', 1, '14'),
    auto('lornshore', 'Lornshore Resident', 'Staked in Lornshore State.', 'stakedPeriod', '>=', 1, '30'),
    auto('fogreach', 'Fogreach Resident', 'Staked in the Fogreach Republic.', 'stakedPeriod', '>=', 1, '90'),
    auto('gambler', 'Gambler', 'Spun a key in the Shop.', 'redeemed', '>=', 1),
    auto('forge-reroll', 'Forge Reroll Used', 'Rolled a trait in the Forge.', 'forgeRolls', '>=', 1),
    auto('event-attender', 'Event Attender', 'Bought a trait drop.', 'traitDrops', '>=', 1),
    auto('id-created', 'ID Created', 'Picked a nickname.', 'nickname', '=', 1),
    auto('x-linked', 'X Linked', 'Added their X to the profile.', 'xProfile', '=', 1),
    ...[['sentinel', 2], ['believer', 5], ['vanguard', 10], ['hoarder', 20], ['relicwarden', 30], ['eminence', 50], ['paragon', 80], ['archon', 100], ['plerom', 200]]
        .map(([slug, n]) => ({ ...auto(`role-${slug}`, slug[0].toUpperCase() + slug.slice(1), `Holds ${n} or more Primals.`, 'primals', '>=', n), hidden: n > 10 })),
    manual('morale-amulet', 'Morale Amulet Creator', 'Given by the team.'),
    manual('showdown', 'Showdown Winner', 'Given by the team.'),
    manual('anniversary', 'Anniversary', 'Was there.'),
    manual('miner', 'Miner', 'Given by the team.'),
    manual('beer-chugger', 'Beer Chugger', 'Given by the team.')
];

function leer() {
    const guardadas = readJson(DEFS_PATH, null);
    return Array.isArray(guardadas) ? guardadas : SEMILLA.map(b => ({ ...b }));
}

const escribir = lista => writeJson(DEFS_PATH, lista);

const texto = (v, max) => String(v ?? '').trim().slice(0, max);

function limpiar(body, actual) {
    const b = { ...actual };
    if ('name' in body) b.name = texto(body.name, 60);
    if ('description' in body) b.description = texto(body.description, 200);
    if ('kind' in body) b.kind = body.kind === 'manual' ? 'manual' : 'auto';
    if ('metric' in body) b.metric = String(body.metric);
    if ('op' in body) b.op = String(body.op);
    if ('value' in body) b.value = Number(body.value);
    if ('param' in body) b.param = texto(body.param, 40);
    if ('holdersOnly' in body) b.holdersOnly = Boolean(body.holdersOnly);
    if ('hidden' in body) b.hidden = Boolean(body.hidden);
    if ('enabled' in body) b.enabled = Boolean(body.enabled);
    if ('wallets' in body) {
        const lista = Array.isArray(body.wallets) ? body.wallets : String(body.wallets).split(/[\s,]+/);
        const wallets = lista.map(w => String(w).trim().toLowerCase()).filter(Boolean);
        const mala = wallets.find(w => !WALLET_REGEX.test(w));
        if (mala) return { error: `"${mala}" isn't a wallet.` };
        b.wallets = [...new Set(wallets)];
    }
    if (!b.name) return { error: 'The badge needs a name.' };
    if (!METRICAS.some(m => m.id === b.metric)) return { error: 'Unknown metric.' };
    if (!OPS.includes(b.op)) return { error: 'Unknown comparison.' };
    if (!Number.isFinite(b.value)) return { error: 'The value must be a number.' };
    return { badge: b };
}

function admin() {
    return { badges: leer(), metrics: METRICAS, ops: OPS };
}

function crear(body) {
    const lista = leer();
    const base = String(body?.name || 'badge').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'badge';
    let id = base;
    for (let i = 2; lista.some(b => b.id === id); i++) id = `${base}-${i}`;
    const r = limpiar(body || {}, { ...auto(id, '', '', 'primals', '>=', 1), enabled: false });
    if (r.error) return { error: r.error, status: 400 };
    lista.push(r.badge);
    escribir(lista);
    return admin();
}

function actualizar(id, body) {
    const lista = leer();
    const i = lista.findIndex(b => b.id === id);
    if (i < 0) return { error: 'Unknown badge.', status: 404 };
    const r = limpiar(body || {}, lista[i]);
    if (r.error) return { error: r.error, status: 400 };
    lista[i] = r.badge;
    escribir(lista);
    return admin();
}

function borrarImagen(file) {
    if (file && IMAGE_FILE_REGEX.test(file)) fs.rm(path.join(IMAGES_DIR, file), { force: true }, () => {});
}

function borrar(id) {
    const lista = leer();
    const b = lista.find(x => x.id === id);
    if (!b) return { error: 'Unknown badge.', status: 404 };
    borrarImagen(b.image);
    escribir(lista.filter(x => x.id !== id));
    return admin();
}

function ordenar(ids) {
    const lista = leer();
    if (!Array.isArray(ids) || ids.length !== lista.length || new Set(ids).size !== ids.length
        || !ids.every(id => lista.some(b => b.id === id))) {
        return { error: 'The order must list every badge once.', status: 400 };
    }
    escribir(ids.map(id => lista.find(b => b.id === id)));
    return admin();
}

async function ponerImagen(id, buffer) {
    if (!ID_REGEX.test(String(id)) || !leer().some(b => b.id === id)) return { error: 'Unknown badge.', status: 404 };
    let webp;
    try {
        webp = await require('sharp')(buffer, { animated: true })
            .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 90 })
            .toBuffer();
    } catch {
        return { error: "That file isn't an image we can read.", status: 400 };
    }
    const lista = leer();
    const b = lista.find(x => x.id === id);
    const file = `${id}-${Date.now()}.webp`;
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    writeAtomic(path.join(IMAGES_DIR, file), webp);
    borrarImagen(b.image);
    b.image = file;
    escribir(lista);
    return admin();
}

function quitarImagen(id) {
    const lista = leer();
    const b = lista.find(x => x.id === id);
    if (!b) return { error: 'Unknown badge.', status: 404 };
    borrarImagen(b.image);
    b.image = null;
    escribir(lista);
    return admin();
}

function imagePath(file) {
    return IMAGE_FILE_REGEX.test(String(file)) ? path.join(IMAGES_DIR, file) : null;
}

// Todas las metricas de una wallet. null en las del indice de transferencias
// mientras no esta al dia.
async function metricas(wallet) {
    const key = wallet.toLowerCase();
    const index = require('./collectionIndex');
    const staking = require('./stakingStore');
    const { getRarity } = require('./traitRarity');
    const { getNickname } = require('./nicknameStore');
    const tokenIds = await index.idsDe(key);
    const holding = require('./transferIndex').holderSince(key);
    const s = staking.datosParaInsignias(key);
    const forgeRolls = require('./forgeStore').readHistory()
        .filter(h => h.event === 'roll' && String(h.wallet).toLowerCase() === key && h.payment?.mode !== 'test').length;
    return {
        primals: tokenIds.length,
        oneOfOnes: tokenIds.filter(id => getRarity().isOneOfOne(id)).length,
        minted: holding?.minted ?? null,
        mintedHeld: holding?.mintedHeld ?? null,
        sent: holding?.sent ?? null,
        daysHolding: holding ? (holding.since ? Math.floor((Date.now() - Date.parse(holding.since)) / DAY_MS) : 0) : null,
        firstYear: holding ? (holding.first ? new Date(holding.first).getUTCFullYear() : null) : null,
        customizations: require('./feedStore').list().filter(e => String(e.wallet).toLowerCase() === key).length,
        forgeRolls,
        traitDrops: require('./traitShopStore').unlockedBy(key).length,
        stakingBest: s.bestStreak,
        stakingNow: s.stakingNow,
        fogEarned: s.fogEarned,
        stakedPeriod: s.periodos,
        redeemed: s.canjes,
        nickname: getNickname(key) ? 1 : 0,
        xProfile: require('./profileStore').getProfile(key)?.x ? 1 : 0
    };
}

function valorDe(b, m) {
    if (b.metric === 'stakedPeriod') return m.stakedPeriod[b.param] ?? 0;
    if (b.metric === 'redeemed') {
        return b.param ? m.redeemed[b.param] ?? 0 : Object.values(m.redeemed).reduce((n, x) => n + x, 0);
    }
    return m[b.metric];
}

function cumple(v, op, objetivo) {
    if (v === null || v === undefined) return false;
    if (op === '>=') return v >= objetivo;
    if (op === '<=') return v <= objetivo;
    return v === objetivo;
}

// El tablero de una wallet: las insignias activas, ganadas o no, en el orden
// del admin. Las ocultas solo aparecen si las gano.
async function tablero(wallet) {
    const key = wallet.toLowerCase();
    const m = await metricas(key);
    const badges = [];
    for (const b of leer()) {
        if (!b.enabled) continue;
        let earned;
        let progress = null;
        if (b.kind === 'manual') {
            earned = b.wallets.includes(key);
        } else {
            const v = valorDe(b, m);
            earned = cumple(v, b.op, b.value) && (!b.holdersOnly || m.primals > 0);
            if (b.op === '>=' && typeof v === 'number' && b.value > 1) progress = { value: Math.min(v, b.value), target: b.value };
        }
        if (b.hidden && !earned) continue;
        badges.push({ id: b.id, name: b.name, description: b.description, image: b.image, earned, progress });
    }
    return { badges, metrics: { ...m, stakedPeriod: undefined, redeemed: undefined } };
}

module.exports = { METRICAS, admin, crear, actualizar, borrar, ordenar, ponerImagen, quitarImagen, imagePath, metricas, tablero };
