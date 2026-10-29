const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ASSETS_ROOT, writeAtomic } = require('./assetStore');
const { readJson, writeJson, intEntre } = require('./jsonFiles');
const staking = require('./stakingStore');

const DIR = path.join(ASSETS_ROOT, 'raffles');
const RAFFLES_PATH = path.join(DIR, 'raffles.json');
const IMAGES_DIR = path.join(DIR, 'images');
const IMAGE_FILE_REGEX = /^[a-z0-9]{8}-\d{13}\.webp$/;
const IMAGE_SIZE = 800;
const ID_REGEX = /^[a-z0-9]{8}$/;
const A_MANO = ['nft', 'ape', 'other'];
const promo = () => require('./promoStore');
const premiosDisponibles = () => promo().rewardTypes();
const esAutomatico = kind =>
    !A_MANO.includes(kind) && !['ape', 'nft'].includes(staking.getConfig().catalog.find(i => i.id === kind)?.kind);

async function walletsConPrimal() {
    const supply = require('./collectionSupply');
    const { ownersOf } = require('./transferIndex');
    const total = (await supply.totalSupply()) + supply.MARGEN_IDS;
    const owners = await ownersOf(Array.from({ length: total }, (_, i) => String(i + 1)));
    return new Set([...owners.values()].filter(Boolean));
}
const MAX_PRIZES = 20;
const MAX_WINNERS = 100;
const MAX_TICKETS_POR_COMPRA = 1000;
const DEFAULT_TICKET_PRICE = 5000;
const DEFAULT_MAX_ENTRIES = 2712;

const readAll = () => readJson(RAFFLES_PATH, { raffles: [] }).raffles;
const writeAll = raffles => writeJson(RAFFLES_PATH, { raffles });
const nuevoId = () => crypto.randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '0').slice(0, 8);

const entradasDe = e => (e.base ? 1 : 0) + e.tickets;
const totalEntradas = r => Object.values(r.entries).reduce((n, e) => n + entradasDe(e), 0);
const lugares = r => r.prizes.reduce((n, p) => n + p.winners, 0);
const vencio = (r, now = Date.now()) => Boolean(r.endsAt) && Date.parse(r.endsAt) <= now;
const aceptaEntradas = (r, now = Date.now()) => r.status === 'open' && !vencio(r, now);

function estadoPublico(r, now = Date.now()) {
    if (r.status === 'open' && vencio(r, now)) return 'drawing';
    return r.status;
}

function premioPublico(p) {
    return { id: p.id, label: p.label, kind: p.kind, amount: p.amount, winners: p.winners };
}

function ganadorPublico(r, w) {
    const p = r.prizes.find(x => x.id === w.prizeId);
    return { slot: w.slot, prizeId: w.prizeId, prize: p?.label ?? w.prizeLabel, kind: p?.kind ?? null,
        amount: p?.amount ?? null, wallet: w.wallet, entries: w.entries, status: w.status };
}

function publicRaffle(r, now = Date.now()) {
    return {
        id: r.id,
        title: r.title,
        description: r.description,
        image: r.image,
        prizes: r.prizes.map(premioPublico),
        holdersFree: r.holdersFree,
        publicPrice: r.publicPrice,
        ticketPrice: r.ticketPrice,
        maxEntries: r.maxEntries,
        endsAt: r.endsAt,
        status: estadoPublico(r, now),
        totalEntries: totalEntradas(r),
        participants: Object.keys(r.entries).length,
        openedAt: r.openedAt,
        drawnAt: r.drawnAt,
        winners: r.winners.map(w => ganadorPublico(r, w))
    };
}

function publicList(now = Date.now()) {
    const raffles = readAll();
    return {
        active: raffles.filter(r => r.status === 'open').map(r => publicRaffle(r, now)),
        past: raffles
            .filter(r => r.status === 'drawn')
            .sort((a, b) => b.drawnAt.localeCompare(a.drawnAt))
            .slice(0, 50)
            .map(r => publicRaffle(r, now))
    };
}

