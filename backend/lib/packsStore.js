const crypto = require('crypto');
const { parseEther, formatEther } = require('viem');
const path = require('path');
const { ASSETS_ROOT } = require('./assetStore');
const { readJson, writeJson, appendJsonLine, readJsonLines, intEntre } = require('./jsonFiles');
const { CARTAS, RAREZAS } = require('./packCards');
const nicknames = require('./nicknameStore');
const { treasuryConfig } = require('./forgePayments');
const profiles = require('./profileStore');

const PACKS_DIR = path.join(ASSETS_ROOT, 'packs');
const CONFIG_PATH = path.join(PACKS_DIR, 'config.json');
const OPENS_PATH = path.join(PACKS_DIR, 'opens.jsonl');
const PLAYERS_PATH = path.join(PACKS_DIR, 'players.json');
const EXTRAS_PATH = path.join(PACKS_DIR, 'extras.json');
const GIFTS_PATH = path.join(PACKS_DIR, 'gifts.json');

const DAY_MS = 24 * 60 * 60 * 1000;
const CHOSEN_ID = CARTAS.find(c => c.rarity === 'chosen')?.id ?? null;
const CARTAS_POR_PACK = 5;
const TOP_PUBLICO = 100;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const DEFAULTS = {
    status: 'upcoming',
    endsAt: null,
    openedAt: null,
    endedAt: null,
    tiers: { none: 1, holder: 3, staker: 4 },
    extraPrice: 20,
    extraMax: 2,
    winners: null,
    rarities: {
        common: { chance: 5490, points: 5 },
        uncommon: { chance: 2500, points: 10 },
        rare: { chance: 1200, points: 25 },
        epic: { chance: 600, points: 60 },
        legendary: { chance: 200, points: 200 },
        chosen: { chance: 10, points: 500 },
    },
};

const dia = t => new Date(t).toISOString().slice(0, 10);

function getConfig() {
    const guardada = readJson(CONFIG_PATH, {});
    return {
        ...DEFAULTS,
        ...guardada,
        tiers: { ...DEFAULTS.tiers, ...guardada.tiers },
        rarities: { ...DEFAULTS.rarities, ...guardada.rarities },
    };
}

function estado(config, now = Date.now()) {
    if (config.status === 'open' && config.endsAt && Date.parse(config.endsAt) <= now) return 'ended';
    return config.status;
}

function leerJugadores() {
    return readJson(PLAYERS_PATH, {});
}

let indice = null;
let aperturas = null;

let version = 0;
let cacheRanking = null;
let cacheChosen = null;

function sumar(open) {
    version++;
    aperturas.set(open.id, open);
    let j = indice.get(open.wallet);
    if (!j) {
        j = { points: 0, packs: 0, days: {}, pointsByDay: {}, giftDays: {}, giftsUsed: 0, collection: {}, firstAt: open.at, lastAt: open.at };
        indice.set(open.wallet, j);
    }
    j.points += open.points;
    j.packs++;
    j.days[open.day] = (j.days[open.day] || 0) + 1;
    j.pointsByDay[open.day] = (j.pointsByDay[open.day] || 0) + open.points;
    if (open.gift) {
        j.giftsUsed++;
        j.giftDays[open.day] = (j.giftDays[open.day] || 0) + 1;
    }
    for (const id of open.cards) j.collection[id] = (j.collection[id] || 0) + 1;
    if (open.points > 0) j.lastAt = open.at;
}

function jugadores() {
    if (!indice) {
        indice = new Map();
        aperturas = new Map();
        for (const open of readJsonLines(OPENS_PATH, 'packs')) sumar(open);
    }
    return indice;
}

function rachaDe(days, now = Date.now()) {
    let t = days[dia(now)] ? now : days[dia(now - DAY_MS)] ? now - DAY_MS : null;
    let actual = 0;
    while (t !== null && days[dia(t)]) {
        actual++;
        t -= DAY_MS;
    }
    let mejor = 0;
    let seguidos = 0;
    let anterior = null;
    for (const d of Object.keys(days).sort()) {
        seguidos = anterior !== null && Date.parse(d) - Date.parse(anterior) === DAY_MS ? seguidos + 1 : 1;
        mejor = Math.max(mejor, seguidos);
        anterior = d;
    }
    return { current: actual, best: mejor };
}

