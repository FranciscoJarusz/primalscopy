// Los drops de traits: un trait exclusivo que se vende con FOG por un tiempo.
// Con precio 0 es un regalo para holders: no cobra, pero la ruta exige que la
// wallet tenga algun Primal. Antes de empezar se ve como "Soon",
// mientras dura se compra, y cuando termina o se agota desaparece para quien
// no lo compro. Lo comprado queda para toda la wallet: lo usan los Primals de
// esa wallet que ya lo ven en el customizer (los de su carpeta, o todos si
// vive en _GLOBAL).
//
// Drops y compras van por la URL del trait (/assets/traits/HAT/_GLOBAL/X.gif).
// Si se renombra desde el admin, `move` los pasa a la URL nueva: si no, quien
// lo compro lo perderia.

const crypto = require('crypto');
const path = require('path');
const { ASSETS_ROOT } = require('./assetStore');
const { readJson, writeJson, intEntre } = require('./jsonFiles');
const staking = require('./stakingStore');

const DIR = path.join(ASSETS_ROOT, 'trait-shop');
const DROPS_PATH = path.join(DIR, 'drops.json');
const UNLOCKS_PATH = path.join(DIR, 'unlocks.json');
const MAX_PRICE = 100_000_000;
const MAX_SUPPLY = 100_000;
const TRAIT_URL = /^\/assets\/traits\/[^/]+\/[^/]+\/[^/]+$/;

const readDrops = () => readJson(DROPS_PATH, []);
const readUnlocks = () => readJson(UNLOCKS_PATH, []);
const error = (status, message) => ({ error: message, status });

function soldOf(trait, unlocks = readUnlocks()) {
    return unlocks.filter(u => u.trait === trait).length;
}

function statusOf(drop, sold, now = Date.now()) {
    if (Date.parse(drop.startsAt) > now) return 'scheduled';
    if (drop.endsAt && Date.parse(drop.endsAt) <= now) return 'ended';
    if (drop.supply !== null && sold >= drop.supply) return 'sold-out';
    return 'live';
}

// Lo que ve el customizer de cada trait con drop, por URL.
function publicDrops(now = Date.now()) {
    const unlocks = readUnlocks();
    return Object.fromEntries(readDrops().map(drop => {
        const sold = soldOf(drop.trait, unlocks);
        return [drop.trait, {
            price: drop.price,
            status: statusOf(drop, sold, now),
            startsAt: drop.startsAt,
            endsAt: drop.endsAt,
            left: drop.supply === null ? null : Math.max(0, drop.supply - sold)
        }];
    }));
}

const isExclusive = url => readDrops().some(d => d.trait === url);
const isFree = url => readDrops().some(d => d.trait === url && d.price === 0);

function unlockedBy(wallet) {
    const key = String(wallet).toLowerCase();
    return [...new Set(readUnlocks().filter(u => u.wallet === key).map(u => u.trait))];
}

const hasUnlocked = (wallet, url) => unlockedBy(wallet).includes(url);

function parseDrop(body, current = null) {
    const price = intEntre(body.price, 0, MAX_PRICE);
    if (price === null) return error(400, 'The price has to be a whole number of FOG, from 0 (free for holders).');

    const startsAt = body.startsAt ? new Date(body.startsAt) : current ? new Date(current.startsAt) : new Date();
    if (Number.isNaN(startsAt.getTime())) return error(400, 'Invalid start date.');
    let endsAt = null;
    if (body.endsAt) {
        endsAt = new Date(body.endsAt);
        if (Number.isNaN(endsAt.getTime())) return error(400, 'Invalid end date.');
        if (endsAt <= startsAt) return error(400, 'The drop has to end after it starts.');
    }

    let supply = null;
    if (body.supply !== null && body.supply !== undefined && body.supply !== '') {
        supply = intEntre(body.supply, 1, MAX_SUPPLY);
        if (supply === null) return error(400, 'Copies has to be a whole number, from 1.');
        if (current && supply < soldOf(current.trait)) {
            return error(400, `${soldOf(current.trait)} copies were already sold.`);
        }
    }
    return { price, startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null, supply };
}

