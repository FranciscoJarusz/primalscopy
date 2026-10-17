// lib/promoStore.js
//
// Codigos promocionales: el equipo los crea desde el panel de admin (por
// ejemplo, para postear en Discord) y cualquier wallet logueada los canjea.
// No hace falta tener un Primal: un roll gratis puede ser lo que convenza a
// alguien de comprar uno.
//
// Un codigo da un premio de un tipo de REWARDS: rolls del Forge, FOG, o una
// apertura de las ruletas de la tienda de FOG (las keys y el Summon shard, ver
// lib/stakingWheels.js). Para sumar otro se agrega una entrada ahi con su
// `grant`, y el panel lo ofrece solo. `grant` puede devolver { error } (una
// ruleta sin premios): el codigo no se gasta y se puede reintentar.
//
// Todo vive en un JSON del volumen, con los canjes adentro de cada codigo: son
// a lo sumo unos cientos. Las funciones que escriben son sincronicas a
// proposito, como en forgeStore: leer, decidir y escribir sin un await en el
// medio hace que dos canjes a la vez no puedan pasarse del limite de usos.

const crypto = require('crypto');
const path = require('path');
const { ASSETS_ROOT } = require('./assetStore');
const { readJson, writeJson, intEntre } = require('./jsonFiles');
const forge = require('./forgeStore');

const CODES_PATH = path.join(ASSETS_ROOT, 'promo', 'codes.json');
const FORMATO = /^[A-Z0-9_-]{4,32}$/;
// Sin 0/O ni 1/I/L: los codigos se copian a mano desde una imagen o un video.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_USES = 100000;

// `max`: cuanto puede dar un canje. `plural`: si el nombre lleva "s" ("2 Forge
// rolls"; el FOG no: "5,000 FOG"). stakingStore se pide adentro de cada
// `grant` para no cargarlo (ni a sus dependencias) al arrancar este modulo.
const staking = () => require('./stakingStore');
const WHEELS = [
    ['lowkey', 'LOWKEY'],
    ['highkey', 'HIGHKEY'],
    ['fogkey', 'FOGKEY'],
    ['summon-shard', 'Summon shard']
];
const REWARDS = {
    'forge-roll': {
        label: 'Forge roll',
        max: 20,
        plural: true,
        grant: (wallet, amount, code) => forge.addPromoCredits(wallet, code, amount)
    },
    fog: {
        label: 'FOG',
        max: 1000000,
        plural: false,
        grant: (wallet, amount, code) => staking().grantFog(wallet, amount, `promo:${code}`)
    },
    // Una apertura de la ruleta, como si la hubiera comprado: el premio sale
    // en el momento del canje y el modal muestra la animacion.
    ...Object.fromEntries(WHEELS.map(([id, label]) => [id, {
        label,
        max: 1,
        plural: false,
        grant: (wallet, amount, code) => staking().spinWheel(wallet, id, `promo:${code}`)
    }]))
};

function read() {
    return readJson(CODES_PATH, {});
}

function write(codes) {
    writeJson(CODES_PATH, codes);
}

function normalize(code) {
    return String(code || '').trim().toUpperCase();
}

function generateCode() {
    let code = '';
    for (let i = 0; i < 8; i++) code += ALFABETO[crypto.randomInt(ALFABETO.length)];
    return code;
}

function isExpired(entry, now = Date.now()) {
    return entry.expiresAt !== null && Date.parse(entry.expiresAt) <= now;
}

function statusOf(entry) {
    return !entry.active ? 'disabled'
        : isExpired(entry) ? 'expired'
        : entry.redemptions.length >= entry.maxUses ? 'exhausted'
        : 'active';
}

// Lo que ve el panel: el codigo con su estado ya calculado.
function summary(entry) {
    return { archived: false, ...entry, uses: entry.redemptions.length, status: statusOf(entry) };
}

