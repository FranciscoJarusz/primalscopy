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
const COLECCION = CARTAS.filter(c => c.rarity !== 'chosen').map(c => c.id);
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
    extraBoost: 50,
    winners: null,
    prizes: ['Mudwater pack + 5 Primals', '4 Primals', '3 Primals', '2 Primals', '1 Primal'],
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
    if (!j.completedAt && COLECCION.length && COLECCION.every(id => j.collection[id])) j.completedAt = open.at;
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

const puntosDe = (j, jugador) => (j?.points || 0) + (jugador?.adjust?.points || 0);

const registrado = r => Boolean(r.nickname && (r.x || r.discord));

function ranking(now = Date.now()) {
    const todos = jugadores();
    const clave = `${version}:${dia(now)}`;
    if (cacheRanking?.clave === clave) return cacheRanking.valor;
    const fuera = leerJugadores();
    const valor = [...todos]
        .map(([wallet, j]) => [wallet, j, puntosDe(j, fuera[wallet])])
        .filter(([wallet, , puntos]) => puntos > 0 && !fuera[wallet]?.disqualified)
        .sort(([, a, pa], [, b, pb]) => pb - pa || a.lastAt.localeCompare(b.lastAt))
        .map(([wallet, j, puntos], i) => ({ rank: i + 1, wallet, points: puntos, packs: j.packs, streak: rachaDe(j.days, now).current, today: Boolean(j.days[dia(now)]) }));
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

const refMeta = d => `goal:${d}`;
const RACHA_META = 2;

function premiarMeta(config, now) {
    const meta = config.goal;
    if (!meta?.daily || avanceMeta(meta, now) < meta.target) return;
    const hoy = dia(now);
    const regalos = leerRegalos();
    const at = new Date(now).toISOString();
    const descalificados = leerJugadores();
    let nuevos = 0;
    for (const [wallet, j] of jugadores()) {
        const id = `${refMeta(hoy)}:${wallet}:0`;
        if (!j.days[hoy] || regalos[id] || descalificados[wallet]?.disqualified) continue;
        if (rachaDe(j.days, now).current < RACHA_META) continue;
        regalos[id] = { wallet, ref: refMeta(hoy), at };
        nuevos++;
    }
    if (nuevos) writeJson(GIFTS_PATH, regalos);
}

const ganoMetaHoy = (key, now) => Boolean(leerRegalos()[`${refMeta(dia(now))}:${key}:0`]);

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
        boost: config.extraBoost || 0,
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
        prizes: config.prizes,
        collectionPrize: config.collectionPrize || null,
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
        collectors: coleccionistas(),
    };
}

function coleccionistas() {
    const fuera = leerJugadores();
    const apodos = nicknames.getAllNicknames();
    return [...jugadores()]
        .filter(([wallet, j]) => j.completedAt && !fuera[wallet]?.disqualified)
        .map(([wallet, j]) => ({ wallet, nickname: apodos[wallet] ?? null, at: j.completedAt, packs: j.packs }))
        .sort((a, b) => a.at.localeCompare(b.at));
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
        goalRewardToday: ganoMetaHoy(key, now),
        points: puntosDe(j, jugador),
        packs: j?.packs || 0,
        rank: fila?.rank ?? null,
        streak: rachaDe(j?.days || {}, now),
        collection: j?.collection || {},
        collectionComplete: Boolean(j?.completedAt),
        completedAt: j?.completedAt ?? null,
        disqualified: Boolean(jugador.disqualified),
        winner,
        chosenEntered: Boolean(CHOSEN_ID && j?.collection[CHOSEN_ID]),
        chosenWinner: ganoSorteo,
        solana: winner ? jugador.solana?.address ?? null : null,
    };
}

const CON_BOOST = ['rare', 'epic', 'legendary'];

function chancesDe(config, extra) {
    const chances = Object.fromEntries(RAREZAS.map(r => [r, config.rarities[r].chance]));
    if (!extra || !(config.extraBoost > 0)) return chances;
    let sumado = 0;
    for (const r of CON_BOOST) {
        const nueva = Math.round(chances[r] * (1 + config.extraBoost / 100));
        sumado += nueva - chances[r];
        chances[r] = nueva;
    }
    const quita = Math.min(sumado, chances.common);
    chances.common -= quita;
    if (quita < sumado) chances.uncommon = Math.max(0, chances.uncommon - (sumado - quita));
    return chances;
}