function registro(wallet) {
    const perfil = profiles.getProfile(wallet);
    return { nickname: nicknames.getNickname(wallet), x: perfil?.x || '', discord: perfil?.discord || '' };
}

const registrado = r => Boolean(r.nickname && (r.x || r.discord));

function ranking(now = Date.now()) {
    const todos = jugadores();
    const clave = `${version}:${dia(now)}`;
    if (cacheRanking?.clave === clave) return cacheRanking.valor;
    const fuera = leerJugadores();
    const valor = [...todos]
        .filter(([wallet, j]) => j.points > 0 && !fuera[wallet]?.disqualified)
        .sort(([, a], [, b]) => b.points - a.points || a.lastAt.localeCompare(b.lastAt))
        .map(([wallet, j], i) => ({ rank: i + 1, wallet, points: j.points, packs: j.packs, streak: rachaDe(j.days, now).current, today: Boolean(j.days[dia(now)]) }));
    cacheRanking = { clave, valor };
    return valor;
}

function cartaPublica(c) {
    return { id: c.id, name: c.name, category: c.category, rarity: c.rarity };
}

function pull(id) {
    jugadores();
    const entrada = aperturas.get(String(id));
    if (!entrada) return null;
    return {
        id: entrada.id,
        at: entrada.at,
        points: entrada.points,
        nickname: nicknames.getNickname(entrada.wallet) ?? null,
        cards: entrada.cards.map(c => cartaPublica(CARTAS.find(x => x.id === c) || { id: c, name: '', category: '', rarity: 'common' })),
    };
}

const NIVELES = ['none', 'holder', 'staker'];

const leerExtras = () => readJson(EXTRAS_PATH, {});

function extrasDe(wallet, hoy) {
    return Object.values(leerExtras()).filter(e => e.wallet === wallet && e.day === hoy).length;
}

const leerRegalos = () => readJson(GIFTS_PATH, {});

function regalosDe(wallet) {
    const recibidos = Object.values(leerRegalos()).filter(g => g.wallet === wallet).length;
    return Math.max(0, recibidos - (jugadores().get(wallet)?.giftsUsed || 0));
}

function grantPacks(wallet, amount, ref) {
    const key = wallet.toLowerCase();
    const regalos = leerRegalos();
    const at = new Date().toISOString();
    let nuevos = 0;
    for (let i = 0; i < amount; i++) {
        const id = `${ref}:${key}:${i}`;
        if (regalos[id]) continue;
        regalos[id] = { wallet: key, ref, at };
        nuevos++;
    }
    if (nuevos) writeJson(GIFTS_PATH, regalos);
    return { granted: nuevos };
}

const normalesDe = (j, hoy) => (j?.days[hoy] || 0) - (j?.giftDays?.[hoy] || 0);

const comprasDeExtras = () => Object.values(leerExtras()).filter(e => e.valueWei);
const isExtraPayment = txHash => Boolean(leerExtras()[String(txHash).toLowerCase()]);

function extraPublico(config) {
    const tesoro = treasuryConfig();
    if (!tesoro || !(config.extraPrice > 0) || !config.extraMax) return null;
    return {
        price: String(config.extraPrice),
        priceWei: parseEther(String(config.extraPrice)).toString(),
        max: config.extraMax,
        treasury: tesoro.treasury,
        chainId: tesoro.chainId,
        confirmations: tesoro.confirmations,
    };
}

function publicConfig(now = Date.now()) {
    const config = getConfig();
    const total = RAREZAS.reduce((s, r) => s + (CARTAS.some(c => c.rarity === r) ? config.rarities[r].chance : 0), 0);
    return {
        status: estado(config, now),
        endsAt: config.endsAt,
        tiers: config.tiers,
        extra: extraPublico(config),
        packSize: CARTAS_POR_PACK,
        rarities: Object.fromEntries(RAREZAS.map(r => [r, {
            chance: total && CARTAS.some(c => c.rarity === r) ? config.rarities[r].chance / total : 0,
            points: config.rarities[r].points,
        }])),
        cards: CARTAS.map(cartaPublica),
    };
}

