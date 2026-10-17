// lib/stakingStore.js
//
// Soft staking de Primals: el holder pone sus Primals a "entrenar" 7, 14, 30 o
// 90 dias sin mandarlos a ningun contrato, y cada dia completo suma FOG a su
// wallet. Reglas del dueño (octubre de 2026):
//
//   - Opt-in: el que no los pone a entrenar no suma.
//   - FOG por dia igual para todos, con bonus por periodo (14 dias +10%, 30
//     dias +30%, 90 dias +60%) y un bonus por cantidad que se suma: cuantos
//     mas Primals tiene la wallet en staking ese dia, mas suma cada uno (2 a 4
//     +5%, ... 20 o mas +20%). La tasa, los bonus y los precios se cambian
//     desde el admin.
//   - Se acredita dia a dia y es de la wallet, no del NFT.
//   - Se puede sacar antes de tiempo (unstake), pero se pierde el bonus de la
//     region: la wallet se queda solo con el FOG base de los dias que hizo.
//     Listarlo cuenta igual que sacarlo; si no, listar y deslistar seria un
//     unstake gratis. Venderlo o transferirlo lo saca y conserva todo.
//   - Al terminar el periodo deja de sumar: hay que volver a la pagina a
//     entrenarlo de nuevo. Es el gancho para que la gente vuelva.
//
// Como no hay contrato, nadie avisa cuando un Primal cambia de dueño. Cada
// tanto verifyStakes() pregunta a la cadena quien es el dueño de cada Primal
// en entrenamiento y a OpenSea cuales estan listados. Cada entrenamiento
// guarda `verifiedAt`, la ultima vez que se confirmo que seguia en regla, y
// solo cuentan los dias completos hasta ahi. Asi un Primal vendido nunca suma
// un dia que no se pudo verificar, y si la cadena u OpenSea no contestan un
// rato no se pierde nada: el proximo chequeo bueno acredita los dias de golpe.
//
// La tasa, el bonus de la region y los escalones por cantidad de cada
// entrenamiento quedan fijos al empezar: cambiarlos en el admin vale para los
// entrenamientos nuevos, no para los que ya estan corriendo. Lo que si cambia
// dia a dia es cuantos Primals tiene la wallet en staking, y con eso el
// escalon que le toca.
//
// Todo vive en JSONs del volumen. Las funciones que escriben son sincronicas
// a proposito, como en forgeStore: leer, decidir y escribir sin un await en el
// medio hace que dos canjes a la vez no puedan gastar el mismo FOG.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ASSETS_ROOT, writeAtomic } = require('./assetStore');
const { readJson, writeJson, appendJsonLine, readJsonLines, intEntre } = require('./jsonFiles');

const STAKING_DIR = path.join(ASSETS_ROOT, 'staking');
const CONFIG_PATH = path.join(STAKING_DIR, 'config.json');
// Entrenamientos en curso, por tokenId. Cuando uno termina sale de aca, su FOG
// pasa a `earned` de la wallet y queda en el historial.
const ACTIVE_PATH = path.join(STAKING_DIR, 'active.json');
// Por wallet: { earned, spent }. El saldo es earned + lo que van ganando sus
// entrenamientos en curso - spent.
const WALLETS_PATH = path.join(STAKING_DIR, 'wallets.json');
const HISTORY_PATH = path.join(STAKING_DIR, 'history.jsonl');
// Los iconos que se suben desde el admin para cada premio. Sin uno subido, la
// pagina usa el que viene con el sitio (web/public/images/staking/icons). El
// nombre lleva la hora de subida: cambia con cada icono nuevo, asi se puede
// cachear para siempre.
const ICONS_DIR = path.join(STAKING_DIR, 'icons');
const ICON_FILE_REGEX = /^[a-z0-9-]{1,40}-\d{13}\.webp$/;
const ICON_SIZE = 256;

const DAY_MS = 24 * 60 * 60 * 1000;
// Insignias (solo esteticas): dias seguidos con al menos un Primal en staking.
// Entre un entrenamiento y el siguiente hay GRACE_MS para volver; pasado eso
// la racha vuelve a cero, pero las insignias ganadas quedan.
const BADGES = [90, 180, 365];
const GRACE_MS = 3 * DAY_MS;
// Motivos de salida que pierden el bonus si el periodo no habia terminado.
const LOSES_BONUS = new Set(['unstaked', 'listed']);
const TOKEN_ID_REGEX = /^\d{1,10}$/;

// Lo que propuso el dueño. Arranca apagado: se prende desde el admin cuando
// este todo listo, y apagarlo solo frena los entrenamientos nuevos.
const DEFAULT_CONFIG = {
    enabled: false,
    dailyRate: 30,
    periods: [
        { days: 7, bonus: 0 },
        { days: 14, bonus: 10 },
        { days: 30, bonus: 30 },
        { days: 90, bonus: 60 }
    ],
    // Desde cuantos Primals en staking a la vez (`min`) se suma `bonus` % a
    // cada uno. Se suma al bonus de la region, no se multiplica.
    quantityTiers: [
        { min: 1, bonus: 0 },
        { min: 2, bonus: 5 },
        { min: 5, bonus: 10 },
        { min: 10, bonus: 15 },
        { min: 20, bonus: 20 }
    ],
    catalog: [
        { id: 'lowkey', label: 'LOWKEY', description: 'NFT drop on ApeChain, floor 1-30 APE', price: 50000, enabled: true },
        { id: 'highkey', label: 'HIGHKEY', description: 'NFT drop on ApeChain, floor 30-90 APE', price: 500000, enabled: true },
        { id: 'fogkey', label: 'FOGKEY', description: 'NFT drop on ApeChain, floor 90-200 APE', price: 1000000, enabled: true },
        { id: 'raffle-ticket', label: 'Raffle ticket', description: 'One entry to a Primal raffle', price: 5000, enabled: true },
        { id: 'forge-roll', label: 'Reroll ticket', description: 'One roll in the Forge', price: 20000, enabled: true },
        { id: 'summon-shard', label: 'Summon shard', description: 'Win a Primal from the vault', price: 500000, enabled: true },
        // Los APE salen de la wallet del proyecto: arrancan sin stock y no se
        // venden hasta que el admin carga cuantos hay para dar.
        { id: 'ape-10', label: '10 APE', description: 'Sent to your wallet', price: 100000, enabled: true, stock: 0 },
        { id: 'ape-50', label: '50 APE', description: 'Sent to your wallet', price: 500000, enabled: true, stock: 0 },
        { id: 'ape-100', label: '100 APE', description: 'Sent to your wallet', price: 1000000, enabled: true, stock: 0 }
    ]
};

