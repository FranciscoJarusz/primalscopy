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
// Compras de FOG con APE en la Store, por hash de la transaccion.
const PURCHASES_PATH = path.join(STAKING_DIR, 'purchases.json');
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
const LOSES_BONUS = new Set(['unstaked', 'listed']);
const TOKEN_ID_REGEX = /^\d{1,10}$/;

// openedAt/closedAt: solo se aceptan pagos de mientras estuvo abierta.
// Los paquetes de la Shop: cuantos APE y los dos colores del fondo (arriba y abajo).
const DEFAULT_PACKS = [
    { ape: 5, from: '#00d492', to: '#008236' },
    { ape: 10, from: '#00bcff', to: '#1447e6' },
    { ape: 50, from: '#e12afb', to: '#5d0ec0' },
    { ape: 100, from: '#ffb900', to: '#f54900' }
];
const DEFAULT_FOG_SALE = { enabled: false, fogPerApe: 10000, openedAt: null, closedAt: null, packs: DEFAULT_PACKS };
const COLOR_REGEX = /^#[0-9a-f]{6}$/i;
const esFondo = f => f && COLOR_REGEX.test(f.from) && COLOR_REGEX.test(f.to);

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
        { id: 'lowkey', kind: 'key', label: 'LOW KEY', description: 'NFT drop on ApeChain, floor 1-30 APE', price: 50000, enabled: true },
        { id: 'highkey', kind: 'key', label: 'HIGH KEY', description: 'NFT drop on ApeChain, floor 30-90 APE', price: 500000, enabled: true },
        { id: 'fogkey', kind: 'key', label: 'FOG KEY', description: 'NFT drop on ApeChain, floor 90-200 APE', price: 1000000, enabled: true },
        { id: 'forge-roll', kind: 'forge-roll', label: 'REROLL TICKET', description: 'One roll in the Forge', price: 20000, enabled: true },
        { id: 'summon-shard', kind: 'key', label: 'PRIMAL KEY', description: 'Win a Primal from the vault', price: 500000, enabled: true },
        // Los APE salen de la wallet del proyecto: arrancan sin stock y no se
        // venden hasta que el admin carga cuantos hay para dar.
        { id: 'ape-10', kind: 'ape', amount: 10, label: '10 APE', description: 'Sent to your wallet', price: 100000, enabled: true, stock: 0 },
        { id: 'ape-50', kind: 'ape', amount: 50, label: '50 APE', description: 'Sent to your wallet', price: 500000, enabled: true, stock: 0 },
        { id: 'ape-100', kind: 'ape', amount: 100, label: '100 APE', description: 'Sent to your wallet', price: 1000000, enabled: true, stock: 0 }
    ]
};

const KINDS_NUEVOS = {
    key: { description: 'Open it to win a prize', stock: null },
    ape: { description: 'Sent to your wallet', stock: 0 },
    nft: { description: 'Sent to your wallet', stock: 0 }
};
const IDS_RESERVADOS = ['fog'];

// Los premios que se entregan solos al canjear. El resto del catalogo se
// muestra pero todavia no se puede canjear: hay que mandar APE o NFTs reales,
// o depende de algo que no existe todavia (el firmante del contrato).
// `grant` recibe la wallet y un id unico del canje.
// Las keys y el Summon shard son ruletas (lib/stakingWheels.js): `grant`
// sortea el premio y devuelve el FOG que hay que acreditar ya, si toco FOG.
// Los APE quedan como entrega pendiente, igual que un premio de ruleta: el
// admin los manda y los marca como enviados.
const wheels = require('./stakingWheels');
const { getRarity } = require('./traitRarity');
wheels.usarRuletas(() => getConfig().catalog.filter(i => i.kind === 'key').map(i => i.id));

function grantDe(item) {
    if (item.kind === 'forge-roll') {
        return {
            available: () => Boolean(require('./forgePayments').paymentConfig()),
            grant: (wallet, redemptionId) => require('./forgeStore').addFogCredit(wallet, redemptionId)
        };
    }
    if (item.kind === 'key') {
        return {
            available: () => wheels.isAvailable(item.id),
            // Tiene premios cargados aunque hoy esten todos agotados: "Sold out",
            // no "Soon".
            configured: () => wheels.hasPrizes(item.id),
            grant: (wallet, redemptionId) => wheels.spin(wallet, item.id, redemptionId)
        };
    }
    if (item.kind === 'ape' || item.kind === 'nft') {
        return {
            available: () => true,
            grant: (wallet, redemptionId) => ({
                delivery: wheels.addDelivery(wallet, item.id,
                    { kind: item.kind, amount: item.amount ?? null, label: item.label }, redemptionId)
            })
        };
    }
    return null;
}