function leaderboard(now = Date.now()) {
    const todos = ranking(now);
    const apodos = nicknames.getAllNicknames();
    const ganador = getConfig().chosenRaffle?.winner ?? null;
    return {
        players: todos.length,
        limit: TOP_PUBLICO,
        top: todos.slice(0, TOP_PUBLICO).map(f => ({ ...f, nickname: apodos[f.wallet] ?? null })),
        chosen: participantesChosen().map(p => ({ ...p, winner: p.wallet === ganador })),
    };
}

const baseDe = (config, tier) => config.tiers[NIVELES.includes(tier) ? tier : 'none'];

function resumen(wallet, { tier = null } = {}, now = Date.now()) {
    const key = wallet.toLowerCase();
    const config = getConfig();
    const status = estado(config, now);
    const j = jugadores().get(key);
    const jugador = leerJugadores()[key] || {};
    const fila = ranking(now).find(f => f.wallet === key);
    const ganoRanking = status === 'ended' && Number.isInteger(config.winners) && !!fila && fila.rank <= config.winners;
    const ganoSorteo = config.chosenRaffle?.winner === key;
    const winner = ganoRanking || ganoSorteo;
    return {
        ...registro(key),
        registered: registrado(registro(key)),
        tier,
        baseLimit: baseDe(config, tier),
        extrasToday: extrasDe(key, dia(now)),
        limit: baseDe(config, tier) + extrasDe(key, dia(now)),
        openedToday: normalesDe(j, dia(now)),
        bonusPacks: regalosDe(key),
        points: j?.points || 0,
        packs: j?.packs || 0,
        rank: fila?.rank ?? null,
        streak: rachaDe(j?.days || {}, now),
        collection: j?.collection || {},
        disqualified: Boolean(jugador.disqualified),
        winner,
        chosenEntered: Boolean(CHOSEN_ID && j?.collection[CHOSEN_ID]),
        chosenWinner: ganoSorteo,
        solana: winner ? jugador.solana?.address ?? null : null,
    };
}

function sortearCarta(config) {
    const rarezas = RAREZAS.filter(r => config.rarities[r].chance > 0 && CARTAS.some(c => c.rarity === r));
    let n = crypto.randomInt(rarezas.reduce((s, r) => s + config.rarities[r].chance, 0));
    const rareza = rarezas.find(r => (n -= config.rarities[r].chance) < 0);
    const opciones = CARTAS.filter(c => c.rarity === rareza);
    return opciones[crypto.randomInt(opciones.length)];
}

function open(wallet, { tier = null } = {}, now = Date.now()) {
    const key = wallet.toLowerCase();
    const config = getConfig();
    const status = estado(config, now);
    if (status === 'upcoming') return { error: "Packs aren't open yet.", reason: 'upcoming', status: 409 };
    if (status === 'ended') return { error: 'The competition is over.', reason: 'ended', status: 409 };
    if (leerJugadores()[key]?.disqualified) return { error: 'This wallet was disqualified.', reason: 'disqualified', status: 403 };
    if (!registrado(registro(key))) {
        return { error: 'Set a nickname and your X or Discord first.', reason: 'not-registered', status: 409 };
    }
    const hoy = dia(now);
    const usados = normalesDe(jugadores().get(key), hoy);
    const base = baseDe(config, tier);
    const regalo = usados >= base + extrasDe(key, hoy);
    if (regalo && !regalosDe(key)) {
        return { error: "You've opened all your packs for today.", reason: 'no-packs', status: 409 };
    }

    const cartas = Array.from({ length: CARTAS_POR_PACK }, () => sortearCarta(config));
    const entrada = {
        at: new Date(now).toISOString(),
        id: crypto.randomUUID(),
        wallet: key,
        day: hoy,
        cards: cartas.map(c => c.id),
        points: cartas.reduce((s, c) => s + config.rarities[c.rarity].points, 0),
        extra: !regalo && usados >= base,
        ...(regalo ? { gift: true } : {}),
    };
    appendJsonLine(OPENS_PATH, entrada);
    sumar(entrada);
    return { pack: { id: entrada.id, cards: entrada.cards, points: entrada.points }, me: resumen(key, { tier }, now) };
}