function findPublic(id) {
    const r = readAll().find(x => x.id === id && x.status !== 'draft');
    if (!r) return null;
    return {
        ...publicRaffle(r),
        entrants: Object.entries(r.entries)
            .map(([wallet, e]) => ({ wallet, entries: entradasDe(e) }))
            .filter(p => p.entries > 0)
            .sort((a, b) => b.entries - a.entries)
    };
}

function entriesOf(wallet) {
    const key = wallet.toLowerCase();
    const mias = {};
    for (const r of readAll()) {
        const e = r.entries[key];
        if (e) mias[r.id] = { base: e.base, tickets: e.tickets, entries: entradasDe(e) };
    }
    return mias;
}

function winsOf(wallet, now = Date.now()) {
    const key = wallet.toLowerCase();
    const desde = now - 30 * 24 * 60 * 60 * 1000;
    return readAll()
        .filter(r => r.status === 'drawn' && Date.parse(r.drawnAt) >= desde)
        .flatMap(r => r.winners
            .filter(w => w.wallet === key)
            .map(w => {
                const p = r.prizes.find(x => x.id === w.prizeId);
                return { raffleId: r.id, title: r.title, image: r.image, slot: w.slot, prize: p?.label ?? w.prizeLabel,
                    kind: p?.kind ?? null, amount: p?.amount ?? null, auto: esAutomatico(p?.kind), drawnAt: r.drawnAt };
            }))
        .sort((a, b) => b.drawnAt.localeCompare(a.drawnAt));
}

function cupo(r) {
    return r.maxEntries === null ? Infinity : r.maxEntries - totalEntradas(r);
}

/**
 * La entrada base: gratis si es holder y el raffle lo permite, si no la paga
 * con FOG. `isHolder` lo resuelve la ruta contra la cadena.
 */
function enter(wallet, id, { isHolder }) {
    const key = wallet.toLowerCase();
    const raffles = readAll();
    const r = raffles.find(x => x.id === id);
    if (!r || r.status === 'draft') return { error: 'That raffle does not exist.', reason: 'invalid', status: 404 };
    if (!aceptaEntradas(r)) return { error: 'This raffle is closed.', reason: 'closed', status: 409 };
    if (r.entries[key]?.base) return { error: "You're already in this raffle.", reason: 'already-in', status: 409 };
    if (cupo(r) < 1) return { error: 'This raffle is full.', reason: 'full', status: 409 };

    const gratis = r.holdersFree && isHolder;
    if (!gratis && r.publicPrice === null) {
        return { error: 'This raffle is only for Primal holders.', reason: 'holders-only', status: 403 };
    }

    let balance = staking.balanceDe(key);
    if (!gratis && r.publicPrice > 0) {
        const cobro = staking.spendFog(key, r.publicPrice, `raffle:${r.id}:entry`);
        if (cobro.error) return cobro;
        balance = cobro.balance;
    }
    const previa = r.entries[key];
    r.entries[key] = {
        base: gratis ? 'holder' : 'paid',
        paidFog: gratis ? 0 : r.publicPrice,
        tickets: previa?.tickets ?? 0,
        ticketFog: previa?.ticketFog ?? 0,
        at: new Date().toISOString()
    };
    writeAll(raffles);
    return { raffle: publicRaffle(r), mine: { base: r.entries[key].base, tickets: r.entries[key].tickets, entries: entradasDe(r.entries[key]) }, balance };
}

function buyTickets(wallet, id, quantity) {
    const key = wallet.toLowerCase();
    const q = intEntre(quantity, 1, MAX_TICKETS_POR_COMPRA);
    if (q === null) return { error: `Pick between 1 and ${MAX_TICKETS_POR_COMPRA} tickets.`, reason: 'invalid-quantity', status: 400 };
    const raffles = readAll();
    const r = raffles.find(x => x.id === id);
    if (!r || r.status === 'draft') return { error: 'That raffle does not exist.', reason: 'invalid', status: 404 };
    if (!aceptaEntradas(r)) return { error: 'This raffle is closed.', reason: 'closed', status: 409 };
    const e = r.entries[key];
    if (!e?.base) return { error: 'Enter the raffle first.', reason: 'not-in', status: 409 };
    const libres = cupo(r);
    if (libres < q) {
        return { error: libres > 0 ? `Only ${libres} entries left.` : 'This raffle is full.', reason: 'full', status: 409 };
    }

    const precio = r.ticketPrice * q;
    const cobro = staking.spendFog(key, precio, `raffle:${r.id}:tickets:${q}`);
    if (cobro.error) return cobro;
    e.tickets += q;
    e.ticketFog += precio;
    writeAll(raffles);
    return { raffle: publicRaffle(r), mine: { base: e.base, tickets: e.tickets, entries: entradasDe(e) }, balance: cobro.balance };
}