// Los premios que se entregan solos al canjear. El resto del catalogo se
// muestra pero todavia no se puede canjear: hay que mandar APE o NFTs reales,
// o depende de algo que no existe todavia (raffles, el firmante del contrato).
// `grant` recibe la wallet y un id unico del canje.
// Las keys y el Summon shard son ruletas (lib/stakingWheels.js): `grant`
// sortea el premio y devuelve el FOG que hay que acreditar ya, si toco FOG.
// Los APE quedan como entrega pendiente, igual que un premio de ruleta: el
// admin los manda y los marca como enviados.
const wheels = require('./stakingWheels');
const APE_ITEMS = { 'ape-10': 10, 'ape-50': 50, 'ape-100': 100 };
const GRANTS = {
    'forge-roll': {
        available: () => Boolean(require('./forgePayments').paymentConfig()),
        grant: (wallet, redemptionId) => require('./forgeStore').addFogCredit(wallet, redemptionId)
    },
    ...Object.fromEntries(wheels.WHEEL_ITEMS.map(id => [id, {
        available: () => wheels.isAvailable(id),
        // Tiene premios cargados aunque hoy esten todos agotados: "Sold out",
        // no "Soon".
        configured: () => wheels.hasPrizes(id),
        grant: (wallet, redemptionId) => wheels.spin(wallet, id, redemptionId)
    }])),
    ...Object.fromEntries(Object.entries(APE_ITEMS).map(([id, amount]) => [id, {
        available: () => true,
        grant: (wallet, redemptionId, item) => ({
            delivery: wheels.addDelivery(wallet, id, { kind: 'ape', amount, label: item.label }, redemptionId)
        })
    }]))
};

// Como se ve cada premio en la tienda: 'available', 'sold-out' (no queda
// stock, o la ruleta se quedo sin premios) o 'soon' (todavia no se puede).
function statusOf(item) {
    if (item.stock === 0) return 'sold-out';
    const grant = GRANTS[item.id];
    if (!grant) return 'soon';
    if (grant.available()) return 'available';
    return grant.configured?.() ? 'sold-out' : 'soon';
}

// --- Lecturas en memoria ----------------------------------------------------
//
// El historial y la cuenta de Primals en staking por wallet se usan en casi
// todos los pedidos (/config, /me, el ranking). Con miles de entrenamientos,
// leerlos y recalcularlos tardaba 20-40 ms por pedido, con el server frenado
// mientras tanto. Quedan en memoria hasta que cambia algun archivo: cada
// escritura de este modulo suma a `generacion`, y la firma del archivo
// (fecha y tamaño) cubre lo que se escriba por afuera (los tests, a mano).
let generacion = 0;

function firma(file) {
    try {
        const st = fs.statSync(file);
        return `${st.mtimeMs}:${st.size}`;
    } catch {
        return '-';
    }
}

function claveDe(...files) {
    return `${generacion}|${files.map(firma).join('|')}`;
}

function guardar(file, data) {
    writeJson(file, data);
    generacion++;
}

function appendHistory(entry) {
    appendJsonLine(HISTORY_PATH, entry);
    generacion++;
}

// Nadie modifica el arreglo que devuelve: se comparte entre pedidos.
let historial = { clave: null, datos: [] };
function readHistory() {
    const clave = claveDe(HISTORY_PATH);
    if (clave !== historial.clave) historial = { clave, datos: readJsonLines(HISTORY_PATH, 'staking') };
    return historial.datos;
}

// stakingCounter() de los archivos como estan ahora.
let contadorMemo = { clave: null, cuenta: null };
function contador() {
    const clave = claveDe(HISTORY_PATH, ACTIVE_PATH);
    if (clave !== contadorMemo.clave) contadorMemo = { clave, cuenta: stakingCounter(readHistory(), activosLectura()) };
    return contadorMemo.cuenta;
}

// Los entrenamientos en curso, para leer sin modificar: el objeto se comparte
// entre pedidos. Lo que escribe (poner a entrenar, el chequeo, el unstake) usa
// readActive(), que da una copia propia.
let activosMemo = { clave: null, datos: {} };
function activosLectura() {
    const clave = claveDe(ACTIVE_PATH);
    if (clave !== activosMemo.clave) activosMemo = { clave, datos: readActive() };
    return activosMemo.datos;
}

// Lo que depende ademas de la hora (que periodos ya terminaron, las rachas)
// se recalcula como mucho cada TTL_PUBLICO_MS aunque no cambie nada.
const TTL_PUBLICO_MS = 30 * 1000;
function conTtl() {
    let memo = { clave: null, hasta: 0, valor: null };
    return (clave, calcular) => {
        const ahora = Date.now();
        if (clave !== memo.clave || ahora >= memo.hasta) memo = { clave, hasta: ahora + TTL_PUBLICO_MS, valor: calcular() };
        return memo.valor;
    };
}
const rankingMemo = conTtl();
const totalesMemo = conTtl();
const mapaMemo = conTtl();

