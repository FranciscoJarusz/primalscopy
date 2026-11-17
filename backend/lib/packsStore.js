const path = require('path');
const { ASSETS_ROOT } = require('./assetStore');
const { readJson, writeJson } = require('./jsonFiles');
const { crearTemporada } = require('./packsSeason');

const PACKS_DIR = path.join(ASSETS_ROOT, 'packs');
const SEASONS_PATH = path.join(PACKS_DIR, 'seasons.json');
const MUDWATER = 'mudwater';
const ID_VALIDO = /^[a-z0-9][a-z0-9-]{1,29}$/;
const CARTAS_POR_PACK = 5;

const DEFAULTS_MUDWATER = {
    name: 'Primal Cult × Mudwater',
    theme: 'mudwater',
    solana: true,
    chosenPrize: 'Mudwater pack',
    specialCard: true,
    prizes: ['Mudwater pack + 5 Primals', '4 Primals', '3 Primals', '2 Primals', '1 Primal'],
};

const REGLAS = ['tiers', 'rarities', 'extraPrice', 'extraMax', 'extraBoost'];

const instancias = new Map();

function leerTemporadas() {
    const guardado = readJson(SEASONS_PATH, null);
    const list = Array.isArray(guardado?.list) && guardado.list.length ? guardado.list : [{ id: MUDWATER, createdAt: null }];
    const current = list.some(t => t.id === guardado?.current) ? guardado.current : list[list.length - 1].id;
    return { current, list };
}

const dirDe = id => (id === MUDWATER ? PACKS_DIR : path.join(PACKS_DIR, 'seasons', id));

function temporada(id) {
    if (!leerTemporadas().list.some(t => t.id === id)) return null;
    if (!instancias.has(id)) {
        instancias.set(id, crearTemporada({
            id,
            dir: dirDe(id),
            defaults: id === MUDWATER ? DEFAULTS_MUDWATER : {},
            pagoUsado: hash => todas().some(t => t.id !== id && t.isExtraPayment(hash)),
        }));
    }
    return instancias.get(id);
}

const todas = () => leerTemporadas().list.map(t => temporada(t.id));
const actual = () => temporada(leerTemporadas().current);

function listarTemporadas(now = Date.now()) {
    const { current, list } = leerTemporadas();
    return list.map(t => {
        const config = temporada(t.id).getConfig();
        return { id: t.id, name: config.name, theme: config.theme, status: temporada(t.id).estado(now), createdAt: t.createdAt, current: t.id === current };
    });
}

function crearNueva({ id, name, copyFrom } = {}, now = Date.now()) {
    const clave = String(id ?? '').trim().toLowerCase();
    if (!ID_VALIDO.test(clave)) return { error: 'The id can only use lowercase letters, numbers and dashes (2 to 30).' };
    const { current, list } = leerTemporadas();
    if (list.some(t => t.id === clave)) return { error: 'That season already exists.' };
    const nombre = String(name ?? '').trim().slice(0, 60);
    if (!nombre) return { error: 'The season needs a name.' };
    const origen = temporada(copyFrom || current) || actual();
    const reglas = origen.getConfig();
    const config = { name: nombre, status: 'upcoming', ...Object.fromEntries(REGLAS.map(k => [k, reglas[k]])) };
    config.upgrades = { from: null, tradeUp: reglas.upgrades.tradeUp, swap: reglas.upgrades.swap };
    writeJson(path.join(dirDe(clave), 'config.json'), config);
    writeJson(SEASONS_PATH, { current, list: [...list, { id: clave, createdAt: new Date(now).toISOString() }] });
    return { season: clave };
}

function elegirActual(id) {
    const { list } = leerTemporadas();
    if (!list.some(t => t.id === id)) return { error: 'Unknown season.', status: 404 };
    writeJson(SEASONS_PATH, { current: id, list });
    return { ok: true };
}

function pull(id) {
    for (const t of todas()) {
        const datos = t.pull(id);
        if (datos) {
            const config = t.getConfig();
            return { ...datos, season: t.id, seasonName: config.name, theme: config.theme };
        }
    }
    return null;
}

const DELEGADAS = [
    'enVivo', 'getConfig', 'publicConfig', 'leaderboard', 'resumen', 'open', 'openFree', 'upgrade', 'puedeComprarExtra',
    'buyExtra', 'grantPacks', 'chancesDe', 'comprometerSorteo', 'resolverSorteos', 'sortearAuto', 'deshacerSorteo', 'register',
    'setSolana', 'updateConfig', 'setDisqualified', 'setAdjust', 'adminSummary',
];

function iniciarSorteosAutomaticos() {
    const tick = async () => {
        for (const t of todas()) {
            try {
                await t.sortearAuto();
                await t.resolverSorteos();
            } catch (error) {
                console.error('[packs]', error);
            }
        }
    };
    setInterval(tick, 5 * 1000).unref();
    setTimeout(tick, 8000).unref();
}

module.exports = {
    PACKS_DIR,
    iniciarSorteosAutomaticos,
    MUDWATER,
    CARTAS_POR_PACK,
    dirDe,
    temporada,
    actual,
    listarTemporadas,
    crearNueva,
    elegirActual,
    pull,
    isExtraPayment: hash => todas().some(t => t.isExtraPayment(hash)),
    comprasDeExtras: () => todas().flatMap(t => t.comprasDeExtras().map(e => ({ ...e, season: t.id }))),
    ...Object.fromEntries(DELEGADAS.map(n => [n, (...args) => actual()[n](...args)])),
};
