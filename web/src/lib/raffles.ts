import { BACKEND_URL } from '@/lib/backend';
import { EVENTO_CANJE } from '@/lib/promo';

export type TipoPremio = string;

export type PremioRaffle = {
    id: string;
    label: string;
    kind: TipoPremio;
    amount: number | null;
    winners: number;
};

export type Ganador = {
    slot: number;
    prizeId: string;
    prize: string;
    kind: TipoPremio | null;
    amount: number | null;
    wallet: string;
    entries: number;
    status: 'pending' | 'sent';
};

export type Raffle = {
    id: string;
    title: string;
    description: string;
    image: string | null;
    prizes: PremioRaffle[];
    holdersFree: boolean;
    publicPrice: number | null;
    ticketPrice: number;
    maxEntries: number | null;
    endsAt: string | null;
    status: 'open' | 'drawing' | 'drawn';
    totalEntries: number;
    participants: number;
    openedAt: string | null;
    drawnAt: string | null;
    winners: Ganador[];
};

export type Participante = { wallet: string; entries: number };
export type RaffleDetalle = Raffle & { entrants: Participante[] };

export type MiEntrada = { base: 'holder' | 'paid' | null; tickets: number; entries: number };

export type MiRaffles = {
    holder: boolean | null;
    balance: number;
    entries: Record<string, MiEntrada>;
    wins: Victoria[];
};

export type Victoria = {
    raffleId: string;
    title: string;
    image: string | null;
    slot: number;
    prize: string;
    kind: TipoPremio | null;
    amount: number | null;
    auto: boolean;
    drawnAt: string;
};

async function pedir<T>(ruta: string, token?: string | null, body?: object): Promise<T> {
    const respuesta = await fetch(`${BACKEND_URL}/raffles${ruta}`, {
        method: body ? 'POST' : 'GET',
        headers: {
            ...(body ? { 'content-type': 'application/json' } : {}),
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    const datos = await respuesta?.json().catch(() => ({}));
    if (!respuesta?.ok) {
        throw Object.assign(new Error(datos?.error || "Couldn't reach the server."), { reason: datos?.reason });
    }
    return datos as T;
}

export const leerRaffles = () => pedir<{ active: Raffle[]; past: Raffle[] }>('');

export const leerRaffle = (id: string) => pedir<RaffleDetalle>(`/${id}`);

export const leerMisRaffles = (token: string) => pedir<MiRaffles>('/me', token);

type Resultado = { raffle: Raffle; mine: MiEntrada; balance: number };

export async function entrar(token: string, id: string) {
    const r = await pedir<Resultado>(`/${id}/enter`, token, {});
    window.dispatchEvent(new Event(EVENTO_CANJE));
    return r;
}

export async function comprarTickets(token: string, id: string, quantity: number) {
    const r = await pedir<Resultado>(`/${id}/tickets`, token, { quantity });
    window.dispatchEvent(new Event(EVENTO_CANJE));
    return r;
}

export const imagenRaffle = (file: string) => `${BACKEND_URL}/raffles/images/${file}`;

export function textoPremio(p: { label: string; winners?: number }) {
    return p.winners && p.winners > 1 ? `${p.label} ×${p.winners}` : p.label;
}