// --- Configuracion ---------------------------------------------------------

// Descripciones que tenian los premios por defecto y quedaron mal. Guardar la
// config desde el admin guarda el catalogo entero, con estas incluidas: si la
// guardada es una de estas, se usa la de DEFAULT_CONFIG. Una que alguien
// escribio a mano no se toca.
const DESCRIPCIONES_VIEJAS = {
    // No acuña nada: sortea Primals que ya tiene el vault (Trout, 2026-10-16).
    'summon-shard': ['Summon a new Primal']
};

function sinTextosViejos(item) {
    if (!item || !DESCRIPCIONES_VIEJAS[item.id]?.includes(item.description)) return item;
    const { description, ...resto } = item;
    return resto;
}

// Lo guardado encima de los valores por defecto. Un premio nuevo en
// DEFAULT_CONFIG aparece aunque el archivo sea de antes. Los borrados desde el
// admin quedan en `removed`: si solo se sacaran del archivo, el de
// DEFAULT_CONFIG volveria a aparecer. `order` es el orden que se eligio en el
// admin; lo que no esta ahi (un premio nuevo) va al final.
function getConfig() {
    const saved = readJson(CONFIG_PATH, {});
    const savedItems = new Map((saved.catalog || []).map(item => [item.id, item]));
    const removed = saved.removed || [];
    const order = saved.order || [];
    const posicion = id => (order.includes(id) ? order.indexOf(id) : order.length);
    return {
        enabled: saved.enabled ?? DEFAULT_CONFIG.enabled,
        dailyRate: saved.dailyRate ?? DEFAULT_CONFIG.dailyRate,
        periods: saved.periods ?? DEFAULT_CONFIG.periods,
        quantityTiers: saved.quantityTiers ?? DEFAULT_CONFIG.quantityTiers,
        catalog: DEFAULT_CONFIG.catalog
            .filter(item => !removed.includes(item.id))
            .map(item => ({ ...item, ...sinTextosViejos(savedItems.get(item.id)) }))
            // sort es estable: los que no estan en `order` quedan en su orden de siempre.
            .sort((a, b) => posicion(a.id) - posicion(b.id)),
        removed,
        order
    };
}

// Devuelve { config } o { error }. Se valida todo antes de escribir nada.
function updateConfig(changes = {}) {
    const config = getConfig();

    if ('enabled' in changes) config.enabled = Boolean(changes.enabled);

    if ('dailyRate' in changes) {
        const rate = intEntre(changes.dailyRate, 0, 1000000);
        if (rate === null) return { error: 'FOG per day must be a whole number between 0 and 1,000,000.' };
        config.dailyRate = rate;
    }

    if ('periods' in changes) {
        if (!Array.isArray(changes.periods) || changes.periods.length === 0 || changes.periods.length > 8) {
            return { error: 'There must be between 1 and 8 periods.' };
        }
        const periods = [];
        for (const p of changes.periods) {
            const days = intEntre(p?.days, 1, 365);
            const bonus = intEntre(p?.bonus, 0, 1000);
            if (days === null) return { error: 'Each period must last between 1 and 365 days.' };
            if (bonus === null) return { error: 'Each bonus must be a whole percentage between 0 and 1000.' };
            if (periods.some(x => x.days === days)) return { error: `There are two ${days}-day periods.` };
            periods.push({ days, bonus });
        }
        config.periods = periods.sort((a, b) => a.days - b.days);
    }

    if ('quantityTiers' in changes) {
        if (!Array.isArray(changes.quantityTiers) || changes.quantityTiers.length > 10) {
            return { error: 'There can be up to 10 quantity tiers.' };
        }
        const tiers = [];
        for (const t of changes.quantityTiers) {
            const min = intEntre(t?.min, 1, 10000);
            const bonus = intEntre(t?.bonus, 0, 1000);
            if (min === null) return { error: 'Each tier starts at a whole number of Primals, 1 or more.' };
            if (bonus === null) return { error: 'Each tier bonus must be a whole percentage between 0 and 1000.' };
            if (tiers.some(x => x.min === min)) return { error: `There are two tiers starting at ${min} Primals.` };
            tiers.push({ min, bonus });
        }
        config.quantityTiers = tiers.sort((a, b) => a.min - b.min);
    }

    if ('catalog' in changes) {
        if (!Array.isArray(changes.catalog)) return { error: 'Invalid catalog.' };
        for (const change of changes.catalog) {
            const item = config.catalog.find(i => i.id === change?.id);
            if (!item) return { error: `Unknown reward: ${change?.id}.` };
            if ('price' in change) {
                const price = intEntre(change.price, 1, 1000000000);
                if (price === null) return { error: `The price of ${item.label} must be a whole number of FOG.` };
                item.price = price;
            }
            if ('label' in change) {
                const label = String(change.label || '').trim().slice(0, 40);
                if (!label) return { error: 'A reward needs a name.' };
                item.label = label;
            }
            if ('description' in change) item.description = String(change.description || '').trim().slice(0, 120);
            if ('enabled' in change) item.enabled = Boolean(change.enabled);
            // Cuantos quedan para vender; vacio es sin limite.
            if ('stock' in change) {
                if (change.stock === null || change.stock === '') item.stock = null;
                else {
                    const stock = intEntre(change.stock, 0, 1000000);
                    if (stock === null) return { error: `The stock of ${item.label} must be a whole number, or empty for unlimited.` };
                    item.stock = stock;
                }
            }
        }
    }

    if ('order' in changes) {
        const ids = config.catalog.map(i => i.id);
        const order = Array.isArray(changes.order) ? changes.order.map(String) : null;
        if (!order || order.length !== ids.length || new Set(order).size !== ids.length
            || !order.every(id => ids.includes(id))) {
            return { error: 'The order must list every reward once.' };
        }
        config.order = order;
        config.catalog.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }

    // Borrar un premio lo saca del catalogo y del panel. Los canjes que ya se
    // hicieron quedan en el historial con su nombre y su precio.
    if ('removeCatalog' in changes) {
        const id = String(changes.removeCatalog);
        if (!config.catalog.some(i => i.id === id)) return { error: `Unknown reward: ${id}.` };
        borrarIcono(config.catalog.find(i => i.id === id).icon);
        config.catalog = config.catalog.filter(i => i.id !== id);
        config.removed = [...config.removed, id];
        config.order = config.order.filter(x => x !== id);
    }

    guardar(CONFIG_PATH, config);
    appendHistory({ event: 'config', config });
    return { config };
}