function puedeComprarExtra(wallet, now = Date.now()) {
    const key = wallet.toLowerCase();
    const config = getConfig();
    if (!extraPublico(config)) return { error: "Extra packs aren't on sale.", reason: 'no-extras', status: 409 };
    if (estado(config, now) !== 'open') return { error: "Packs aren't open right now.", reason: 'closed', status: 409 };
    if (leerJugadores()[key]?.disqualified) return { error: 'This wallet was disqualified.', reason: 'disqualified', status: 403 };
    if (!registrado(registro(key))) return { error: 'Set a nickname and your X or Discord first.', reason: 'not-registered', status: 409 };
    if (extrasDe(key, dia(now)) >= config.extraMax) {
        return { error: `You already bought ${config.extraMax} extra packs today.`, reason: 'max-extras', status: 409 };
    }
    return { ok: true };
}

function buyExtra(wallet, payment, { tier = null } = {}, now = Date.now()) {
    const key = wallet.toLowerCase();
    const hash = payment.txHash.toLowerCase();
    const extras = leerExtras();
    if (extras[hash]) {
        if (extras[hash].wallet !== key) return { error: 'That payment was made by another wallet.', reason: 'wrong-sender', status: 403 };
        return { me: resumen(key, { tier }, now) };
    }
    if (require('./forgeStore').getPayment(hash) || require('./stakingStore').isPurchase(hash)) {
        return { error: 'That payment was already used.', reason: 'already-used', status: 409 };
    }
    extras[hash] = {
        txHash: hash,
        wallet: key,
        day: dia(now),
        valueWei: payment.valueWei,
        blockNumber: payment.blockNumber,
        at: new Date(now).toISOString(),
    };
    writeJson(EXTRAS_PATH, extras);
    return { me: resumen(key, { tier }, now), created: true };
}

function register(wallet, datos = {}) {
    const key = wallet.toLowerCase();
    const nickname = String(datos.nickname ?? '').trim();
    const apodo = nicknames.validate(nickname);
    if (apodo.error) return { error: apodo.error, status: 400 };

    const actual = profiles.getProfile(key) || {};
    const { value, error } = profiles.validate({ ...actual, x: datos.x, discord: datos.discord });
    if (error) return { error, status: 400 };
    if (!value.x && !value.discord) return { error: 'Add your X or Discord username.', status: 400 };
    const tomada = profiles.socialTomada(key, value);
    if (tomada) return { error: tomada, status: 409 };

    if (nicknames.getNickname(key) !== apodo.value) {
        const r = nicknames.setNickname(key, apodo.value);
        if (r.error) return { error: r.error, status: 409 };
    }
    profiles.setProfile(key, { ...actual, x: value.x, discord: value.discord });
    return { ok: true };
}

function setSolana(wallet, address, now = Date.now()) {
    const key = wallet.toLowerCase();
    if (!resumen(key, {}, now).winner) return { error: 'Only winners can add a Solana wallet.', status: 403 };
    const valor = String(address ?? '').trim();
    if (!SOLANA.test(valor)) return { error: "That doesn't look like a Solana wallet.", status: 400 };
    const todos = leerJugadores();
    todos[key] = { ...todos[key], solana: { address: valor, at: new Date(now).toISOString() } };
    writeJson(PLAYERS_PATH, todos);
    return { solana: valor };
}

