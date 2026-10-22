import { EVENTO_CANJE } from '@/lib/promo';
import { BACKEND_URL } from '@/lib/backend';

export type Periodo = {
    days: number;
    bonus: number;
    perDay: number;
    // Primals entrenando ahora en este periodo, de todas las wallets.
    training?: number;
};
export type Premio = {
    id: string;
    label: string;
    description: string;
    price: number;
    redeemable: boolean;
    // 'sold-out': no queda stock o la ruleta se quedo sin premios; 'soon':
    // todavia no se puede canjear.
    status?: 'available' | 'sold-out' | 'soon';
    // Cuantos quedan; null o ausente, sin limite.
    stock?: number | null;
    // Las keys y el Summon shard: se abren con una ruleta (ver Ruleta.tsx).
    wheel?: boolean;
    // El icono subido desde el admin, si hay uno (ver iconoPremio).
    icon?: string;
    kind?: 'key' | 'ape' | 'nft' | 'forge-roll' | 'raffle';
    amount?: number;
    // El fondo del mosaico en la Shop; sin esto sale del precio (fondoDe).
    background?: Fondo;
};

export type Fondo = { from: string; to: string };

// Sin un fondo elegido en el admin, el color sale del precio, como las
// rarezas de una tienda de juego: lo barato verde, lo caro naranja.
const FONDOS_POR_PRECIO: { hasta: number; fondo: Fondo }[] = [
    { hasta: 50000, fondo: { from: '#00d492', to: '#008236' } },
    { hasta: 500000, fondo: { from: '#00bcff', to: '#1447e6' } },
    { hasta: 1000000, fondo: { from: '#e12afb', to: '#5d0ec0' } },
    { hasta: Infinity, fondo: { from: '#ffb900', to: '#f54900' } },
];
export const fondoPorPrecio = (precio: number) =>
    FONDOS_POR_PRECIO.find((t) => precio < t.hasta)!.fondo;
export const fondoDe = (p: { price: number; background?: Fondo }) =>
    p.background ?? fondoPorPrecio(p.price);
export const degradado = (f: Fondo) =>
    `linear-gradient(to bottom, ${f.from}, ${f.to})`;

// Un premio de una ruleta. `chance` va de 0 a 1.
export type PremioRuleta = {
    id: string;
    label: string;
    kind: 'fog' | 'ape' | 'nft' | 'primal';
    amount: number | null;
    tokenId: string | null;
    image: string | null;
    chance?: number;
};
export type Ruleta = {
    item: string;
    available: boolean;
    prizes: (PremioRuleta & { chance: number; stock: number | null })[];
};
// Lo que gano una wallet en una ruleta. El FOG se acredita solo; lo demas lo
// manda el admin y lo marca como enviado.
export type Ganado = {
    id: string;
    item: string;
    prize: PremioRuleta;
    chance: number;
    status: 'credited' | 'pending' | 'sent';
    note?: string;
    at: string;
};
export type Escalon = { min: number; bonus: number };
export type ConfigStaking = {
    enabled: boolean;
    dailyRate: number;
    periods: Periodo[];
    catalog: Premio[];
    // Desde cuantos Primals en staking a la vez se suma `bonus` % a cada uno.
    quantityTiers: Escalon[];
    oneOfOne?: { bonus: number; tokenIds: string[] };
    // Primals en staking ahora y FOG ganado en total, de todas las wallets.
    totals: { staking: number; earned: number };
    // Cuantos Primals hay (totalSupply de la cadena, visto por el backend).
    collectionSize?: number;
    // Los dias seguidos de cada insignia y los de gracia entre periodos.
    badges: number[];
    graceDays: number;
    boost?: Boost | null;
    fogSale: VentaFog;
};
export type VentaFog =
    | { enabled: false; fogPerApe: number }
    | {
          enabled: true;
          fogPerApe: number;
          minApe: number;
          packs: (Fondo & { ape: number })[];
          treasury: `0x${string}`;
          chainId: number;
          confirmations: number;
      };
export type Boost = {
    multiplier: number;
    title: string;
    startAt: string;
    endsAt: string;
};

// Cuantos de los `dias` de un entrenamiento que empieza ahora caen dentro del
// boost (un dia cuenta si termina antes de que se acabe el evento).
export function diasConBoost(boost: Boost | null | undefined, dias: number, ahora = Date.now()) {
    if (!boost) return 0;
    const DIA = 24 * 60 * 60 * 1000;
    return Math.max(0, Math.min(dias, Math.floor((Date.parse(boost.endsAt) - ahora) / DIA)));
}

export function fogDelPeriodo(porDia: number, dias: number, boost?: Boost | null) {
    const conBoost = diasConBoost(boost, dias);
    return porDia * (dias - conBoost) + Math.floor(porDia * (boost?.multiplier ?? 1)) * conBoost;
}