function sortear(candidatos, cuantos) {
    const bolsa = candidatos.filter(c => c.entries > 0);
    const elegidos = [];
    while (elegidos.length < cuantos && bolsa.length) {
        const total = bolsa.reduce((n, c) => n + c.entries, 0);
        let x = crypto.randomInt(total);
        const i = bolsa.findIndex(c => (x -= c.entries) < 0);
        elegidos.push(bolsa.splice(i, 1)[0]);
    }
    return elegidos;
}

const sorteando = new Set();

/**
 * Cierra y sortea. Antes revalida las entradas gratis: si la wallet ya no
 * tiene Primals, pierde esa entrada y le quedan solo los tickets. Si la cadena
 * no contesta, tira y el raffle sigue abierto para el proximo intento.
 */
async function draw(id, { leerHolders = walletsConPrimal } = {}) {
    if (sorteando.has(id)) return { error: 'This raffle is already being drawn.', status: 409 };
    sorteando.add(id);
    try {
        const inicial = readAll().find(x => x.id === id);
        if (!inicial) return { error: 'Unknown raffle.', status: 404 };
        if (inicial.status !== 'open') return { error: 'Only open raffles can be drawn.', status: 409 };

        const holders = Object.entries(inicial.entries).filter(([, e]) => e.base === 'holder').map(([w]) => w);
        const conPrimal = holders.length ? await leerHolders() : new Set();

        const raffles = readAll();
        const r = raffles.find(x => x.id === id);
        if (!r || r.status !== 'open') return { error: 'Only open raffles can be drawn.', status: 409 };
        r.disqualified = [];
        for (const [w, e] of Object.entries(r.entries)) {
            if (e.base === 'holder' && !conPrimal.has(w)) {
                e.base = null;
                r.disqualified.push(w);
            }
        }

        const candidatos = Object.entries(r.entries).map(([wallet, e]) => ({ wallet, entries: entradasDe(e) }));
        const elegidos = sortear(candidatos, lugares(r));
        const slots = r.prizes.flatMap(p => Array.from({ length: p.winners }, () => p));
        const now = new Date().toISOString();
        r.winners = elegidos.map((c, slot) => ({
            slot,
            prizeId: slots[slot].id,
            prizeLabel: slots[slot].label,
            wallet: c.wallet,
            entries: c.entries,
            status: 'pending',
            at: now
        }));
        r.rerolled = [];
        r.status = 'drawn';
        r.drawnAt = now;
        r.closedAt = r.closedAt ?? now;
        writeAll(raffles);
        return { raffle: adminRaffle(r) };
    } finally {
        sorteando.delete(id);
    }
}

function reroll(id, slots) {
    const raffles = readAll();
    const r = raffles.find(x => x.id === id);
    if (!r || r.status !== 'drawn') return { error: 'Only drawn raffles can be rerolled.', status: 409 };
    const pedidos = [...new Set((Array.isArray(slots) ? slots : []).map(Number))];
    const elegidos = pedidos.map(s => r.winners.find(w => w.slot === s));
    if (!pedidos.length || elegidos.some(w => !w)) return { error: 'Pick the winners to reroll.', status: 400 };
    if (elegidos.some(w => w.status === 'sent')) return { error: "A prize that was already sent can't be rerolled.", status: 409 };

    const now = new Date().toISOString();
    for (const w of elegidos) r.rerolled.push({ slot: w.slot, wallet: w.wallet, prizeId: w.prizeId, at: now });
    const fuera = new Set([...r.winners.map(w => w.wallet), ...r.rerolled.map(x => x.wallet)]);
    const candidatos = Object.entries(r.entries)
        .filter(([wallet]) => !fuera.has(wallet))
        .map(([wallet, e]) => ({ wallet, entries: entradasDe(e) }));
    const nuevos = sortear(candidatos, elegidos.length);

    const quedan = r.winners.filter(w => !pedidos.includes(w.slot));
    elegidos.forEach((w, i) => {
        const c = nuevos[i];
        if (c) quedan.push({ ...w, wallet: c.wallet, entries: c.entries, status: 'pending', note: undefined, at: now });
    });
    r.winners = quedan.sort((a, b) => a.slot - b.slot);
    writeAll(raffles);
    return { raffle: adminRaffle(r), replaced: nuevos.length, missing: elegidos.length - nuevos.length };
}