// --- Iconos de los premios -------------------------------------------------

function borrarIcono(file) {
    if (!file || !ICON_FILE_REGEX.test(file)) return;
    fs.rm(path.join(ICONS_DIR, file), { force: true }, () => {});
}

// La ruta de un icono subido, o null si el nombre no es uno de los nuestros.
function iconPath(file) {
    return ICON_FILE_REGEX.test(String(file)) ? path.join(ICONS_DIR, file) : null;
}

// Pasa la imagen a WebP de 256 px como maximo (un GIF animado sigue animado) y
// la deja como icono del premio. Devuelve { config } o { error, status }.
async function setCatalogIcon(id, buffer) {
    if (!getConfig().catalog.some(i => i.id === id)) return { error: `Unknown reward: ${id}.`, status: 404 };
    let webp;
    try {
        webp = await require('sharp')(buffer, { animated: true })
            .resize(ICON_SIZE, ICON_SIZE, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 88 })
            .toBuffer();
    } catch {
        return { error: "That file isn't an image we can read.", status: 400 };
    }
    // Lo que sigue es sincronico: leer, cambiar y escribir sin un await en el
    // medio, como el resto del store.
    const config = getConfig();
    const item = config.catalog.find(i => i.id === id);
    if (!item) return { error: `Unknown reward: ${id}.`, status: 404 };
    const file = `${id}-${Date.now()}.webp`;
    fs.mkdirSync(ICONS_DIR, { recursive: true });
    writeAtomic(path.join(ICONS_DIR, file), webp);
    const anterior = item.icon;
    item.icon = file;
    guardar(CONFIG_PATH, config);
    borrarIcono(anterior);
    appendHistory({ event: 'icon', id, icon: file });
    return { config };
}

// Vuelve al icono que viene con el sitio.
function clearCatalogIcon(id) {
    const config = getConfig();
    const item = config.catalog.find(i => i.id === id);
    if (!item) return { error: `Unknown reward: ${id}.`, status: 404 };
    const anterior = item.icon;
    delete item.icon;
    guardar(CONFIG_PATH, config);
    borrarIcono(anterior);
    appendHistory({ event: 'icon', id, icon: null });
    return { config };
}

// FOG por dia de un periodo, en entero: los bonus son porcentajes enteros, asi
// que la cuenta es exacta y no aparecen decimales en el saldo.
function perDayFor(config, days) {
    const period = config.periods.find(p => p.days === days);
    if (!period) return null;
    return { bonus: period.bonus, perDay: Math.floor(config.dailyRate * (100 + period.bonus) / 100) };
}

// Lo que ve cualquiera: la tasa, los periodos y el catalogo con lo que ya se
// puede canjear.
function publicConfig() {
    const config = getConfig();
    // Cuantos Primals estan entrenando en cada periodo: el mapa de /staking lo
    // muestra en cada zona.
    const now = Date.now();
    const active = activosLectura();
    const training = {};
    for (const stake of Object.values(active)) {
        if (!isFinished(stake, now)) training[stake.days] = (training[stake.days] ?? 0) + 1;
    }
    return {
        enabled: config.enabled,
        dailyRate: config.dailyRate,
        quantityTiers: config.quantityTiers,
        periods: config.periods.map(p => ({
            ...p,
            perDay: perDayFor(config, p.days).perDay,
            training: training[p.days] ?? 0
        })),
        catalog: config.catalog
            .filter(item => item.enabled)
            .map(item => {
                const status = statusOf(item);
                return { ...item, status, redeemable: status === 'available', wheel: wheels.WHEEL_ITEMS.includes(item.id) };
            }),
        totals: globalTotals(active, now),
        // Para el % de la coleccion en staking (ver collectionSupply.js).
        collectionSize: require('./collectionSupply').conocido(),
        badges: BADGES,
        graceDays: GRACE_MS / DAY_MS
    };
}

// Que Primals estan entrenando en cada periodo, del que empezo primero al
// ultimo: el mapa de /staking los dibuja dispersos en su region, y con ese
// orden uno que recien entra no mueve de lugar a los que ya estaban.
function trainingByPeriod() {
    return mapaMemo(claveDe(ACTIVE_PATH), () => {
        const now = Date.now();
        const periods = {};
        const activos = Object.entries(activosLectura())
            .filter(([, stake]) => !isFinished(stake, now))
            // Las fechas son ISO: ordenarlas como texto es ordenarlas en el tiempo.
            .sort(([, a], [, b]) => (a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0));
        for (const [tokenId, stake] of activos) (periods[stake.days] ??= []).push(tokenId);
        return periods;
    });
}

// --- Entrenamientos --------------------------------------------------------

function readActive() {
    return readJson(ACTIVE_PATH, {});
}

function readWallets() {
    return readJson(WALLETS_PATH, {});
}