// Como se ve cada premio en la tienda: 'available', 'sold-out' (no queda
// stock, o la ruleta se quedo sin premios) o 'soon' (todavia no se puede).
function statusOf(item) {
    if (item.stock === 0) return 'sold-out';
    const grant = grantDe(item);
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

// Los boosts de la config, para creditedFog: se llama una vez por
// entrenamiento y releer la config cada vez frenaba el ranking.
let boostsMemo = { clave: null, datos: [], unicos: [] };
function leerExtras() {
    const clave = claveDe(CONFIG_PATH);
    if (clave !== boostsMemo.clave) {
        const saved = readJson(CONFIG_PATH, {});
        boostsMemo = { clave, datos: saved.boosts ?? [], unicos: saved.oneOfOneBonus ?? [] };
    }
    return boostsMemo;
}
function boostsLectura() {
    return leerExtras().datos;
}

function bonusUnicoEn(tokenId, t, unicos = leerExtras().unicos) {
    if (!unicos.length || !getRarity().isOneOfOne(tokenId)) return 0;
    let bonus = 0;
    for (const u of unicos) if (Date.parse(u.from) < t) bonus = u.bonus;
    return bonus;
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


// Descripciones que tenian los premios por defecto y quedaron mal. Guardar la
// config desde el admin guarda el catalogo entero, con estas incluidas: si la
// guardada es una de estas, se usa la de DEFAULT_CONFIG. Una que alguien
// escribio a mano no se toca.
const DESCRIPCIONES_VIEJAS = {
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
        boosts: saved.boosts ?? [],
        oneOfOneBonus: saved.oneOfOneBonus ?? [],
        fogSale: { ...DEFAULT_FOG_SALE, ...saved.fogSale },
        catalog: [
            ...DEFAULT_CONFIG.catalog.map(item => ({ ...item, ...sinTextosViejos(savedItems.get(item.id)), kind: item.kind })),
            ...(saved.catalog || []).filter(item => item.custom)
        ]
            .filter(item => !removed.includes(item.id))
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

    if ('fogSale' in changes) {
        const venta = changes.fogSale || {};
        if ('fogPerApe' in venta) {
            const tasa = intEntre(venta.fogPerApe, 1, 100000000);
            if (tasa === null) return { error: 'FOG per APE must be a whole number between 1 and 100,000,000.' };
            config.fogSale.fogPerApe = tasa;
        }
        if ('packs' in venta) {
            if (!Array.isArray(venta.packs) || venta.packs.length === 0 || venta.packs.length > 6) {
                return { error: 'There must be between 1 and 6 packs.' };
            }
            const packs = [];
            for (const pack of venta.packs) {
                const ape = intEntre(pack?.ape, 1, 100000);
                if (ape === null) return { error: 'Each pack costs a whole number of APE, 1 or more.' };
                if (!esFondo(pack)) return { error: 'Each pack needs two colors like #12ab34.' };
                packs.push({ ape, from: pack.from.toLowerCase(), to: pack.to.toLowerCase() });
            }
            if (new Set(packs.map(p => p.ape)).size !== packs.length) return { error: 'Two packs cost the same.' };
            config.fogSale.packs = packs.sort((a, b) => a.ape - b.ape);
        }
        if ('enabled' in venta) {
            const abrir = Boolean(venta.enabled);
            if (abrir && !config.fogSale.enabled) {
                config.fogSale.openedAt ??= new Date().toISOString();
                config.fogSale.closedAt = null;
            }
            if (!abrir && config.fogSale.enabled) config.fogSale.closedAt = new Date().toISOString();
            config.fogSale.enabled = abrir;
        }
    }

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

    if ('oneOfOneBonus' in changes) {
        const bonus = intEntre(changes.oneOfOneBonus, 0, 1000);
        if (bonus === null) return { error: 'The 1/1 bonus must be a whole percentage between 0 and 1000.' };
        if (bonus !== bonusUnicoActual(config.oneOfOneBonus)) {
            config.oneOfOneBonus = [...config.oneOfOneBonus, { bonus, from: new Date().toISOString() }];
        }
    }

    // Un boost arranca ahora y dura `days` dias. No se puede editar ni borrar:
    // el FOG se calcula en el momento con la lista de boosts, asi que tocar uno
    // que ya corrio cambiaria lo que ya se gano. Terminarlo antes solo le
    // corta los dias que faltan.
    if ('boost' in changes) {
        const now = Date.now();
        const actual = boostActivo(config.boosts, now);
        if (changes.boost?.archive) {
            // Solo lo esconde del admin: sigue en la lista porque el FOG que
            // ya pago se calcula con el.
            const boost = config.boosts.find(b => b.id === String(changes.boost.archive));
            if (!boost) return { error: 'Unknown boost.' };
            if (Date.parse(boost.endsAt) > now) return { error: "A boost that hasn't ended can't be archived." };
            boost.archived = true;
        } else if (changes.boost?.end) {
            if (!actual) return { error: 'There is no boost running.' };
            actual.endsAt = new Date(now).toISOString();
        } else {
            if (actual) return { error: 'There is already a boost running. End it first.' };
            const multiplier = Number(changes.boost?.multiplier);
            if (!Number.isFinite(multiplier) || multiplier <= 1 || multiplier > 10
                || Math.round(multiplier * 100) !== multiplier * 100) {
                return { error: 'The multiplier must be more than 1 and up to 10 (like 2 or 1.5).' };
            }
            const days = intEntre(changes.boost?.days, 1, 365);
            if (days === null) return { error: 'A boost lasts between 1 and 365 days.' };
            const title = String(changes.boost?.title || '').trim().slice(0, 40);
            config.boosts = [...config.boosts, {
                id: `boost-${now}`,
                multiplier,
                title: title || `x${multiplier} FOG`,
                startAt: new Date(now).toISOString(),
                endsAt: new Date(now + days * DAY_MS).toISOString()
            }];
        }
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
            if ('background' in change) {
                if (change.background === null) delete item.background;
                else if (esFondo(change.background)) {
                    item.background = { from: change.background.from.toLowerCase(), to: change.background.to.toLowerCase() };
                } else return { error: `The background of ${item.label} needs two colors like #12ab34.` };
            }
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

    if ('addCatalog' in changes) {
        const nuevo = changes.addCatalog || {};
        const base = KINDS_NUEVOS[nuevo.kind];
        if (!base) return { error: 'A new reward is a key, APE or an NFT.' };
        const label = String(nuevo.label || '').trim().slice(0, 40);
        if (!label) return { error: 'A reward needs a name.' };
        const price = intEntre(nuevo.price, 1, 1000000000);
        if (price === null) return { error: 'The price must be a whole number of FOG.' };
        let amount;
        if (nuevo.kind === 'ape') {
            amount = intEntre(nuevo.amount, 1, 1000000);
            if (amount === null) return { error: 'How much APE does it send? A whole number.' };
        }
        const usados = new Set([...config.catalog.map(i => i.id), ...config.removed, ...IDS_RESERVADOS]);
        const raiz = label.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || nuevo.kind;
        let id = raiz;
        for (let n = 2; usados.has(id); n++) id = `${raiz}-${n}`;
        config.catalog.push({
            id,
            kind: nuevo.kind,
            ...(amount ? { amount } : {}),
            label,
            description: String(nuevo.description || '').trim().slice(0, 120) || base.description,
            price,
            enabled: true,
            stock: base.stock,
            custom: true
        });
        if (config.order.length) config.order = [...config.order, id];
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


function borrarIcono(file) {
    if (!file || !ICON_FILE_REGEX.test(file)) return;
    fs.rm(path.join(ICONS_DIR, file), { force: true }, () => {});
}

function iconPath(file) {
    return ICON_FILE_REGEX.test(String(file)) ? path.join(ICONS_DIR, file) : null;
}

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

// --- Boosts ----------------------------------------------------------------
// Un evento que multiplica el FOG (ej. x2 por 30 dias). Paga mas cada dia de
// cualquier entrenamiento que termine dentro del evento, aunque haya empezado
// antes. Multiplica el dia entero (base + region + cantidad). Sacarlo o
// listarlo antes de tiempo lo pierde, como el bonus (finish paga solo la base).

function boostActivo(boosts = [], t = Date.now()) {
    return boosts.find(b => Date.parse(b.startAt) <= t && t < Date.parse(b.endsAt)) ?? null;
}

// El multiplicador del dia que termina en `t`, en centesimos (x2 = 200): asi
// la cuenta sigue siendo entera con un x1.5.
function boostCentesimos(boosts, t) {
    const b = boosts.find(x => Date.parse(x.startAt) < t && t <= Date.parse(x.endsAt));
    return b ? Math.round(b.multiplier * 100) : 100;
}

function bonusUnicoActual(unicos = []) {
    return unicos.at(-1)?.bonus ?? 0;
}

function publicBoost(boost) {
    return boost && { multiplier: boost.multiplier, title: boost.title, startAt: boost.startAt, endsAt: boost.endsAt };
}

function publicConfig() {
    const config = getConfig();
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
        oneOfOne: { bonus: bonusUnicoActual(config.oneOfOneBonus), tokenIds: getRarity().oneOfOnes },
        periods: config.periods.map(p => ({
            ...p,
            perDay: perDayFor(config, p.days).perDay,
            training: training[p.days] ?? 0
        })),
        catalog: config.catalog
            .filter(item => item.enabled)
            .map(item => {
                const status = statusOf(item);
                return { ...item, status, redeemable: status === 'available', wheel: item.kind === 'key' };
            }),
        totals: globalTotals(active, now),
        collectionSize: require('./collectionSupply').conocido(),
        badges: BADGES,
        graceDays: GRACE_MS / DAY_MS,
        boost: publicBoost(boostActivo(config.boosts, now)),
        fogSale: publicFogSale(config.fogSale)
    };
}

function publicFogSale(venta) {
    const treasury = require('./forgePayments').treasuryConfig();
    if (!venta.enabled || !treasury) return { enabled: false, fogPerApe: venta.fogPerApe };
    return {
        enabled: true,
        fogPerApe: venta.fogPerApe,
        minApe: MIN_APE,
        packs: venta.packs,
        treasury: treasury.treasury,
        chainId: treasury.chainId,
        confirmations: treasury.confirmations
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
// antes de los escalones no los tienen y pagan siempre `perDay`. Los dias que
// terminan dentro de un boost se multiplican.
function creditedFog(stake, cuenta, boosts = boostsLectura()) {
    const days = creditedDays(stake);
    const unicos = leerExtras().unicos;
    const esUnico = unicos.length > 0 && getRarity().isOneOfOne(stake.tokenId);
    if (!stake.tiers?.length && !boosts.length && !esUnico) return days * stake.perDay;
    cuenta ??= contador();
    const start = Date.parse(stake.startAt);
    let total = 0;
    for (let i = 1; i <= days; i++) total += fogDelDia(stake, cuenta, boosts, start + i * DAY_MS, unicos);
    return total;
}

function fogDelDia(stake, cuenta, boosts, t, unicos) {
    const boost = boostCentesimos(boosts, t);
    const unico = bonusUnicoEn(stake.tokenId, t, unicos);
    if (stake.tiers?.length) {
        return Math.floor(baseRateOf(stake) * (100 + stake.bonus + tierBonus(stake.tiers, cuenta(stake.wallet, t)) + unico) * boost / 10000);
    }
    if (unico) return Math.floor(baseRateOf(stake) * (100 + stake.bonus + unico) * boost / 10000);
    return Math.floor(stake.perDay * boost / 100);
}

// Lo que paga hoy un entrenamiento por dia, con el bonus de la region, el
// escalon por cantidad y el boost de este momento. 0 si ya termino.
function fogPorDiaAhora(stake, cuenta, boosts, now) {
    if (isFinished(stake, now)) return 0;
    return fogDelDia(stake, cuenta, boosts, now, leerExtras().unicos);
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
        // se cae la cadena entera.
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
 * chequeo periodico como vendidos. Si el bonus que pierde ya se gasto y el
 * saldo quedaria negativo, no se saca (`bonus-spent`, con lo que falta).
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
        const pierde = creditedFog(stake, cuenta) - creditedDays(stake) * baseRateOf(stake);
        const { balance } = balanceOf(key, active, wallets, cuenta);
        if (balance - pierde < 0) {
            rejected.push({ tokenId, reason: 'bonus-spent', missing: pierde - balance });
            continue;
        }
        unstaked.push({ tokenId, ...finish(active, wallets, tokenId, 'unstaked', now, cuenta) });
    }

    guardar(ACTIVE_PATH, active);
    guardar(WALLETS_PATH, wallets);
    return { unstaked, rejected };
}


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
        perDayNow: fogPorDiaAhora(stake, cuenta ?? contador(), boostsLectura(), now),
        oneOfOneBonus: bonusUnicoEn(stake.tokenId, now),
        finished: isFinished(stake, now)
    };
}

// Lo que hizo la wallet en el staking y la tienda, para la actividad del perfil.
function actividadDe(wallet) {
    const key = wallet.toLowerCase();
    return readHistory()
        .filter(h => h.wallet === key && ['start', 'end', 'redeem'].includes(h.event) && (h.event !== 'end' || h.reason === 'completed'))
        .map(h => h.event === 'redeem'
            ? { at: h.at, kind: 'redeem', label: h.label }
            : { at: h.event === 'start' ? h.startAt : h.endsAt, kind: h.event === 'start' ? 'stake' : 'trained', tokenId: h.tokenId, days: h.days });
}

// Lo del staking que miran las insignias (lib/badgeStore.js).
function datosParaInsignias(wallet) {
    const key = wallet.toLowerCase();
    const now = Date.now();
    const history = readHistory();
    const active = activosLectura();
    const tramos = streaksByWallet(history, active, now)[key] ?? [];
    const periodos = {};
    const canjes = {};
    for (const h of history) {
        if (h.wallet !== key) continue;
        if (h.event === 'start') periodos[h.days] = (periodos[h.days] ?? 0) + 1;
        if (h.event === 'redeem') canjes[h.item] = (canjes[h.item] ?? 0) + 1;
    }
    const { earned } = balanceOf(key, active);
    return {
        bestStreak: Math.max(0, ...tramos.map(([a, b]) => Math.floor((b - a) / DAY_MS))),
        stakingNow: Object.values(active).filter(s => s.wallet === key && !isFinished(s, now)).length,
        fogEarned: earned - (readWallets()[key]?.bought ?? 0),
        periodos,
        canjes
    };
}

function stakeOf(tokenId) {
    const stake = activosLectura()[String(tokenId)];
    return stake ? { ...publicStake(stake), wallet: stake.wallet } : null;
}

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
    const dailyFog = stakes.reduce((n, s) => n + s.perDayNow, 0);
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
        dailyFog,
        prizes: wheels.winsOf(key),
        purchases: Object.values(readPurchases())
            .filter(c => c.wallet === key)
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, 50)
            .map(({ txHash, valueWei, fog, at }) => ({ txHash, valueWei, fog, at }))
    };
}