function cancel(id) {
    const raffles = readAll();
    const r = raffles.find(x => x.id === id);
    if (!r) return { error: 'Unknown raffle.', status: 404 };
    if (!['draft', 'open'].includes(r.status)) return { error: 'Only raffles that were not drawn can be cancelled.', status: 409 };
    if (sorteando.has(id)) return { error: 'This raffle is being drawn right now.', status: 409 };
    let devuelto = 0;
    for (const [wallet, e] of Object.entries(r.entries)) {
        const fog = (e.paidFog ?? 0) + (e.ticketFog ?? 0);
        if (fog > 0) {
            staking.refundFog(wallet, fog, `raffle:${r.id}:cancel`);
            devuelto += fog;
        }
    }
    r.status = 'cancelled';
    r.cancelledAt = new Date().toISOString();
    r.refunded = devuelto;
    writeAll(raffles);
    return { raffle: adminRaffle(r) };
}

function setWinnerStatus(id, slot, { status, note } = {}) {
    if (!['pending', 'sent'].includes(status)) return { error: 'Invalid status.', status: 400 };
    const raffles = readAll();
    const r = raffles.find(x => x.id === id);
    const w = r?.winners.find(x => x.slot === Number(slot));
    if (!w) return { error: 'Unknown winner.', status: 404 };
    const premio = r.prizes.find(p => p.id === w.prizeId);
    if (premio && esAutomatico(premio.kind)) {
        if (w.status === 'sent') return { error: 'This prize was already given and stays given.', status: 409 };
        if (status === 'sent') {
            const dado = promo().grantReward(premio.kind, w.wallet, premio.amount ?? 1, `raffle:${r.id}:prize:${w.slot}`);
            if (dado?.error) return { error: dado.error, status: 409 };
        }
    }
    w.status = status;
    w.note = String(note || '').trim().slice(0, 200) || undefined;
    w.sentAt = status === 'sent' ? new Date().toISOString() : undefined;
    writeAll(raffles);
    return { raffle: adminRaffle(r) };
}