function updateConfig(cambios = {}, now = Date.now()) {
    const config = getConfig();
    const siguiente = { ...config, rarities: { ...config.rarities } };

    if ('status' in cambios) {
        if (!['upcoming', 'open', 'ended'].includes(cambios.status)) return { error: 'Invalid status.' };
        if (cambios.status === 'open' && estado(config, now) !== 'open') {
            siguiente.openedAt = new Date(now).toISOString();
            if (config.endsAt && Date.parse(config.endsAt) <= now && !('endsAt' in cambios)) siguiente.endsAt = null;
        }
        if (cambios.status === 'ended' && estado(config, now) !== 'ended') siguiente.endedAt = new Date(now).toISOString();
        siguiente.status = cambios.status;
    }
    if ('endsAt' in cambios) {
        if (cambios.endsAt === null || cambios.endsAt === '') siguiente.endsAt = null;
        else if (!Number.isFinite(Date.parse(cambios.endsAt))) return { error: 'Invalid end date.' };
        else siguiente.endsAt = new Date(cambios.endsAt).toISOString();
    }
    if ('tiers' in cambios) {
        siguiente.tiers = { ...config.tiers };
        for (const nivel of NIVELES) {
            if (cambios.tiers?.[nivel] === undefined) continue;
            const n = intEntre(cambios.tiers[nivel], 0, 50);
            if (n === null) return { error: 'Packs per tier must be between 0 and 50.' };
            siguiente.tiers[nivel] = n;
        }
    }
    if ('extraPrice' in cambios) {
        const precio = Number(cambios.extraPrice);
        if (!Number.isFinite(precio) || precio < 0 || precio > 100000) return { error: 'Invalid extra pack price.' };
        siguiente.extraPrice = precio;
    }
    if ('extraMax' in cambios) {
        const n = intEntre(cambios.extraMax, 0, 10);
        if (n === null) return { error: 'Extra packs per day must be between 0 and 10.' };
        siguiente.extraMax = n;
    }
    if ('winners' in cambios) {
        if (cambios.winners === null || cambios.winners === '') siguiente.winners = null;
        else {
            const n = intEntre(cambios.winners, 1, 10000);
            if (n === null) return { error: 'Winners must be a whole number.' };
            siguiente.winners = n;
        }
    }
    if ('rarities' in cambios) {
        for (const r of RAREZAS) {
            const pedido = cambios.rarities?.[r];
            if (!pedido) continue;
            const chance = intEntre(pedido.chance, 0, 10000);
            const points = intEntre(pedido.points, 0, 100000);
            if (chance === null || points === null) return { error: `Invalid values for ${r}.` };
            siguiente.rarities[r] = { chance, points };
        }
        const total = RAREZAS.reduce((s, r) => s + siguiente.rarities[r].chance, 0);
        if (total !== 10000) return { error: `Chances must add up to 100% (now ${total / 100}%).` };
    }

    writeJson(CONFIG_PATH, siguiente);
    return { config: siguiente };
}

function setDisqualified(wallet, disqualified, reason = '', now = Date.now()) {
    const key = String(wallet || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(key)) return { error: 'Invalid wallet.' };
    const todos = leerJugadores();
    const jugador = { ...todos[key] };
    if (disqualified) jugador.disqualified = { at: new Date(now).toISOString(), reason: String(reason).slice(0, 200) };
    else delete jugador.disqualified;
    todos[key] = jugador;
    writeJson(PLAYERS_PATH, todos);
    version++;
    return { ok: true };
}

function participantesChosen() {
    if (!CHOSEN_ID) return [];
    jugadores();
    if (cacheChosen?.version !== version) cacheChosen = { version, valor: calcularChosen() };
    const apodos = nicknames.getAllNicknames();
    return cacheChosen.valor.map(p => ({ ...p, nickname: apodos[p.wallet] ?? null }));
}

function calcularChosen() {
    const fuera = leerJugadores();
    const primera = new Map();
    for (const a of aperturas.values()) {
        if (!a.cards.includes(CHOSEN_ID)) continue;
        const antes = primera.get(a.wallet);
        if (!antes || a.at < antes.at) primera.set(a.wallet, { at: a.at, count: (antes?.count || 0) + 1 });
        else antes.count++;
    }
    return [...primera]
        .filter(([wallet]) => !fuera[wallet]?.disqualified)
        .map(([wallet, d]) => ({ wallet, pulls: d.count, firstAt: d.at }))
        .sort((a, b) => a.firstAt.localeCompare(b.firstAt));
}