function leaderboard() {
    return rankingMemo(claveDe(ACTIVE_PATH, WALLETS_PATH, HISTORY_PATH), () => {
        const now = Date.now();
        const active = activosLectura();
        const wallets = readWallets();
        const streaks = streaksByWallet(readHistory(), active, now);
        const cuenta = contador();
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

function globalTotals(active, now) {
    return totalesMemo(claveDe(ACTIVE_PATH, WALLETS_PATH, HISTORY_PATH), () => {
        const enCurso = Object.values(active);
        const cuenta = contador();
        return {
            staking: enCurso.filter(s => !isFinished(s, now)).length,
            earned: Object.values(readWallets()).reduce((n, w) => n + w.earned - (w.bought ?? 0), 0)
                + enCurso.reduce((n, s) => n + creditedFog(s, cuenta), 0)
        };
    });
}


// Devuelve { redemption, balance } o { error, reason, status }.
function redeem(wallet, itemId) {
    const key = wallet.toLowerCase();
    const config = getConfig();
    const item = config.catalog.find(i => i.id === itemId && i.enabled);
    if (!item) return { error: 'That reward does not exist.', reason: 'invalid', status: 404 };
    const grant = grantDe(item);
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
    if (Number.isInteger(item.stock)) {
        item.stock -= 1;
        guardar(CONFIG_PATH, config);
    }
    const fog = granted?.fog ?? 0;

    const totals = wallets[key] || { earned: 0, spent: 0 };
    wallets[key] = { ...totals, earned: totals.earned + fog, spent: totals.spent + item.price };
    guardar(WALLETS_PATH, wallets);
    appendHistory({ event: 'redeem', ...redemption, ...(granted?.win ? { prize: granted.win.prize, fog } : {}) });

    return { redemption, balance: balance - item.price + fog,
        ...(granted?.win ? { win: granted.win } : {}),
        ...(granted?.delivery ? { delivery: granted.delivery } : {}) };
}


function grantFog(wallet, amount, reason) {
    const key = wallet.toLowerCase();
    const wallets = readWallets();
    const totals = wallets[key] || { earned: 0, spent: 0 };
    wallets[key] = { ...totals, earned: totals.earned + amount };
    guardar(WALLETS_PATH, wallets);
    appendHistory({ event: 'grant', wallet: key, fog: amount, reason });
    return { fog: amount };
}

// Cobra FOG por algo que no es del catalogo (las entradas de los raffles).
// Devuelve { balance } o { error, reason, status }.
function spendFog(wallet, amount, reason) {
    const key = wallet.toLowerCase();
    const active = activosLectura();
    const wallets = readWallets();
    const { balance } = balanceOf(key, active, wallets);
    if (balance < amount) {
        return { error: `You need ${amount.toLocaleString('en-US')} FOG and have ${balance.toLocaleString('en-US')}.`, reason: 'insufficient', status: 402 };
    }
    const totals = wallets[key] || { earned: 0, spent: 0 };
    wallets[key] = { ...totals, spent: totals.spent + amount };
    guardar(WALLETS_PATH, wallets);
    appendHistory({ event: 'spend', wallet: key, fog: amount, reason });
    return { balance: balance - amount };
}

// Devuelve lo cobrado con spendFog: baja `spent`, no suma a `earned`, asi el
// ranking de FOG ganado no cambia.
function refundFog(wallet, amount, reason) {
    const key = wallet.toLowerCase();
    const wallets = readWallets();
    const totals = wallets[key] || { earned: 0, spent: 0 };
    wallets[key] = { ...totals, spent: totals.spent - amount };
    guardar(WALLETS_PATH, wallets);
    appendHistory({ event: 'refund', wallet: key, fog: amount, reason });
    return { fog: amount };
}

const balanceDe = wallet => balanceOf(wallet).balance;

const walletsConFog = () =>
    [...new Set([...Object.keys(readWallets()), ...Object.values(activosLectura()).map(s => s.wallet)])];

// Los saldos de muchas wallets de una vez, para la lista de holders del admin.
function balancesDe(lista) {
    const active = activosLectura();
    const wallets = readWallets();
    const cuenta = contador();
    return new Map(lista.map(w => [w, balanceOf(w, active, wallets, cuenta).balance]));
}

// El admin deja el saldo en un monto exacto (por ejemplo, el FOG que alguien
// tenia en Discord). La diferencia va a `earned` y queda en el historial como
// un ajuste, que Economy muestra aparte.
function setBalance(wallet, target, reason = 'admin') {
    const key = wallet.toLowerCase();
    const wallets = readWallets();
    const totals = wallets[key] || { earned: 0, spent: 0 };
    const delta = target - balanceOf(key, activosLectura(), wallets).balance;
    if (delta !== 0) {
        wallets[key] = { ...totals, earned: totals.earned + delta };
        guardar(WALLETS_PATH, wallets);
        appendHistory({ event: 'adjust', wallet: key, fog: delta, reason });
    }
    return { balance: target, delta };
}

const MIN_APE = 1;
const WEI = 10n ** 18n;

function readPurchases() {
    return readJson(PURCHASES_PATH, {});
}

const isPurchase = txHash => Boolean(readPurchases()[String(txHash).toLowerCase()]);

// Desde y hasta cuando valen los pagos (ms), o null si la venta nunca abrio.
// Redondeado a segundos: es lo que guarda un bloque.
function fogSaleWindow() {
    const { fogSale } = getConfig();
    if (!fogSale.openedAt) return null;
    return {
        from: Math.floor(Date.parse(fogSale.openedAt) / 1000) * 1000,
        until: fogSale.enabled || !fogSale.closedAt ? Infinity : Math.ceil(Date.parse(fogSale.closedAt) / 1000) * 1000
    };
}

// `payment` es lo que devuelve verifyPayment. El FOG sale del monto pagado con
// la tasa de hoy. Devuelve { purchase, balance } o { error, code, status }.
function buyFog(wallet, payment) {
    const key = wallet.toLowerCase();
    const hash = payment.txHash.toLowerCase();
    const purchases = readPurchases();
    if (purchases[hash]) {
        if (purchases[hash].wallet !== key) return { error: 'That payment was made by another wallet.', code: 'wrong-sender', status: 403 };
        return { purchase: purchases[hash], balance: balanceOf(key).balance };
    }
    if (require('./forgeStore').getPayment(hash)) {
        return { error: 'That payment was already used in the Forge.', code: 'already-used', status: 409 };
    }

    const { fogPerApe } = getConfig().fogSale;
    const fog = Number(BigInt(payment.valueWei) * BigInt(fogPerApe) / WEI);
    const purchase = {
        txHash: hash,
        wallet: key,
        valueWei: payment.valueWei,
        fogPerApe,
        fog,
        blockNumber: payment.blockNumber,
        at: new Date().toISOString()
    };
    purchases[hash] = purchase;
    guardar(PURCHASES_PATH, purchases);

    const wallets = readWallets();
    const totals = wallets[key] || { earned: 0, spent: 0 };
    wallets[key] = { ...totals, earned: totals.earned + fog, bought: (totals.bought ?? 0) + fog };
    guardar(WALLETS_PATH, wallets);
    appendHistory({ event: 'purchase', ...purchase });
    return { purchase, balance: balanceOf(key).balance };
}

function giveItem(wallet, itemId, reason) {
    const key = wallet.toLowerCase();
    const config = getConfig();
    const item = config.catalog.find(i => i.id === itemId);
    if (!item) return { error: 'That reward does not exist anymore.' };
    if (item.kind === 'key') {
        if (!wheels.isAvailable(itemId)) return { error: 'That reward is sold out right now.' };
        const result = wheels.spin(key, itemId, crypto.randomUUID());
        if (result.error) return result;
        if (result.fog) grantFog(key, result.fog, `${reason}:${itemId}`);
        else appendHistory({ event: 'grant', wallet: key, prize: result.win.prize, reason: `${reason}:${itemId}` });
        return { win: result.win, item: { id: itemId, label: item.label, icon: item.icon, kind: item.kind, amount: item.amount } };
    }
    if (item.kind !== 'ape' && item.kind !== 'nft') return { error: "That reward can't be given away." };
    if (item.stock === 0) return { error: `${item.label} is sold out.` };
    const { delivery } = grantDe(item).grant(key, crypto.randomUUID());
    if (Number.isInteger(item.stock)) {
        item.stock -= 1;
        guardar(CONFIG_PATH, config);
    }
    appendHistory({ event: 'grant', wallet: key, prize: delivery.prize, reason: `${reason}:${itemId}` });
    return { delivery, item: { id: itemId, label: item.label, icon: item.icon, kind: item.kind, amount: item.amount } };
}


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
        oneOfOnes: getRarity().oneOfOnes.map(tokenId => ({ tokenId, training: Boolean(active[tokenId]) })),
        training: Object.keys(active).length,
        wallets: stakers.size,
        totals: {
            earned: balances.reduce((s, b) => s + b.earned, 0),
            spent: balances.reduce((s, b) => s + b.spent, 0)
        },
        topWallets: balances.sort((a, b) => b.balance - a.balance).slice(0, 50),
        redemptions: history.filter(h => h.event === 'redeem').reverse().slice(0, 100),
        fogSale: ventasDeFog(),
        endings: history.filter(h => h.event === 'end' && h.reason !== 'completed').reverse().slice(0, 50)
    };
}

function origenDe(reason = '') {
    if (reason.startsWith('promo:raffle:') || reason.startsWith('raffle:')) return 'raffle-prizes';
    if (reason.startsWith('promo:')) return 'promo-codes';
    return reason.split(':')[0] || 'other';
}

function destinoDe(reason = '') {
    const tipo = reason.split(':')[0];
    if (tipo === 'trait') return 'trait-drops';
    if (tipo === 'raffle') return 'raffles';
    return tipo || 'other';
}

function economy(now = Date.now()) {
    const active = activosLectura();
    const wallets = readWallets();
    const history = readHistory();
    const cuenta = contador();
    const boosts = boostsLectura();
    const labels = Object.fromEntries(getConfig().catalog.map(i => [i.id, i.label]));
    const sumar = (obj, key, n) => { obj[key] = (obj[key] ?? 0) + n; };

    const sources = { staking: 0, bought: 0, wheels: 0 };
    const sinks = {};
    const ventanas = [7, 30].map(dias => ({ dias, desde: now - dias * DAY_MS, spent: 0, bought: 0, granted: 0 }));
    const enVentana = (at, campo, n) => {
        const t = Date.parse(at);
        for (const v of ventanas) if (t >= v.desde) v[campo] += n;
    };

    for (const h of history) {
        if (h.event === 'end') sumar(sources, 'staking', h.earned ?? 0);
        else if (h.event === 'purchase') {
            sumar(sources, 'bought', h.fog);
            enVentana(h.at, 'bought', h.fog);
        } else if (h.event === 'redeem') {
            sumar(sinks, `shop:${h.item}`, h.price);
            enVentana(h.at, 'spent', h.price);
            if (h.fog) {
                sumar(sources, 'wheels', h.fog);
                enVentana(h.at, 'granted', h.fog);
            }
        } else if (h.event === 'adjust') {
            sumar(sources, 'admin', h.fog);
        } else if (h.event === 'grant' && h.fog) {
            sumar(sources, origenDe(h.reason), h.fog);
            enVentana(h.at, 'granted', h.fog);
        } else if (h.event === 'spend') {
            sumar(sinks, destinoDe(h.reason), h.fog);
            enVentana(h.at, 'spent', h.fog);
        } else if (h.event === 'refund') {
            sumar(sinks, destinoDe(h.reason), -h.fog);
            enVentana(h.at, 'spent', -h.fog);
        }
    }

    const enCurso = {};
    let perDay = 0;
    for (const stake of Object.values(active)) {
        const fog = creditedFog(stake, cuenta, boosts);
        sumar(enCurso, stake.wallet, fog);
        sources.staking += fog;
        perDay += fogPorDiaAhora(stake, cuenta, boosts, now);
    }

    const saldos = [...new Set([...Object.keys(wallets), ...Object.keys(enCurso)])].map(w => {
        const t = wallets[w] || { earned: 0, spent: 0 };
        return { wallet: w, balance: t.earned + (enCurso[w] ?? 0) - t.spent };
    }).sort((a, b) => b.balance - a.balance);
    const circulating = saldos.reduce((n, s) => n + s.balance, 0);
    const earned = Object.values(wallets).reduce((n, w) => n + w.earned, 0) + Object.values(enCurso).reduce((n, f) => n + f, 0);
    const spent = Object.values(wallets).reduce((n, w) => n + w.spent, 0);
    const conSaldo = saldos.filter(s => s.balance > 0);
    const top10 = conSaldo.slice(0, 10).reduce((n, s) => n + s.balance, 0);
    const explicado = Object.values(sources).reduce((n, f) => n + f, 0);
    const gastado = Object.values(sinks).reduce((n, f) => n + f, 0);

    return {
        totals: { earned, spent, circulating },
        perDay,
        windows: ventanas.map(({ dias, spent: s, bought, granted }) => ({
            days: dias, spent: s, bought, granted, spentPerDay: Math.round(s / dias)
        })),
        sources,
        sinks: Object.entries(sinks)
            .map(([id, fog]) => ({ id, label: id.startsWith('shop:') ? labels[id.slice(5)] ?? id.slice(5) : id, fog }))
            .filter(s => s.fog !== 0)
            .sort((a, b) => b.fog - a.fog),
        unaccounted: { earned: earned - explicado, spent: spent - gastado },
        holders: {
            withBalance: conSaldo.length,
            median: conSaldo.length ? conSaldo[Math.floor(conSaldo.length / 2)].balance : 0,
            top10Share: circulating > 0 ? Math.round(top10 * 1000 / circulating) / 10 : 0
        },
        affordability: getConfig().catalog
            .filter(i => i.enabled)
            .map(i => ({ id: i.id, label: i.label, price: i.price, wallets: conSaldo.filter(s => s.balance >= i.price).length }))
            .sort((a, b) => a.price - b.price)
    };
}

const comprasDeFog = () => Object.values(readPurchases());

function ventasDeFog() {
    const compras = Object.values(readPurchases());
    return {
        count: compras.length,
        apeWei: compras.reduce((n, c) => n + BigInt(c.valueWei), 0n).toString(),
        fog: compras.reduce((n, c) => n + c.fog, 0),
        purchases: compras.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100)
    };
}

function isValidTokenId(tokenId) {
    return TOKEN_ID_REGEX.test(String(tokenId));
}

module.exports = {
    buyFog,
    comprasDeFog,
    isPurchase,
    fogSaleWindow,
    MIN_APE,
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
    stakeOf,
    datosParaInsignias,
    actividadDe,
    leaderboard,
    badgesOf,
    streaksByWallet,
    redeem,
    grantFog,
    spendFog,
    refundFog,
    balanceDe,
    balancesDe,
    setBalance,
    walletsConFog,
    giveItem,
    adminSummary,
    economy,
    isValidTokenId
};
