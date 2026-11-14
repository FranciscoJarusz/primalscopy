import { BACKEND_URL } from '@/lib/backend';

export type Rareza = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'chosen';

export type Categoria =
    | 'Fogreach'
    | 'Otherside'
    | 'Community'
    | 'Primal'
    | 'Mythic'
    | 'Exiled'
    | 'Wardens';

export const RAREZAS: Record<
    Rareza,
    { nombre: string; tier: number; puntos: number; chance: number }
> = {
    common: { nombre: 'Common', tier: 1, puntos: 5, chance: 0.55 },
    uncommon: { nombre: 'Uncommon', tier: 2, puntos: 10, chance: 0.25 },
    rare: { nombre: 'Rare', tier: 3, puntos: 25, chance: 0.12 },
    epic: { nombre: 'Epic', tier: 4, puntos: 60, chance: 0.06 },
    legendary: { nombre: 'Legendary', tier: 5, puntos: 200, chance: 0.02 },
    chosen: { nombre: 'Chosen', tier: 6, puntos: 500, chance: 0.001 },
};

export const ORDEN_RAREZAS: Rareza[] = [
    'chosen',
    'legendary',
    'epic',
    'rare',
    'uncommon',
    'common',
];


export interface CartaPack {
    id: number;
    nombre: string;
    categoria: Categoria;
    rareza: Rareza;
    imagen: string;
    miniatura: string;
}

export const CARTAS: CartaPack[] = [];

export const IMAGEN_PACK = '/packs/pack-chico.webp';

const porRareza = (r: Rareza) => CARTAS.filter((c) => c.rareza === r);

export const chanceCarta = (c: CartaPack) =>
    RAREZAS[c.rareza].chance / porRareza(c.rareza).length;

export const formatoChance = (p: number) =>
    `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`;

export function packDePrueba(): CartaPack[] {
    return [...ORDEN_RAREZAS].reverse().slice(1).map((r) => {
        const opciones = porRareza(r);
        return opciones[Math.floor(Math.random() * opciones.length)];
    });
}

export type TipoUpgrade = 'up' | 'swap';

export const SIGUIENTE: Partial<Record<Rareza, Rareza>> = {
    common: 'uncommon',
    uncommon: 'rare',
    rare: 'epic',
    epic: 'legendary',
};

export const repetidasDe = (coleccion: Record<string, number>, r: Rareza) =>
    CARTAS.filter((c) => c.rareza === r).reduce(
        (s, c) => s + Math.max(0, (coleccion[c.id] ?? 0) - 1),
        0
    );

export type EstadoPacks = 'upcoming' | 'open' | 'ended';

export type Nivel = 'none' | 'holder' | 'staker';

export interface ConfigPacks {
    status: EstadoPacks;
    endsAt: string | null;
    tiers: Record<Nivel, number>;
    extra: {
        price: string;
        priceWei: string;
        max: number;
        boost: number;
        treasury: `0x${string}`;
        chainId: number;
        confirmations: number;
    } | null;
    packSize: number;
    prizes?: string[];
    collectionPrize?: string | null;
    upgrades?: {
        from: string;
        tradeUp: Partial<Record<Rareza, number>>;
        swap: Partial<Record<Rareza, number>>;
    } | null;
    rarities: Record<Rareza, { chance: number; points: number }>;
    cards: { id: number; name: string; category: Categoria; rarity: Rareza }[];
}

export interface MiPacks {
    nickname: string | null;
    x: string;
    discord: string;
    registered: boolean;
    tier: Nivel | null;
    baseLimit: number;
    extrasToday: number;
    bonusPacks?: number;
    goalRewardToday?: boolean;
    limit: number;
    openedToday: number;
    points: number;
    packs: number;
    rank: number | null;
    streak: { current: number; best: number };
    collection: Record<string, number>;
    collectionComplete?: boolean;
    completedAt?: string | null;
    disqualified: boolean;
    winner: boolean;
    chosenEntered: boolean;
    chosenWinner: boolean;
    solana: string | null;
}

export interface FilaRanking {
    rank: number;
    wallet: string;
    nickname: string | null;
    points: number;
    packs: number;
    streak: number;
    today?: boolean;
}