function sortearChosen(now = Date.now()) {
    jugadores();
    const config = getConfig();
    if (config.chosenRaffle?.winner) return { error: 'The raffle already has a winner.', status: 409 };
    const lista = participantesChosen();
    if (!lista.length) return { error: 'Nobody pulled The Chosen yet.', status: 409 };
    const ganador = lista[crypto.randomInt(lista.length)];
    writeJson(CONFIG_PATH, { ...readJson(CONFIG_PATH, {}), chosenRaffle: { winner: ganador.wallet, drawnAt: new Date(now).toISOString(), entrants: lista.length } });
    return { ok: true };
}

function reiniciarSorteoChosen() {
    const guardada = readJson(CONFIG_PATH, {});
    delete guardada.chosenRaffle;
    writeJson(CONFIG_PATH, guardada);
    return { ok: true };
}

function porDia(extras) {
    const dias = new Map();
    const fila = d => {
        if (!dias.has(d)) dias.set(d, { day: d, players: 0, newPlayers: 0, packs: 0, extras: 0, wallets: [] });
        return dias.get(d);
    };
    const compras = new Map();
    for (const e of extras) {
        if (!e.day) continue;
        fila(e.day).extras++;
        const k = `${e.day}|${e.wallet}`;
        compras.set(k, (compras.get(k) || 0) + 1);
    }
    for (const [wallet, j] of jugadores()) {
        const suyos = Object.keys(j.days).sort();
        suyos.forEach((d, i) => {
            const f = fila(d);
            f.players++;
            f.packs += j.days[d];
            if (i === 0) f.newPlayers++;
            f.wallets.push({
                wallet,
                isNew: i === 0,
                packs: j.days[d],
                points: j.pointsByDay[d] || 0,
                extras: compras.get(`${d}|${wallet}`) || 0,
                daysPlayed: i + 1,
            });
        });
    }
    for (const f of dias.values()) f.wallets.sort((a, b) => b.isNew - a.isNew || b.points - a.points);
    return [...dias.values()].sort((a, b) => b.day.localeCompare(a.day));
}

function adminSummary(now = Date.now()) {
    const config = getConfig();
    const fuera = leerJugadores();
    const hoy = dia(now);
    const orden = new Map(ranking(now).map(f => [f.wallet, f.rank]));
    const filas = [...jugadores()].map(([wallet, j]) => ({
        wallet,
        rank: orden.get(wallet) ?? null,
        ...registro(wallet),
        points: j.points,
        packs: j.packs,
        days: Object.keys(j.days).length,
        streak: rachaDe(j.days, now),
        firstAt: j.firstAt,
        lastAt: j.lastAt,
        disqualified: fuera[wallet]?.disqualified ?? null,
        solana: fuera[wallet]?.solana ?? null,
    })).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || b.points - a.points);
    const porRareza = Object.fromEntries(RAREZAS.map(r => [r, CARTAS.filter(c => c.rarity === r).length]));
    const extras = Object.values(leerExtras());
    return {
        config,
        status: estado(config, now),
        cardsByRarity: porRareza,
        totals: {
            players: filas.length,
            packs: filas.reduce((s, f) => s + f.packs, 0),
            today: [...jugadores().values()].reduce((s, j) => s + (j.days[hoy] || 0), 0),
            playersToday: [...jugadores().values()].filter(j => j.days[hoy]).length,
            extras: extras.length,
            extrasToday: extras.filter(e => e.day === hoy).length,
            gifted: Object.keys(leerRegalos()).length,
            extraApe: formatEther(extras.reduce((s, e) => s + BigInt(e.valueWei || 0), 0n)),
        },
        players: filas,
        daily: porDia(extras),
        chosen: { entrants: participantesChosen(), raffle: config.chosenRaffle ?? null },
    };
}

module.exports = {
    PACKS_DIR,
    comprasDeExtras,
    CARTAS_POR_PACK,
    getConfig,
    publicConfig,
    leaderboard,
    pull,
    resumen,
    open,
    puedeComprarExtra,
    buyExtra,
    grantPacks,
    isExtraPayment,
    sortearChosen,
    reiniciarSorteoChosen,
    register,
    setSolana,
    updateConfig,
    setDisqualified,
    adminSummary,
};