function validar(body, anterior) {
    const title = String(body.title ?? anterior?.title ?? '').trim().slice(0, 80);
    if (!title) return { error: 'Give the raffle a title.' };
    const description = String(body.description ?? anterior?.description ?? '').trim().slice(0, 500);

    const crudos = body.prizes ?? anterior?.prizes ?? [];
    if (!Array.isArray(crudos) || !crudos.length || crudos.length > MAX_PRIZES) {
        return { error: `Add between 1 and ${MAX_PRIZES} prizes.` };
    }
    const prizes = [];
    for (const p of crudos) {
        const label = String(p?.label || '').trim().slice(0, 60);
        if (!label) return { error: 'Every prize needs a name.' };
        const reward = premiosDisponibles().find(r => r.id === p?.kind);
        if (!A_MANO.includes(p?.kind) && !reward) return { error: `${label}: pick what kind of prize it is.` };
        const winners = intEntre(p.winners ?? 1, 1, MAX_WINNERS);
        if (winners === null) return { error: `${label}: winners must be between 1 and ${MAX_WINNERS}.` };
        let amount = null;
        if (p.kind === 'ape' || (reward && reward.max > 1)) {
            amount = intEntre(p.amount, 1, reward ? reward.max : 1000000000);
            if (amount === null) return { error: `${label}: how much does it give?${reward ? ` (1 to ${reward.max.toLocaleString('en-US')})` : ''}` };
        } else if (reward) {
            amount = 1;
        }
        const pid = /^[a-z0-9-]{1,40}$/.test(String(p.id || '')) ? p.id : crypto.randomUUID().slice(0, 8);
        if (prizes.some(x => x.id === pid)) return { error: 'Two prizes have the same id.' };
        prizes.push({ id: pid, label, kind: p.kind, amount, winners });
    }

    const holdersFree = Boolean(body.holdersFree ?? anterior?.holdersFree ?? true);
    const precioCrudo = body.publicPrice !== undefined ? body.publicPrice : anterior?.publicPrice ?? null;
    const publicPrice = precioCrudo === null || precioCrudo === '' ? null : intEntre(precioCrudo, 0, 100000000);
    if (publicPrice === null && !(precioCrudo === null || precioCrudo === '')) {
        return { error: 'The entry price must be a whole number of FOG, or empty for holders only.' };
    }
    if (!holdersFree && publicPrice === null) {
        return { error: 'With free entry for holders off, set an entry price or nobody can join.' };
    }
    const ticketPrice = intEntre(body.ticketPrice ?? anterior?.ticketPrice ?? DEFAULT_TICKET_PRICE, 1, 100000000);
    if (ticketPrice === null) return { error: 'The ticket price must be a whole number of FOG, 1 or more.' };

    const maxCrudo = body.maxEntries !== undefined ? body.maxEntries : anterior?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const maxEntries = maxCrudo === null || maxCrudo === '' ? null : intEntre(maxCrudo, 1, 10000000);
    if (maxEntries === null && !(maxCrudo === null || maxCrudo === '')) {
        return { error: 'The entry limit must be a whole number, or empty for no limit.' };
    }

    const finCrudo = body.endsAt !== undefined ? body.endsAt : anterior?.endsAt ?? null;
    let endsAt = null;
    if (finCrudo) {
        const t = Date.parse(finCrudo);
        if (!Number.isFinite(t)) return { error: "That end date isn't valid." };
        endsAt = new Date(t).toISOString();
    }

    return { datos: { title, description, prizes, holdersFree, publicPrice, ticketPrice, maxEntries, endsAt } };
}

function create(body = {}) {
    const v = validar(body);
    if (v.error) return { ...v, status: 400 };
    const raffles = readAll();
    const r = {
        id: nuevoId(),
        ...v.datos,
        image: null,
        status: 'draft',
        entries: {},
        winners: [],
        rerolled: [],
        createdAt: new Date().toISOString(),
        openedAt: null,
        closedAt: null,
        drawnAt: null
    };
    raffles.push(r);
    writeAll(raffles);
    return { raffle: adminRaffle(r) };
}

function update(id, body = {}) {
    const raffles = readAll();
    const r = raffles.find(x => x.id === id);
    if (!r) return { error: 'Unknown raffle.', status: 404 };
    if (!['draft', 'open'].includes(r.status)) return { error: "A raffle that was drawn or cancelled can't be edited.", status: 409 };
    const v = validar(body, r);
    if (v.error) return { ...v, status: 400 };
    const conEntradas = Object.keys(r.entries).length > 0;
    if (conEntradas && (v.datos.publicPrice !== r.publicPrice || v.datos.ticketPrice !== r.ticketPrice || v.datos.holdersFree !== r.holdersFree)) {
        return { error: "People already joined: the prices and who can enter for free can't change anymore.", status: 409 };
    }
    if (v.datos.maxEntries !== null && v.datos.maxEntries < totalEntradas(r)) {
        return { error: `There are already ${totalEntradas(r)} entries: the limit can't be lower.`, status: 409 };
    }
    Object.assign(r, v.datos);
    writeAll(raffles);
    return { raffle: adminRaffle(r) };
}

function open(id) {
    const raffles = readAll();
    const r = raffles.find(x => x.id === id);
    if (!r) return { error: 'Unknown raffle.', status: 404 };
    if (r.status !== 'draft') return { error: 'Only drafts can be opened.', status: 409 };
    if (r.endsAt && vencio(r)) return { error: 'The end date already passed. Change it first.', status: 409 };
    r.status = 'open';
    r.openedAt = new Date().toISOString();
    writeAll(raffles);
    return { raffle: adminRaffle(r) };
}