// Dias completos que ya se pueden acreditar: hasta el final del periodo o hasta
// la ultima verificacion, lo que pase antes.
function creditedDays(stake) {
    const until = Math.min(Date.parse(stake.endsAt), Date.parse(stake.verifiedAt));
    return Math.max(0, Math.floor((until - Date.parse(stake.startAt)) / DAY_MS));
}

// El bonus del escalon que le toca a `count` Primals en staking a la vez.
function tierBonus(tiers = [], count) {
    let bonus = 0;
    for (const t of tiers) if (count >= t.min) bonus = t.bonus;
    return bonus;
}

// Cuantos Primals tenia cada wallet en staking en cada momento, para el bonus
// por cantidad. Sale del historial (los que ya cerraron, hasta donde se sabe
// que estuvieron) y de los activos (hasta el final de su periodo: si se vendio
// uno, el chequeo lo cierra en minutos y pasa al historial con su fecha).
// Devuelve cuenta(wallet, t).
function stakingCounter(history = readHistory(), active = activosLectura()) {
    const porWallet = {};
    const add = (wallet, start, end) => {
        if (!(end > start)) return;
        const w = (porWallet[wallet] ??= { starts: [], ends: [] });
        w.starts.push(start);
        w.ends.push(end);
    };
    for (const h of history) {
        if (h.event !== 'end') continue;
        const end = h.reason === 'completed' ? Date.parse(h.endsAt)
            : h.reason === 'unstaked' ? Date.parse(h.at)
                : Date.parse(h.verifiedAt);
        add(h.wallet, Date.parse(h.startAt), Math.min(end, Date.parse(h.endsAt)));
    }
    for (const st of Object.values(active)) add(st.wallet, Date.parse(st.startAt), Date.parse(st.endsAt));
    for (const w of Object.values(porWallet)) {
        w.starts.sort((a, b) => a - b);
        w.ends.sort((a, b) => a - b);
    }
    // Cuantos valores de la lista ordenada son <= t (o < t).
    const hasta = (list, t, incluido) => {
        let lo = 0;
        let hi = list.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (incluido ? list[mid] <= t : list[mid] < t) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    };
    return (wallet, t) => {
        const w = porWallet[wallet];
        return w ? hasta(w.starts, t, true) - hasta(w.ends, t, false) : 0;
    };
}

// El FOG ganado por un entrenamiento. Cada dia completo paga la tasa base mas
// el bonus de la region mas el del escalon por cantidad de ese dia (cuantos
// Primals tenia la wallet en staking al cerrar ese dia). Los entrenamientos de
// antes de los escalones no los tienen y pagan siempre `perDay`.
function creditedFog(stake, cuenta) {
    const days = creditedDays(stake);
    if (!stake.tiers?.length) return days * stake.perDay;
    cuenta ??= contador();
    const start = Date.parse(stake.startAt);
    const base = baseRateOf(stake);
    let total = 0;
    for (let i = 1; i <= days; i++) {
        const n = cuenta(stake.wallet, start + i * DAY_MS);
        total += Math.floor(base * (100 + stake.bonus + tierBonus(stake.tiers, n)) / 100);
    }
    return total;
}

// El FOG por dia sin el bonus de la region. Los entrenamientos de antes de
// guardar `baseRate` lo sacan de perDay y el bonus.
function baseRateOf(stake) {
    return stake.baseRate ?? Math.floor(stake.perDay * 100 / (100 + stake.bonus));
}

function balanceOf(wallet, active = activosLectura(), wallets = readWallets(), cuenta = contador()) {
    const key = wallet.toLowerCase();
    const totals = wallets[key] || { earned: 0, spent: 0 };
    const running = Object.values(active)
        .filter(s => s.wallet === key)
        .reduce((sum, s) => sum + creditedFog(s, cuenta), 0);
    return { earned: totals.earned + running, spent: totals.spent, balance: totals.earned + running - totals.spent };
}

// Cierra un entrenamiento: su FOG pasa a la wallet y sale de los activos.
// `reason`: 'completed', 'transferred', 'listed' o 'unstaked'. Sacarlo o
// listarlo antes de que termine el periodo paga solo el FOG base (sin el bonus
// de la region ni el de cantidad). Devuelve lo que se acredito. Muta `active`
// y `wallets`; quien llama escribe. `cuenta` es el de stakingCounter, armado
// antes de empezar a cerrar.
function finish(active, wallets, tokenId, reason, now = Date.now(), cuenta = contador()) {
    const stake = active[tokenId];
    const full = creditedFog(stake, cuenta);
    const earned = LOSES_BONUS.has(reason) && !isFinished(stake, now)
        ? creditedDays(stake) * baseRateOf(stake)
        : full;
    const totals = wallets[stake.wallet] || { earned: 0, spent: 0 };
    wallets[stake.wallet] = { ...totals, earned: totals.earned + earned };
    delete active[tokenId];
    appendHistory({ event: 'end', reason, tokenId, wallet: stake.wallet, days: stake.days,
        startAt: stake.startAt, endsAt: stake.endsAt, verifiedAt: stake.verifiedAt, earned,
        bonusLost: full - earned });
    return { earned, bonusLost: full - earned };
}

function isFinished(stake, now) {
    return Date.parse(stake.endsAt) <= now;
}

/**
 * Pone a entrenar los Primals de `wallet`. Quien llama ya verifico en la
 * cadena que la wallet es la dueña de `ownedIds` y que no los tiene listados
 * en `listedIds`, todo justo antes de llamar.
 *
 * Devuelve { started: [stake], rejected: [{ tokenId, reason }] } o { error }.
 */