export interface FilaColeccionista {
    wallet: string;
    nickname: string | null;
    at: string;
    packs: number;
}

export interface FilaChosen {
    wallet: string;
    nickname: string | null;
    pulls: number;
    firstAt: string;
    winner: boolean;
}

export function aplicarConfig(config: ConfigPacks) {
    for (const r of ORDEN_RAREZAS) {
        RAREZAS[r].puntos = config.rarities[r].points;
        RAREZAS[r].chance = config.rarities[r].chance;
    }
    CARTAS.splice(
        0,
        CARTAS.length,
        ...config.cards.map((c) => {
            const archivo = `MW${String(c.id).padStart(2, '0')}.webp`;
            return {
                id: c.id,
                nombre: `#${c.id} ${c.name}`,
                categoria: c.category,
                rareza: c.rarity,
                imagen: `/packs/cards/${archivo}`,
                miniatura: `/packs/cards/sm/${archivo}`,
            };
        })
    );
}

export const cartaPorId = (id: number) => CARTAS.find((c) => c.id === id)!;

export class ErrorPacks extends Error {
    constructor(
        mensaje: string,
        public reason?: string
    ) {
        super(mensaje);
    }
}

async function pedir<T>(
    ruta: string,
    token?: string | null,
    init: RequestInit = {}
): Promise<T> {
    const r = await fetch(`${BACKEND_URL}/packs${ruta}`, {
        ...init,
        headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok)
        throw new ErrorPacks(
            datos.error || 'Something went wrong. Try again.',
            datos.reason
        );
    return datos;
}

export const leerConfig = () => pedir<ConfigPacks>('/config');
let config: Promise<ConfigPacks> | null = null;
export function configCompartida() {
    config ??= leerConfig().catch((e) => {
        config = null;
        throw e;
    });
    return config;
}
export interface Ranking {
    players: number;
    limit?: number;
    top: FilaRanking[];
    chosen: FilaChosen[];
    collectors?: FilaColeccionista[];
}
export const leerRanking = () => pedir<Ranking>('/leaderboard');
export const leerMio = (token: string) => pedir<MiPacks>('/me', token);
export const registrarse = (
    token: string,
    datos: { nickname: string; x: string; discord: string }
) =>
    pedir<MiPacks>('/register', token, {
        method: 'POST',
        body: JSON.stringify(datos),
    });
export const abrirPack = (token: string) =>
    pedir<{ pack: { id: string; cards: number[]; points: number }; me: MiPacks }>(
        '/open',
        token,
        { method: 'POST', body: '{}' }
    );
export interface ResultadoUpgrade {
    upgrade: { id: string; kind: TipoUpgrade; rarity: Rareza; card: number; new: boolean };
    me: MiPacks;
}
export const hacerUpgrade = (token: string, kind: TipoUpgrade, cards: number[]) =>
    pedir<ResultadoUpgrade>('/upgrade', token, { method: 'POST', body: JSON.stringify({ kind, cards }) });
export async function acreditarExtra(token: string, txHash: string): Promise<MiPacks> {
    for (let intento = 0; intento < 20; intento++) {
        const r = await fetch(`${BACKEND_URL}/packs/extra`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ txHash }),
        });
        const datos = await r.json().catch(() => ({}));
        if (r.ok) return datos.me;
        if (datos.code === 'not-confirmed' || r.status >= 500) {
            await new Promise((ok) => setTimeout(ok, 3000));
            continue;
        }
        throw new ErrorPacks(datos.error || 'The payment was not accepted.', datos.reason ?? datos.code);
    }
    throw new ErrorPacks('The payment is taking long to confirm. Reload the page in a minute: your extra pack will show up.');
}

export const recuperarExtras = (token: string) =>
    pedir<{ recovered: number; me: MiPacks }>('/extra/recover', token, {
        method: 'POST',
        body: '{}',
    });

export const guardarSolana =(token: string, address: string) =>
    pedir<{ solana: string }>('/solana', token, {
        method: 'PUT',
        body: JSON.stringify({ address }),
    });