function remove(id) {
    const raffles = readAll();
    const r = raffles.find(x => x.id === id);
    if (!r) return { error: 'Unknown raffle.', status: 404 };
    if (r.status !== 'draft') return { error: 'Only drafts can be deleted. Cancel it instead.', status: 409 };
    borrarImagen(r.image);
    writeAll(raffles.filter(x => x.id !== id));
    return { ok: true };
}

function adminRaffle(r) {
    return {
        ...publicRaffle(r),
        status: r.status,
        closing: estadoPublico(r) === 'drawing',
        createdAt: r.createdAt,
        cancelledAt: r.cancelledAt ?? null,
        refunded: r.refunded ?? 0,
        fogCollected: Object.values(r.entries).reduce((n, e) => n + (e.paidFog ?? 0) + (e.ticketFog ?? 0), 0),
        entries: Object.entries(r.entries)
            .map(([wallet, e]) => ({ wallet, base: e.base, tickets: e.tickets, entries: entradasDe(e), at: e.at }))
            .sort((a, b) => b.entries - a.entries),
        winners: r.winners.map(w => ({ ...ganadorPublico(r, w), note: w.note ?? null, sentAt: w.sentAt ?? null,
            auto: esAutomatico(r.prizes.find(p => p.id === w.prizeId)?.kind) })),
        rerolled: r.rerolled ?? [],
        disqualified: r.disqualified ?? []
    };
}

function adminList() {
    return {
        raffles: readAll().slice().reverse().map(adminRaffle),
        defaults: { ticketPrice: DEFAULT_TICKET_PRICE, maxEntries: DEFAULT_MAX_ENTRIES },
        rewards: premiosDisponibles()
    };
}

function borrarImagen(file) {
    if (!file || !IMAGE_FILE_REGEX.test(file)) return;
    fs.rm(path.join(IMAGES_DIR, file), { force: true }, () => {});
}

function imagePath(file) {
    return IMAGE_FILE_REGEX.test(String(file)) ? path.join(IMAGES_DIR, file) : null;
}

async function setImage(id, buffer) {
    if (!ID_REGEX.test(String(id)) || !readAll().some(x => x.id === id)) return { error: 'Unknown raffle.', status: 404 };
    let webp;
    try {
        webp = await require('sharp')(buffer, { animated: true })
            .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 88 })
            .toBuffer();
    } catch {
        return { error: "That file isn't an image we can read.", status: 400 };
    }
    const raffles = readAll();
    const r = raffles.find(x => x.id === id);
    if (!r) return { error: 'Unknown raffle.', status: 404 };
    const file = `${id}-${Date.now()}.webp`;
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    writeAtomic(path.join(IMAGES_DIR, file), webp);
    borrarImagen(r.image);
    r.image = file;
    writeAll(raffles);
    return { raffle: adminRaffle(r) };
}

const fallos = new Map();

async function drawDue(now = Date.now()) {
    const vencidos = readAll().filter(r => r.status === 'open' && vencio(r, now) && !(now - (fallos.get(r.id) ?? 0) < 60 * 1000));
    const resultados = [];
    for (const r of vencidos) {
        try {
            resultados.push({ id: r.id, ...(await draw(r.id)) });
            fallos.delete(r.id);
        } catch (error) {
            fallos.set(r.id, now);
            console.warn(`[raffles] No se pudo sortear ${r.id}: ${error.message}`);
        }
    }
    return resultados;
}

function startRaffleJob() {
    const tick = () => drawDue().catch(error => console.error('[raffles]', error));
    setInterval(tick, 5 * 1000).unref();
    setTimeout(tick, 5000).unref();
}

module.exports = {
    publicList,
    findPublic,
    entriesOf,
    winsOf,
    enter,
    buyTickets,
    draw,
    drawDue,
    reroll,
    cancel,
    setWinnerStatus,
    create,
    update,
    open,
    remove,
    adminList,
    setImage,
    imagePath,
    startRaffleJob,
    isValidId: id => ID_REGEX.test(String(id))
};