// La coleccion entera, para el porcentaje que esta en staking, si el backend
// todavia no manda collectionSize.
export const TOTAL_PRIMALS = 2712;
export type Entrenamiento = {
    tokenId: string;
    days: number;
    bonus: number;
    perDay: number;
    // El FOG por dia sin el bonus: lo que paga si se saca antes de tiempo.
    baseRate: number;
    startAt: string;
    endsAt: string;
    creditedDays: number;
    earned: number;
    // Lo que paga hoy por dia, con bonus y evento; 0 si ya termino.
    perDayNow: number;
    finished: boolean;
};
export type Insignias = {
    // Las ganadas (90, 180, 365): quedan aunque se corte la racha.
    earned: number[];
    // Dias seguidos con al menos un Primal en staking; 0 si se corto.
    streakDays: number;
    next: number | null;
    // Si no tiene ninguno corriendo: hasta cuando puede volver sin cortarla.
    graceUntil: string | null;
};
export type MiStaking = {
    earned: number;
    spent: number;
    balance: number;
    stakes: Entrenamiento[];
    // Los que terminaron su periodo hace poco y se pueden volver a mandar.
    restake: { tokenId: string; days: number; endedAt: string }[];
    badges: Insignias;
    // Cuantos tiene en staking ahora y el bonus por cantidad que les toca.
    quantity: { count: number; bonus: number };
    // El FOG por dia que generan ahora todos sus Primals, eventos incluidos.
    dailyFog: number;
    // Lo que gano en las ruletas, del ultimo al primero.
    prizes: Ganado[];
    // Las compras de FOG con APE, de la ultima a la primera.
    purchases?: Compra[];
};

export type Compra = { txHash: string; valueWei: string; fog: number; at: string };

export function bonusPorCantidad(escalones: Escalon[], n: number) {
    let bonus = 0;
    for (const e of escalones) if (n >= e.min) bonus = e.bonus;
    return bonus;
}

// "2-4", "20+": el rango de cada escalon, para mostrarlos.
export function rangoEscalon(escalones: Escalon[], i: number) {
    const { min } = escalones[i];
    const siguiente = escalones[i + 1];
    if (!siguiente) return `${min}+`;
    return siguiente.min - 1 === min ? `${min}` : `${min}-${siguiente.min - 1}`;
}
export type Rechazo = { tokenId: string; reason: string };

async function pedir<T>(
    ruta: string,
    token?: string | null,
    body?: object
): Promise<T> {
    const respuesta = await fetch(`${BACKEND_URL}/staking/${ruta}`, {
        method: body ? 'POST' : 'GET',
        headers: {
            ...(body ? { 'content-type': 'application/json' } : {}),
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    const datos = await respuesta?.json().catch(() => ({}));
    if (!respuesta?.ok) {
        throw new Error(datos?.error || "Couldn't reach the server.");
    }
    return datos as T;
}

export const leerConfig = () => pedir<ConfigStaking>('config');

export const leerMio = (token: string) => pedir<MiStaking>('me', token);

// Los Primals que estan entrenando en cada periodo, de todas las wallets, del
// que empezo primero al ultimo. El mapa los dibuja dispersos en su region.
export const leerMapa = () =>
    pedir<{ periods: Record<string, string[]> }>('map').then((r) => r.periods);

// La miniatura de un Primal (backend/lib/primalThumbs.js): 96 px para el mapa,
// 192 para la grilla del panel. Mucho mas liviana que el GIF original de
// 2000 px, que al decodificarse trababa el cambio de region.
export const miniaturaPrimal = (tokenId: string, lado: 96 | 192 | 384 = 96) =>
    `${BACKEND_URL}/staking/primal/${tokenId}.webp${lado === 96 ? '' : `?t=${lado}`}`;

export const entrenar = (token: string, tokenIds: string[], days: number) =>
    pedir<MiStaking & { started: string[]; rejected: Rechazo[] }>(
        'stake',
        token,
        { tokenIds, days }
    );

// Saca Primals antes de tiempo: se quedan solo con el FOG base.
export const sacar = (token: string, tokenIds: string[]) =>
    pedir<
        MiStaking & {
            unstaked: { tokenId: string; earned: number; bonusLost: number }[];
            rejected: Rechazo[];
        }
    >('unstake', token, { tokenIds });

export const leerRanking = () =>
    pedir<{ wallets: Record<string, { balance: number; badges: number[] }> }>(
        'leaderboard'
    ).then((r) => r.wallets);

// El nombre corto de una insignia: 90D, 180D, 1Y.
export const nombreInsignia = (dias: number) =>
    dias % 365 === 0 ? `${dias / 365}Y` : `${dias}D`;

// Le pasa al backend el hash de una compra de FOG. Mientras no ve las
// confirmaciones responde not-confirmed, y se reintenta.
export async function informarCompra(token: string, txHash: string) {
    for (let intento = 0; intento < 20; intento++) {
        const r = await fetch(`${BACKEND_URL}/staking/buy-fog`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ txHash }),
        }).catch(() => null);
        const datos = await r?.json().catch(() => ({}));
        if (r?.ok) {
            window.dispatchEvent(new Event(EVENTO_CANJE));
            return datos as { purchase: { fog: number }; balance: number };
        }
        if (!r || datos?.code === 'not-confirmed' || r.status >= 500) {
            await new Promise((res) => setTimeout(res, 3000));
            continue;
        }
        throw Object.assign(new Error(datos?.error || 'The payment was not accepted.'), { definitivo: true });
    }
    throw new Error(
        'The payment is taking long to confirm. Reload the page in a minute and your FOG will show up.'
    );
}