function create(body) {
    const trait = String(body?.trait || '');
    if (!TRAIT_URL.test(trait)) return error(400, 'Invalid trait.');
    const drops = readDrops();
    if (drops.some(d => d.trait === trait)) return error(409, 'That trait already has a drop. Edit it instead.');
    const parsed = parseDrop(body || {});
    if (parsed.error) return parsed;
    const drop = { id: crypto.randomUUID(), trait, ...parsed, createdAt: new Date().toISOString() };
    writeJson(DROPS_PATH, [...drops, drop]);
    return { drop };
}

function update(id, body) {
    const drops = readDrops();
    const current = drops.find(d => d.id === id);
    if (!current) return error(404, 'Unknown drop.');
    const parsed = parseDrop(body || {}, current);
    if (parsed.error) return parsed;
    const drop = { ...current, ...parsed };
    writeJson(DROPS_PATH, drops.map(d => (d.id === id ? drop : d)));
    return { drop };
}

function end(id) {
    const drops = readDrops();
    const current = drops.find(d => d.id === id);
    if (!current) return error(404, 'Unknown drop.');
    const now = new Date().toISOString();
    const drop = { ...current, endsAt: now, startsAt: current.startsAt > now ? now : current.startsAt };
    writeJson(DROPS_PATH, drops.map(d => (d.id === id ? drop : d)));
    return { drop };
}

// Borrar un drop deja el trait como uno comun, gratis para todos. Si alguien
// ya lo compro no se puede: se termina el drop y listo.
function remove(id) {
    const drops = readDrops();
    const current = drops.find(d => d.id === id);
    if (!current) return error(404, 'Unknown drop.');
    if (soldOf(current.trait) > 0) return error(409, 'People already bought it: end the drop instead.');
    writeJson(DROPS_PATH, drops.filter(d => d.id !== id));
    return { ok: true };
}

// Todo sincrono a proposito: entre cobrar y anotar la compra no hay ningun
// await, asi que dos pedidos juntos no pueden cobrar dos veces ni pasarse de
// las copias.
function unlock(wallet, url) {
    const key = String(wallet).toLowerCase();
    const drop = readDrops().find(d => d.trait === url);
    if (!drop) return error(404, "This trait isn't for sale.");
    if (hasUnlocked(key, url)) return error(409, 'You already unlocked this trait.');
    const status = statusOf(drop, soldOf(url));
    if (status === 'scheduled') return error(409, "This drop hasn't started yet.");
    if (status === 'ended') return error(409, 'This drop already ended.');
    if (status === 'sold-out') return error(409, 'This drop sold out.');
    const charge = drop.price > 0
        ? staking.spendFog(key, drop.price, `trait:${url}`)
        : { balance: staking.balanceDe(key) };
    if (charge.error) return charge;
    const unlocks = readUnlocks();
    unlocks.push({ id: crypto.randomUUID(), wallet: key, trait: url, price: drop.price, at: new Date().toISOString() });
    writeJson(UNLOCKS_PATH, unlocks);
    return { balance: charge.balance, unlocked: unlockedBy(key) };
}

function move(from, to) {
    if (from === to) return;
    const drops = readDrops();
    if (drops.some(d => d.trait === from)) {
        writeJson(DROPS_PATH, drops.map(d => (d.trait === from ? { ...d, trait: to } : d)));
    }
    const unlocks = readUnlocks();
    if (unlocks.some(u => u.trait === from)) {
        writeJson(UNLOCKS_PATH, unlocks.map(u => (u.trait === from ? { ...u, trait: to } : u)));
    }
}

function adminList() {
    const unlocks = readUnlocks();
    const now = Date.now();
    return {
        drops: readDrops().map(drop => {
            const bought = unlocks.filter(u => u.trait === drop.trait);
            return {
                ...drop,
                status: statusOf(drop, bought.length, now),
                sold: bought.length,
                fog: bought.reduce((n, u) => n + u.price, 0)
            };
        }),
        unlocks: unlocks.slice(-200).reverse()
    };
}

module.exports = {
    publicDrops,
    isExclusive,
    isFree,
    unlockedBy,
    hasUnlocked,
    create,
    update,
    end,
    remove,
    unlock,
    move,
    adminList
};