function startStakes(wallet, tokenIds, days, { ownedIds, listedIds = new Set() }) {
    const config = getConfig();
    if (!config.enabled) return { error: 'Staking is closed right now.', reason: 'closed' };
    const rate = perDayFor(config, Number(days));
    if (!rate) return { error: 'That staking period does not exist.', reason: 'invalid-period' };

    const key = wallet.toLowerCase();
    const now = Date.now();
    const active = readActive();
    const wallets = readWallets();
    const cuenta = contador();
    const started = [];
    const rejected = [];

    for (const tokenId of tokenIds) {
        const current = active[tokenId];
        if (!ownedIds.has(tokenId)) { rejected.push({ tokenId, reason: 'not-owner' }); continue; }
        if (listedIds.has(tokenId)) { rejected.push({ tokenId, reason: 'listed' }); continue; }
        if (current) {
            if (current.wallet === key && !isFinished(current, now)) {
                rejected.push({ tokenId, reason: 'already-training' });
                continue;
            }
            // Un entrenamiento que ya termino y el chequeo periodico todavia no
            // cerro, o uno de un dueño anterior que todavia no se detecto. La
            // propiedad se acaba de verificar, asi que se cierra ahora.
            if (current.wallet === key) current.verifiedAt = new Date(now).toISOString();
            finish(active, wallets, tokenId, current.wallet === key ? 'completed' : 'transferred', now, cuenta);
        }

        const stake = {
            tokenId,
            wallet: key,
            days: Number(days),
            bonus: rate.bonus,
            perDay: rate.perDay,
            baseRate: config.dailyRate,
            tiers: config.quantityTiers,
            startAt: new Date(now).toISOString(),
            endsAt: new Date(now + Number(days) * DAY_MS).toISOString(),
            verifiedAt: new Date(now).toISOString()
        };
        active[tokenId] = stake;
        started.push(stake);
        appendHistory({ event: 'start', ...stake });
    }

    guardar(ACTIVE_PATH, active);
    guardar(WALLETS_PATH, wallets);
    return { started, rejected };
}

/**
 * El chequeo periodico. `owners` es un Map tokenId -> dueño en minusculas,
 * leido de la cadena; `listings` un Map tokenId -> Set de wallets que lo
 * listaron, o null si no se pudo preguntar. `checkedAt` es el momento en que
 * se empezo a preguntar.
 *
 * Si no se sabe si estan listados, no se adelanta `verifiedAt` de nadie: los
 * dias quedan esperando al proximo chequeo, que los acredita todos juntos.
 * Devuelve cuantos se cerraron por cada motivo.
 */
function applyVerification({ owners, listings, checkedAt }) {
    const active = readActive();
    const wallets = readWallets();
    const ended = { completed: 0, transferred: 0, listed: 0 };
    const at = new Date(checkedAt).toISOString();
    const cuenta = contador();

    for (const [tokenId, stake] of Object.entries(active)) {
        // Empezo despues de que arranco el chequeo: lo leido no le aplica.
        if (Date.parse(stake.startAt) >= checkedAt || !owners.has(tokenId)) continue;
        // Sin dueño es que ese ownerOf fallo (el multicall deja fallar uno
        // solo): no es una venta. Queda para el proximo chequeo, como cuando
        // se cae la cadena entera. Antes contaba como "transferred" y sacaba
        // del entrenamiento Primals que nadie habia vendido.
        const owner = owners.get(tokenId);
        if (!owner) continue;

        if (owner !== stake.wallet) {
            finish(active, wallets, tokenId, 'transferred', checkedAt, cuenta);
            ended.transferred++;
        } else if (listings?.get(tokenId)?.has(stake.wallet)) {
            finish(active, wallets, tokenId, 'listed', checkedAt, cuenta);
            ended.listed++;
        } else if (listings) {
            if (Date.parse(stake.verifiedAt) < checkedAt) stake.verifiedAt = at;
            if (Date.parse(stake.verifiedAt) >= Date.parse(stake.endsAt)) {
                finish(active, wallets, tokenId, 'completed', checkedAt, cuenta);
                ended.completed++;
            }
        }
    }

    guardar(ACTIVE_PATH, active);
    guardar(WALLETS_PATH, wallets);
    return ended;
}

/**
 * Saca Primals del staking antes de tiempo. Quien llama ya pregunto a la
 * cadena: `ownedIds` son los que siguen en la wallet (sus dias se acreditan
 * hasta ahora); si la cadena no contesto, `ownedIds` es null y se acreditan
 * solo los dias ya verificados. Los que ya no son de la wallet los cierra el
 * chequeo periodico como vendidos.
 *
 * Devuelve { unstaked: [{ tokenId, earned, bonusLost }], rejected }.
 */
function unstake(wallet, tokenIds, { ownedIds }) {
    const key = wallet.toLowerCase();
    const now = Date.now();
    const active = readActive();
    const wallets = readWallets();
    const cuenta = contador();
    const unstaked = [];
    const rejected = [];

    for (const tokenId of tokenIds) {
        const stake = active[tokenId];
        if (!stake || stake.wallet !== key) { rejected.push({ tokenId, reason: 'not-staking' }); continue; }
        if (isFinished(stake, now)) { rejected.push({ tokenId, reason: 'already-finished' }); continue; }
        if (ownedIds && !ownedIds.has(tokenId)) { rejected.push({ tokenId, reason: 'not-owner' }); continue; }
        if (ownedIds) stake.verifiedAt = new Date(now).toISOString();
        unstaked.push({ tokenId, ...finish(active, wallets, tokenId, 'unstaked', now, cuenta) });
    }

    guardar(ACTIVE_PATH, active);
    guardar(WALLETS_PATH, wallets);
    return { unstaked, rejected };
}

// --- Insignias -------------------------------------------------------------

