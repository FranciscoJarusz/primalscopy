const fs = require('fs');
const path = require('path');
const { ASSETS_ROOT, readMetadata, writeAtomic } = require('./assetStore');
const { fetchOrigin, currentMetadata } = require('./metadataSync');
const { getTokenOwners, CONTRACT_ADDRESS } = require('./nftOwnership');
const supply = require('./collectionSupply');
const transfers = require('./transferIndex');

const INDEX_PATH = path.join(ASSETS_ROOT, 'explore', 'index.json');
const REFRESH_MS = 6 * 60 * 60 * 1000;
const OWNERS_MS = 10 * 60 * 1000;
const SIMULTANEAS = 4;
const UNICO = '1/1';
const SIN_DUENO = new Set([
    '0x0000000000000000000000000000000000000000',
    '0x000000000000000000000000000000000000dead'
]);

let indice = null;
let derivado = null;
let construyendo = null;

function leerIndice() {
    if (indice) return indice;
    try {
        indice = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
        for (const token of Object.values(indice.tokens ?? {})) conAmuleto(token.attributes);
    } catch {
        indice = { builtAt: null, tokens: {} };
    }
    return indice;
}

function guardarIndice() {
    fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
    writeAtomic(INDEX_PATH, JSON.stringify(indice));
    derivado = null;
}

// Los Morale Amulet cuentan como 1/1: se les suma el atributo para que el
// explorador los trate como tales (ranking, filtro y ficha).
const AMULETO = 'Morale Amulet';

function conAmuleto(attributes) {
    if (attributes.some(a => a.trait_type === 'Effect' && a.value === AMULETO) && !attributes.some(a => a.trait_type === UNICO)) {
        attributes.push({ trait_type: UNICO, value: AMULETO });
    }
    return attributes;
}

function entrada(metadata) {
    const attributes = (metadata.attributes || [])
        .filter(a => a && a.trait_type)
        .map(a => ({ trait_type: String(a.trait_type), value: String(a.value) }));
    return { name: metadata.name || null, image: metadata.image || null, attributes: conAmuleto(attributes) };
}

async function leerToken(id) {
    try {
        return entrada(await fetchOrigin(id));
    } catch {
        const local = readMetadata(id);
        return local ? entrada(local) : null;
    }
}

async function construir() {
    const total = await supply.totalSupply();
    const ids = Array.from({ length: total }, (_, i) => String(i + 1));
    const actual = leerIndice();
    const tokens = { ...actual.tokens };
    let siguiente = 0;
    const trabajador = async () => {
        while (siguiente < ids.length) {
            const id = ids[siguiente++];
            const datos = await leerToken(id);
            if (datos) tokens[id] = datos;
        }
    };
    await Promise.all(Array.from({ length: SIMULTANEAS }, trabajador));
    indice = { builtAt: new Date().toISOString(), tokens };
    guardarIndice();
    return Object.keys(tokens).length;
}

function reconstruir() {
    construyendo ??= construir().finally(() => { construyendo = null; });
    return construyendo;
}

function startCollectionIndex({ alTerminar } = {}) {
    const tick = () => reconstruir()
        .then(n => {
            console.log(`[explore] Indice de la coleccion: ${n} Primals.`);
            alTerminar?.(Object.keys(leerIndice().tokens));
        })
        .catch(error => console.error('[explore] No se pudo armar el indice:', error.message));
    const { builtAt } = leerIndice();
    const edad = builtAt ? Date.now() - Date.parse(builtAt) : Infinity;
    setTimeout(() => {
        tick();
        setInterval(tick, REFRESH_MS).unref();
    }, Math.max(0, REFRESH_MS - edad)).unref();
    if (edad < REFRESH_MS) alTerminar?.(Object.keys(leerIndice().tokens));
}

function derivar() {
    if (derivado) return derivado;
    const tokens = leerIndice().tokens;
    const ids = Object.keys(tokens).sort((a, b) => Number(a) - Number(b));
    const conteo = {};
    for (const id of ids) {
        for (const { trait_type, value } of tokens[id].attributes) {
            (conteo[trait_type] ??= {})[value] = (conteo[trait_type][value] ?? 0) + 1;
        }
    }
    const n = ids.length;
    const puntaje = {};
    for (const id of ids) {
        const attrs = tokens[id].attributes;
        puntaje[id] = attrs.some(a => a.trait_type === UNICO)
            ? Infinity
            : attrs.reduce((s, a) => s + n / conteo[a.trait_type][a.value], 0);
    }
    const orden = [...ids].sort((a, b) => puntaje[b] - puntaje[a] || Number(a) - Number(b));
    const puesto = Object.fromEntries(orden.map((id, i) => [id, i + 1]));
    derivado = { ids, conteo, puntaje, puesto, total: n };
    return derivado;
}