function sortearCarta(config, extra = false, { sinChosen = false } = {}) {
    const chances = chancesDe(config, extra);
    if (sinChosen) chances.chosen = 0;
    const rarezas = RAREZAS.filter(r => chances[r] > 0 && CARTAS.some(c => c.rarity === r));
    if (!rarezas.length) {
        const resto = CARTAS.filter(c => c.rarity !== 'chosen');
        return resto[crypto.randomInt(resto.length)];
    }
    let n = crypto.randomInt(rarezas.reduce((s, r) => s + chances[r], 0));
    const rareza = rarezas.find(r => (n -= chances[r]) < 0);
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

    const pagado = !regalo && usados >= base;
    let tieneChosen = Boolean(CHOSEN_ID && jugadores().get(key)?.collection[CHOSEN_ID]);
    const cartas = Array.from({ length: CARTAS_POR_PACK }, () => {
        const carta = sortearCarta(config, pagado, { sinChosen: tieneChosen });
        if (carta.rarity === 'chosen') tieneChosen = true;
        return carta;
    });
    const entrada = {
        at: new Date(now).toISOString(),
        id: crypto.randomUUID(),
        wallet: key,
        day: hoy,
        cards: cartas.map(c => c.id),
        points: cartas.reduce((s, c) => s + config.rarities[c.rarity].points, 0),
        extra: pagado,
        ...(regalo ? { gift: true } : {}),
    };
    appendJsonLine(OPENS_PATH, entrada);
    sumar(entrada);
    premiarMeta(config, now);
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

function buyExtra(wallet, payment, { tier = null, source = null } = {}, now = Date.now()) {
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
        ...(source ? { source } : {}),
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
    if ('extraBoost' in cambios) {
        const n = intEntre(cambios.extraBoost, 0, 300);
        if (n === null) return { error: 'Better odds must be between 0% and 300%.' };
        siguiente.extraBoost = n;
    }
    if ('winners' in cambios) {
        if (cambios.winners === null || cambios.winners === '') siguiente.winners = null;
        else {
            const n = intEntre(cambios.winners, 1, 10000);
            if (n === null) return { error: 'Winners must be a whole number.' };
            siguiente.winners = n;
        }
    }
    if ('prizes' in cambios) {
        if (!Array.isArray(cambios.prizes)) return { error: 'Invalid prizes.' };
        const premios = cambios.prizes.map(p => String(p ?? '').trim().slice(0, 60));
        while (premios.length && !premios[premios.length - 1]) premios.pop();
        if (premios.length > 20) return { error: 'Up to 20 prizes.' };
        if (premios.some(p => !p)) return { error: 'Every place up to the last one needs a prize.' };
        siguiente.prizes = premios;
    }
    if ('collectionPrize' in cambios) {
        siguiente.collectionPrize = String(cambios.collectionPrize ?? '').trim().slice(0, 120) || null;
    }
    if ('goal' in cambios) {
        const meta = cambios.goal;
        if (meta === null) siguiente.goal = null;
        else {
            const target = intEntre(meta?.target, 1, 10000000);
            if (target === null) return { error: 'The goal needs a number of packs.' };
            const title = String(meta.title ?? '').trim().slice(0, 80);
            const reward = String(meta.reward ?? '').trim().slice(0, 120);
            if (!reward) return { error: 'Write what the community unlocks.' };
            if (meta.daily === true) siguiente.goal = { title, reward, target, daily: true };
            else {
                const fecha = v => (v === null || v === undefined || v === '' ? null : Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : undefined);
                const from = fecha(meta.from);
                const to = fecha(meta.to);
                if (from === undefined || to === undefined) return { error: 'Invalid goal dates.' };
                if (from && to && Date.parse(to) <= Date.parse(from)) return { error: 'The goal has to end after it starts.' };
                siguiente.goal = { title, reward, target, from: from ?? new Date(now).toISOString(), to };
            }
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
    if ('goal' in cambios) premiarMeta(siguiente, now);
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

function setAdjust(wallet, points, reason = '', now = Date.now()) {
    const key = String(wallet || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(key)) return { error: 'Invalid wallet.' };
    const cantidad = intEntre(points, -1000000, 1000000);
    if (cantidad === null) return { error: 'Invalid points.' };
    const todos = leerJugadores();
    const jugador = { ...todos[key] };
    if (cantidad === 0) delete jugador.adjust;
    else jugador.adjust = { points: cantidad, reason: String(reason).slice(0, 200), at: new Date(now).toISOString() };
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
        if (!dias.has(d)) dias.set(d, { day: d, players: 0, newPlayers: 0, packs: 0, extras: 0, goalRewards: 0, wallets: [] });
        return dias.get(d);
    };
    const compras = new Map();
    for (const e of extras) {
        if (!e.day) continue;
        fila(e.day).extras++;
        const k = `${e.day}|${e.wallet}`;
        compras.set(k, (compras.get(k) || 0) + 1);
    }
    for (const g of Object.values(leerRegalos())) {
        if (g.ref?.startsWith('goal:')) fila(g.ref.slice(5)).goalRewards++;
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

function ventanaMeta(meta, now) {
    if (meta.daily) {
        const desde = Date.parse(`${dia(now)}T00:00:00.000Z`);
        return { desde, hasta: desde + DAY_MS };
    }
    return { desde: meta.from ? Date.parse(meta.from) : -Infinity, hasta: meta.to ? Date.parse(meta.to) : Infinity };
}

function avanceMeta(meta, now) {
    jugadores();
    const { desde, hasta } = ventanaMeta(meta, now);
    let packs = 0;
    for (const a of aperturas.values()) {
        const t = Date.parse(a.at);
        if (a.gift) continue;
        if (t >= desde && (meta.daily ? t < hasta : t <= hasta)) packs++;
    }
    return packs;
}

function metaPublica(config, now = Date.now()) {
    const meta = config.goal;
    if (!meta?.target) return null;
    const progress = avanceMeta(meta, now);
    if (meta.daily) {
        const { desde, hasta } = ventanaMeta(meta, now);
        return {
            title: meta.title,
            reward: meta.reward,
            target: meta.target,
            daily: true,
            progress,
            from: new Date(desde).toISOString(),
            to: new Date(hasta).toISOString(),
            status: progress >= meta.target ? 'reached' : 'running',
        };
    }
    return {
        title: meta.title,
        reward: meta.reward,
        target: meta.target,
        daily: false,
        progress,
        from: meta.from,
        to: meta.to,
        status: progress >= meta.target ? 'reached' : meta.to && Date.parse(meta.to) <= now ? 'missed' : 'running',
    };
}

const ORDEN_RAREZA = Object.fromEntries(RAREZAS.map((r, i) => [r, i]));

function enVivo(now = Date.now()) {
    const config = getConfig();
    const todos = jugadores();
    const hoy = dia(now);
    const orden = ranking(now);
    const apodos = nicknames.getAllNicknames();
    let deHoy = 0;
    for (const j of todos.values()) deHoy += j.days[hoy] || 0;
    const grandes = [];
    for (const a of aperturas.values()) {
        const mejor = a.cards
            .map(id => CARTAS.find(c => c.id === id))
            .filter(Boolean)
            .sort((x, y) => ORDEN_RAREZA[y.rarity] - ORDEN_RAREZA[x.rarity])[0];
        if (mejor && ORDEN_RAREZA[mejor.rarity] >= ORDEN_RAREZA.epic) grandes.push({ at: a.at, wallet: a.wallet, pull: a.id, card: cartaPublica(mejor) });
    }
    return {
        status: estado(config, now),
        endsAt: config.endsAt,
        players: orden.length,
        today: deHoy,
        top: orden.slice(0, 3).map(f => ({ rank: f.rank, wallet: f.wallet, nickname: apodos[f.wallet] ?? null, points: f.points })),
        goal: metaPublica(config, now),
        pulls: grandes.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12),
    };
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
        points: puntosDe(j, fuera[wallet]),
        adjust: fuera[wallet]?.adjust ?? null,
        packs: j.packs,
        days: Object.keys(j.days).length,
        streak: rachaDe(j.days, now),
        firstAt: j.firstAt,
        lastAt: j.lastAt,
        disqualified: fuera[wallet]?.disqualified ?? null,
        solana: fuera[wallet]?.solana ?? null,
    })).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || b.points - a.points);
    const porRareza = Object.fromEntries(RAREZAS.map(r => [r, CARTAS.filter(c => c.rarity === r).length]));
    const rarezaDe = new Map(CARTAS.map(c => [c.id, c.rarity]));
    const probabilidades = [false, true].map(extra => {
        const chances = chancesDe(config, extra);
        const validas = RAREZAS.filter(r => chances[r] > 0 && porRareza[r] > 0);
        const total = validas.reduce((s, r) => s + chances[r], 0);
        return Object.fromEntries(RAREZAS.map(r => [r, total && validas.includes(r) ? chances[r] / total : 0]));
    });
    const sacadas = Object.fromEntries(RAREZAS.map(r => [r, { count: 0, expected: 0 }]));
    for (const a of aperturas.values()) {
        for (const id of a.cards) {
            const r = rarezaDe.get(id);
            if (r) sacadas[r].count++;
        }
        for (const r of RAREZAS) sacadas[r].expected += probabilidades[a.extra ? 1 : 0][r] * a.cards.length;
    }
    for (const r of RAREZAS) sacadas[r].expected = Math.round(sacadas[r].expected * 10) / 10;
    const extras = Object.values(leerExtras());
    return {
        config,
        status: estado(config, now),
        cardsByRarity: porRareza,
        pulledByRarity: sacadas,
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
        credited: extras.filter(e => e.source).sort((a, b) => b.at.localeCompare(a.at)),
        chosen: { entrants: participantesChosen(), raffle: config.chosenRaffle ?? null },
        collectors: coleccionistas(),
        goal: metaPublica(config, now),
    };
}

module.exports = {
    PACKS_DIR,
    enVivo,
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
    chancesDe,
    sortearChosen,
    reiniciarSorteoChosen,
    register,
    setSolana,
    updateConfig,
    setDisqualified,
    setAdjust,
    adminSummary,
};