function listCodes() {
    return Object.values(read())
        .map(summary)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Devuelve { code } o { error }.
function createCode({ code, reward, amount, maxUses, expiresAt, note } = {}) {
    const codes = read();

    let value = normalize(code);
    if (!value) {
        do value = generateCode(); while (codes[value]);
    } else if (!FORMATO.test(value)) {
        return { error: 'The code must be 4-32 characters: letters, numbers, - or _.' };
    } else if (codes[value]) {
        return { error: 'That code already exists.' };
    }

    if (!REWARDS[reward]) return { error: 'Unknown reward.' };
    const { max } = REWARDS[reward];
    const cantidad = intEntre(amount ?? 1, 1, max);
    if (cantidad === null) return { error: max === 1 ? 'This reward gives 1 per redemption.' : `The amount must be between 1 and ${max.toLocaleString('en-US')}.` };
    const usos = intEntre(maxUses, 1, MAX_USES);
    if (usos === null) return { error: `The use limit must be between 1 and ${MAX_USES}.` };

    let vence = null;
    if (expiresAt) {
        const ms = Date.parse(expiresAt);
        if (Number.isNaN(ms)) return { error: 'Invalid expiration date.' };
        if (ms <= Date.now()) return { error: 'The expiration date is already in the past.' };
        vence = new Date(ms).toISOString();
    }

    codes[value] = {
        code: value,
        reward,
        amount: cantidad,
        maxUses: usos,
        expiresAt: vence,
        note: String(note || '').trim().slice(0, 200),
        active: true,
        createdAt: new Date().toISOString(),
        redemptions: []
    };
    write(codes);
    return { code: summary(codes[value]) };
}

// Desactivar no borra: el codigo y sus canjes quedan en el registro.
// Devuelve { code } o { error, status }.
function setActive(code, active) {
    const codes = read();
    const entry = codes[normalize(code)];
    if (!entry) return { error: 'That code does not exist.', status: 404 };
    if (active && entry.archived) return { error: 'Unarchive the code before enabling it.', status: 409 };
    entry.active = Boolean(active);
    write(codes);
    return { code: summary(entry) };
}

// Archivar es lo que hay en vez de borrar: el codigo sale de la lista
// principal del panel, pero quedan sus canjes y su nombre sigue ocupado. Si se
// pudiera volver a crear, quien ya lo canjeo veria "Code redeemed" sin recibir
// nada, porque su credito del Forge ya existe. Solo se archiva uno que ya no
// sirve: un codigo activo primero se desactiva.
function setArchived(code, archived) {
    const codes = read();
    const entry = codes[normalize(code)];
    if (!entry) return { error: 'That code does not exist.', status: 404 };
    if (archived && statusOf(entry) === 'active') {
        return { error: 'Disable the code before archiving it.', status: 409 };
    }
    entry.archived = Boolean(archived);
    write(codes);
    return { code: summary(entry) };
}

// Devuelve { reward, amount, label } o { error, reason }. `reason` es para el
// front y para el limite de intentos.
function redeem(wallet, rawCode) {
    const value = normalize(rawCode);
    const codes = read();
    const entry = FORMATO.test(value) ? codes[value] : null;
    const key = wallet.toLowerCase();

    if (!entry || !entry.active) return { error: "That code doesn't exist or is no longer active.", reason: 'invalid' };
    if (isExpired(entry)) return { error: 'That code has expired.', reason: 'expired' };
    if (entry.redemptions.some(r => r.wallet === key)) {
        return { error: 'You already redeemed this code.', reason: 'already-redeemed' };
    }
    if (entry.redemptions.length >= entry.maxUses) {
        return { error: 'That code has reached its limit.', reason: 'exhausted' };
    }

    // Primero el premio: si falla, el canje no queda anotado y se puede
    // reintentar. Al reves no hay riesgo: los creditos del Forge tienen una
    // clave por codigo y wallet, asi que dar el premio dos veces no suma nada.
    const reward = REWARDS[entry.reward];
    const granted = reward.grant(key, entry.amount, entry.code);
    if (granted?.error) return { error: `${granted.error} Try the code again later.`, reason: 'unavailable' };
    entry.redemptions.push({ wallet: key, at: new Date().toISOString() });
    write(codes);

    return {
        code: entry.code,
        reward: entry.reward,
        label: reward.label,
        amount: entry.amount,
        plural: reward.plural,
        // Una ruleta: lo que toco y la key, para la animacion.
        ...(granted?.win ? { win: granted.win, item: granted.item } : {})
    };
}

function rewardTypes() {
    return Object.entries(REWARDS).map(([id, { label, max, plural }]) => ({ id, label, max, plural }));
}

module.exports = { listCodes, createCode, setActive, setArchived, redeem, rewardTypes, CODES_PATH };