// Los tramos en que cada wallet tuvo al menos un Primal en staking, con los
// huecos de hasta GRACE_MS unidos. Sale del historial y de los activos: no
// hay estado propio que se pueda desincronizar.
function streaksByWallet(history = readHistory(), active = activosLectura(), now = Date.now()) {
    const intervals = {};
    const add = (wallet, start, end) => {
        if (end > start) (intervals[wallet] ??= []).push([start, end]);
    };
    for (const h of history) {
        if (h.event !== 'end') continue;
        // Hasta cuando se sabe que estuvo: el final del periodo si lo termino,
        // el momento en que lo saco, o la ultima verificacion buena.
        const end = h.reason === 'completed' ? Date.parse(h.endsAt)
            : h.reason === 'unstaked' ? Date.parse(h.at)
                : Date.parse(h.verifiedAt);
        add(h.wallet, Date.parse(h.startAt), Math.min(end, Date.parse(h.endsAt)));
    }
    for (const s of Object.values(active)) {
        add(s.wallet, Date.parse(s.startAt), Math.min(now, Date.parse(s.endsAt)));
    }

    const result = {};
    for (const [wallet, list] of Object.entries(intervals)) {
        list.sort((a, b) => a[0] - b[0]);
        const tramos = [];
        for (const [start, end] of list) {
            const last = tramos[tramos.length - 1];
            if (last && start - last[1] <= GRACE_MS) last[1] = Math.max(last[1], end);
            else tramos.push([start, end]);
        }
        result[wallet] = tramos;
    }
    return result;
}

// Las insignias ganadas (90, 180, 365) y la racha actual de una wallet.
// `streakDays` es 0 si ya paso el periodo de gracia; `graceUntil` dice hasta
// cuando puede volver a stakear sin cortar la racha (null si tiene uno
// corriendo o si ya no tiene racha).
function badgesOf(tramos = [], now = Date.now()) {
    const largos = tramos.map(([start, end]) => Math.floor((end - start) / DAY_MS));
    const earned = BADGES.filter(b => largos.some(d => d >= b));
    const last = tramos[tramos.length - 1];
    const viva = Boolean(last) && now - last[1] <= GRACE_MS;
    const streakDays = viva ? largos[largos.length - 1] : 0;
    return {
        earned,
        streakDays,
        next: BADGES.find(b => b > streakDays) ?? null,
        graceUntil: viva && last[1] < now - 60 * 1000
            ? new Date(last[1] + GRACE_MS).toISOString()
            : null
    };
}

function publicStake(stake, now = Date.now(), cuenta) {
    const days = creditedDays(stake);
    return {
        tokenId: stake.tokenId,
        days: stake.days,
        bonus: stake.bonus,
        perDay: stake.perDay,
        baseRate: baseRateOf(stake),
        startAt: stake.startAt,
        endsAt: stake.endsAt,
        creditedDays: days,
        earned: creditedFog(stake, cuenta),
        finished: isFinished(stake, now)
    };
}

// El saldo y los Primals entrenando de una wallet, los que terminaron su
// periodo y se pueden volver a mandar (`restake`: de los ultimos 30 dias, con
// el periodo que hicieron) y las insignias.
function walletSummary(wallet) {
    const key = wallet.toLowerCase();
    const now = Date.now();
    const active = activosLectura();
    const history = readHistory();
    const cuenta = contador();
    const totals = balanceOf(key, active, readWallets(), cuenta);
    const stakes = Object.values(active)
        .filter(s => s.wallet === key)
        .map(s => publicStake(s, now, cuenta))
        .sort((a, b) => Number(a.tokenId) - Number(b.tokenId));
    // Los que tiene en staking ahora y el escalon que les toca (con los
    // escalones de hoy: los entrenamientos viejos usan los suyos).
    const count = stakes.filter(s => !s.finished).length;

    // Los cerrados por el chequeo salen del historial (si no volvieron a
    // entrenar); los terminados que el chequeo todavia no cerro siguen en
    // `stakes` con `finished: true`.
    const restake = new Map();
    for (const h of history) {
        if (h.event !== 'end' || h.reason !== 'completed' || h.wallet !== key) continue;
        if (now - Date.parse(h.endsAt) > 30 * DAY_MS || active[h.tokenId]) continue;
        restake.set(h.tokenId, { tokenId: h.tokenId, days: h.days, endedAt: h.endsAt });
    }
    for (const s of stakes) {
        if (s.finished) restake.set(s.tokenId, { tokenId: s.tokenId, days: s.days, endedAt: s.endsAt });
    }

    return {
        ...totals,
        stakes,
        restake: [...restake.values()].sort((a, b) => Number(a.tokenId) - Number(b.tokenId)),
        badges: badgesOf(streaksByWallet(history, active, now)[key], now),
        quantity: { count, bonus: tierBonus(getConfig().quantityTiers, count) },
        prizes: wheels.winsOf(key)
    };
}

// Lo publico de cada wallet para el ranking de /stats: el saldo de FOG y las
// insignias ganadas. Solo las wallets que alguna vez stakearon.
function leaderboard() {
    return rankingMemo(claveDe(ACTIVE_PATH, WALLETS_PATH, HISTORY_PATH), () => {
        const now = Date.now();
        const active = activosLectura();
        const wallets = readWallets();
        const streaks = streaksByWallet(readHistory(), active, now);
        const cuenta = contador();
        // Lo que va sumando cada wallet con sus entrenamientos en curso.
        const enCurso = {};
        for (const stake of Object.values(active)) {
            enCurso[stake.wallet] = (enCurso[stake.wallet] ?? 0) + creditedFog(stake, cuenta);
        }
        const all = new Set([...Object.keys(wallets), ...Object.keys(enCurso)]);
        const result = {};
        for (const w of all) {
            const totals = wallets[w] || { earned: 0, spent: 0 };
            result[w] = {
                balance: totals.earned + (enCurso[w] ?? 0) - totals.spent,
                badges: badgesOf(streaks[w], now).earned
            };
        }
        return result;
    });
}