// Despues de canjear un roll, el Forge escucha el mismo evento que con un
// codigo promocional y suma el roll sin recargar.
export async function canjear(token: string, item: string) {
    const datos = await pedir<{
        balance: number;
        redemption: { label: string };
        win?: Ganado;
        // Los APE: quedan para que el admin los mande.
        delivery?: Ganado;
    }>(
        'redeem',
        token,
        { item }
    );
    window.dispatchEvent(new Event(EVENTO_CANJE));
    return datos;
}

// Los iconos que vienen con el sitio, por premio. Desde el admin se puede subir
// otro, que el backend sirve y tiene prioridad.
const ICONOS: Record<string, string> = {
    lowkey: 'low_key',
    highkey: 'high_key',
    fogkey: 'fogged_key',
    'raffle-ticket': 'identity_tag',
    'forge-roll': 'trait_forge',
    'summon-shard': 'summonshard',
    'ape-10': '10ape',
    'ape-50': '50ape',
    'ape-100': '100ape',
};

export function iconoPremio(premio: { id: string; icon?: string; kind?: string; amount?: number }) {
    if (premio.icon) return `${BACKEND_URL}/staking/icons/${premio.icon}`;
    const n = premio.amount ?? 0;
    const base =
        ICONOS[premio.id] ??
        (premio.kind === 'key' ? 'low_key' : premio.kind === 'ape' ? (n >= 100 ? '100ape' : n >= 50 ? '50ape' : '10ape') : null);
    return base ? `/images/staking/icons/${base}.webp` : null;
}

// El orbe de FOG: para todo lo que muestra FOG con imagen. El chico (64 px)
// va al lado de los numeros; el grande, en las cartas de premio.
export const ICONO_FOG = '/images/staking/icons/fog.webp';
export const ICONO_FOG_CHICO = '/images/staking/icons/fog-64.webp';

// Los ultimos premios de las ruletas (sin el consuelo de FOG), del ultimo al
// primero.
export const leerRecientes = () =>
    pedir<{ wins: (Ganado & { wallet: string })[] }>('recent-wins').then((r) => r.wins);

// La tarjeta de 1200x630 de un premio ganado (backend/lib/winCards.js): la
// que X muestra en el post y la que se adjunta al compartir desde el celular.
export const tarjetaPremio = (id: string) => `${BACKEND_URL}/staking/win/${id}/card.png`;

export const leerRuleta = (item: string) => pedir<Ruleta>(`wheel/${item}`);

// La imagen de un premio de ruleta: la subida en el admin, la miniatura del
// Primal del vault, el orbe de FOG, o la pila de APE que corresponde a la
// cantidad: el mismo icono que el premio de APE de la tienda (el subido en el
// admin si se pasa el catalogo, si no el que viene con el sitio).
export function imagenPremio(p: PremioRuleta, catalogo?: { id: string; icon?: string }[]) {
    if (p.image) return `${BACKEND_URL}/staking/prizes/${p.image}`;
    if (p.kind === 'primal' && p.tokenId) return miniaturaPrimal(p.tokenId, 192);
    if (p.kind === 'fog') return ICONO_FOG;
    if (p.kind === 'ape') {
        const n = p.amount ?? 0;
        const id = n >= 100 ? 'ape-100' : n >= 50 ? 'ape-50' : 'ape-10';
        return iconoPremio(catalogo?.find((i) => i.id === id) ?? { id });
    }
    const delCatalogo = catalogo?.find((i) => i.id === p.id);
    return delCatalogo ? iconoPremio(delCatalogo) : null;
}

// El color del borde de cada carta, por lo raro que es: como en la ruleta de
// referencia (gris, azul, violeta, dorado).
export function colorRareza(chance: number) {
    if (chance >= 0.25) return '#8b93c9';
    if (chance >= 0.08) return '#4f7bff';
    if (chance >= 0.02) return '#a646ff';
    return '#fdf468';
}

export const fog = (n: number) => n.toLocaleString('en-US');

export const MOTIVOS: Record<string, string> = {
    'not-owner': "isn't in your wallet",
    listed: 'is listed for sale',
    'already-training': 'is already staking',
    'not-staking': "isn't staking",
    'already-finished': 'already finished its period',
};