let duenos = { leidos: 0, mapa: null };
let leyendoDuenos = null;

async function owners() {
    const delIndice = transfers.duenos();
    if (delIndice) return delIndice;
    if (duenos.mapa && Date.now() - duenos.leidos < OWNERS_MS) return duenos.mapa;
    leyendoDuenos ??= getTokenOwners(derivar().ids)
        .then(mapa => {
            duenos = { leidos: Date.now(), mapa };
            return mapa;
        })
        .finally(() => { leyendoDuenos = null; });
    try {
        return await leyendoDuenos;
    } catch (error) {
        if (duenos.mapa) return duenos.mapa;
        throw error;
    }
}

async function ownerOf(id) {
    const dueno = (await owners()).get(String(id)) ?? null;
    return dueno && !SIN_DUENO.has(dueno) ? dueno : null;
}

let rankingMemo = { mapa: null, datos: null };

async function holders() {
    const mapa = await owners();
    if (rankingMemo.mapa === mapa) return rankingMemo.datos;
    const contrato = CONTRACT_ADDRESS.toLowerCase();
    const conteo = new Map();
    for (const dueno of mapa.values()) {
        if (!dueno || SIN_DUENO.has(dueno) || dueno === contrato) continue;
        conteo.set(dueno, (conteo.get(dueno) ?? 0) + 1);
    }
    const cantidades = [...conteo.values()].sort((a, b) => b - a);
    const puesto = new Map();
    cantidades.forEach((n, i) => { if (!puesto.has(n)) puesto.set(n, i + 1); });
    const datos = { conteo, puesto, total: conteo.size };
    rankingMemo = { mapa, datos };
    return datos;
}

let avataresMemo = { mapa: null, puesto: null, datos: null };

async function avatares() {
    const mapa = await owners();
    if (avataresMemo.mapa === mapa && avataresMemo.puesto === derivar().puesto) return avataresMemo.datos;
    const { puesto } = derivar();
    const mejor = new Map();
    for (const [id, dueno] of mapa) {
        if (!dueno || SIN_DUENO.has(dueno)) continue;
        const actual = mejor.get(dueno);
        if (!actual || (puesto[id] ?? Infinity) < (puesto[actual] ?? Infinity)) mejor.set(dueno, id);
    }
    avataresMemo = { mapa, puesto, datos: mejor };
    return mejor;
}

async function idsDe(wallet) {
    const key = wallet.toLowerCase();
    const ids = [];
    for (const [id, dueno] of await owners()) if (dueno === key) ids.push(id);
    return ids.sort((a, b) => Number(a) - Number(b));
}

function puestoDe(id) {
    return derivar().puesto[id] ?? null;
}

function coleccion() {
    const { ids, conteo, puesto, total } = derivar();
    const categorias = Object.keys(conteo).map(nombre => ({
        name: nombre,
        values: Object.entries(conteo[nombre])
            .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
            .map(([value, count]) => ({ value, count }))
    }));
    const posicion = categorias.map(c => new Map(c.values.map((v, i) => [v.value, i])));
    const tokens = leerIndice().tokens;
    return {
        builtAt: leerIndice().builtAt,
        total,
        categories: categorias,
        tokens: ids.map(id => {
            const porCategoria = Object.fromEntries(tokens[id].attributes.map(a => [a.trait_type, a.value]));
            return [Number(id), puesto[id], categorias.map((c, i) => posicion[i].get(porCategoria[c.name]) ?? -1)];
        })
    };
}

async function primal(id) {
    const metadata = await currentMetadata(id);
    const nueva = entrada(metadata);
    const actual = leerIndice();
    if (JSON.stringify(actual.tokens[id]) !== JSON.stringify(nueva)) {
        actual.tokens[id] = nueva;
        guardarIndice();
    }
    const { conteo, puesto, total } = derivar();
    return {
        id: String(id),
        name: nueva.name,
        image: nueva.image,
        oneOfOne: nueva.attributes.some(a => a.trait_type === UNICO),
        rank: puesto[id] ?? null,
        total,
        attributes: nueva.attributes.map(a => ({ ...a, count: conteo[a.trait_type]?.[a.value] ?? 1 }))
    };
}

module.exports = { startCollectionIndex, reconstruir, coleccion, primal, ownerOf, idsDe, holders, avatares, owners, puestoDe, INDEX_PATH };