// Los numeros globales de /staking: Primals en staking ahora y FOG ganado en
// total, contando lo que van sumando los entrenamientos en curso.
function globalTotals(active, now) {
    return totalesMemo(claveDe(ACTIVE_PATH, WALLETS_PATH, HISTORY_PATH), () => {
        const enCurso = Object.values(active);
        const cuenta = contador();
        return {
            staking: enCurso.filter(s => !isFinished(s, now)).length,
            earned: Object.values(readWallets()).reduce((n, w) => n + w.earned, 0)
                + enCurso.reduce((n, s) => n + creditedFog(s, cuenta), 0)
        };
    });
}

// --- Canjes ----------------------------------------------------------------

// Devuelve { redemption, balance } o { error, reason, status }.
function redeem(wallet, itemId) {
    const key = wallet.toLowerCase();
    const config = getConfig();
    const item = config.catalog.find(i => i.id === itemId && i.enabled);
    if (!item) return { error: 'That reward does not exist.', reason: 'invalid', status: 404 };
    const grant = GRANTS[item.id];
    if (item.stock === 0) return { error: `${item.label} is sold out.`, reason: 'sold-out', status: 409 };
    if (!grant || !grant.available()) {
        return { error: `${item.label} can't be redeemed yet.`, reason: 'not-redeemable', status: 409 };
    }

    const active = activosLectura();
    const wallets = readWallets();
    const { balance } = balanceOf(key, active, wallets);
    if (balance < item.price) {
        return { error: `You need ${item.price} FOG and have ${balance}.`, reason: 'insufficient', status: 402 };
    }

    // Primero el premio: si falla, no se descuenta nada.
    const redemption = {
        id: crypto.randomUUID(),
        wallet: key,
        item: item.id,
        label: item.label,
        price: item.price,
        at: new Date().toISOString()
    };
    const granted = grant.grant(key, redemption.id, item);
    if (granted?.error) return { error: granted.error, reason: 'sold-out', status: 409 };
    // Uno menos en stock (si tiene limite).
    if (Number.isInteger(item.stock)) {
        item.stock -= 1;
        guardar(CONFIG_PATH, config);
    }
    // Una ruleta que dio FOG: se acredita junto con el cobro de la key.
    const fog = granted?.fog ?? 0;

    const totals = wallets[key] || { earned: 0, spent: 0 };
    wallets[key] = { ...totals, earned: totals.earned + fog, spent: totals.spent + item.price };
    guardar(WALLETS_PATH, wallets);
    appendHistory({ event: 'redeem', ...redemption, ...(granted?.win ? { prize: granted.win.prize, fog } : {}) });

    return { redemption, balance: balance - item.price + fog,
        ...(granted?.win ? { win: granted.win } : {}),
        ...(granted?.delivery ? { delivery: granted.delivery } : {}) };
}

// --- Premios de afuera de la tienda (codigos promocionales) -----------------

// Suma FOG a una wallet sin staking de por medio. `reason` queda en el
// historial (por ejemplo "promo:DISCORD5K").
function grantFog(wallet, amount, reason) {
    const key = wallet.toLowerCase();
    const wallets = readWallets();
    const totals = wallets[key] || { earned: 0, spent: 0 };
    wallets[key] = { ...totals, earned: totals.earned + amount };
    guardar(WALLETS_PATH, wallets);
    appendHistory({ event: 'grant', wallet: key, fog: amount, reason });
    return { fog: amount };
}

// Una apertura gratis de una ruleta. Devuelve { win, item } o { error } si no
// queda nada para ganar.
function spinWheel(wallet, itemId, reason) {
    const key = wallet.toLowerCase();
    if (!wheels.isAvailable(itemId)) return { error: 'That reward is sold out right now.' };
    const result = wheels.spin(key, itemId, crypto.randomUUID());
    if (result.error) return result;
    if (result.fog) grantFog(key, result.fog, `${reason}:${itemId}`);
    else appendHistory({ event: 'grant', wallet: key, prize: result.win.prize, reason: `${reason}:${itemId}` });
    const item = getConfig().catalog.find(i => i.id === itemId);
    return { win: result.win, item: { id: itemId, label: item?.label ?? itemId, icon: item?.icon } };
}

// --- Admin -----------------------------------------------------------------

function adminSummary() {
    const active = activosLectura();
    const wallets = readWallets();
    const history = readHistory();
    const cuenta = contador();
    const stakers = new Set(Object.values(active).map(s => s.wallet));
    const all = new Set([...stakers, ...Object.keys(wallets)]);
    const balances = [...all].map(w => ({ wallet: w, ...balanceOf(w, active, wallets, cuenta),
        training: Object.values(active).filter(s => s.wallet === w).length }));

    return {
        config: getConfig(),
        training: Object.keys(active).length,
        wallets: stakers.size,
        totals: {
            earned: balances.reduce((s, b) => s + b.earned, 0),
            spent: balances.reduce((s, b) => s + b.spent, 0)
        },
        topWallets: balances.sort((a, b) => b.balance - a.balance).slice(0, 50),
        redemptions: history.filter(h => h.event === 'redeem').reverse().slice(0, 100),
        endings: history.filter(h => h.event === 'end' && h.reason !== 'completed').reverse().slice(0, 50)
    };
}

function isValidTokenId(tokenId) {
    return TOKEN_ID_REGEX.test(String(tokenId));
}

module.exports = {
    STAKING_DIR,
    DAY_MS,
    getConfig,
    updateConfig,
    setCatalogIcon,
    clearCatalogIcon,
    iconPath,
    publicConfig,
    trainingByPeriod,
    readActive,
    startStakes,
    unstake,
    applyVerification,
    walletSummary,
    leaderboard,
    badgesOf,
    streaksByWallet,
    redeem,
    grantFog,
    spinWheel,
    adminSummary,
    isValidTokenId
};
