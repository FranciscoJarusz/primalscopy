import { BACKEND_URL } from '@/lib/backend';

export type Categoria = { name: string; values: { value: string; count: number }[] };
export type Coleccion = {
    builtAt: string | null;
    total: number;
    categories: Categoria[];
    tokens: [number, number, number[]][];
};

export type Atributo = { trait_type: string; value: string; count: number };
export type Ficha = {
    id: string;
    name: string | null;
    image: string | null;
    oneOfOne: boolean;
    rank: number | null;
    total: number;
    attributes: Atributo[];
    owner: string | null;
    ownerName: string | null;
    exiled: boolean;
    staking: { days: number; startAt: string; endsAt: string; earned: number; perDayNow: number } | null;
    customizations: { at: string; thumbnail: string }[];
    forge: { at: string; changes: { category: string; from: string | null; to: string }[] }[];
};

async function pedir<T>(ruta: string): Promise<T> {
    const respuesta = await fetch(`${BACKEND_URL}/explore/${ruta}`).catch(() => null);
    const datos = await respuesta?.json().catch(() => ({}));
    if (!respuesta?.ok) throw new Error(datos?.error || "Couldn't reach the server.");
    return datos as T;
}

export const leerColeccion = () => pedir<Coleccion>('collection');
export const leerFicha = (id: string) => pedir<Ficha>(`primal/${id}`);
export const leerDe = (wallet: string) =>
    pedir<{ tokenIds: string[] }>(`owner/${wallet}`).then((r) => r.tokenIds);

export type DatosPerfil = { avatar: string | null; bio: string; x: string; discord: string; featured: string[] };
export type Perfil = {
    wallet: string;
    nickname: string | null;
    profile: DatosPerfil;
    tokens: { id: string; rank: number | null }[];
    rank: number | null;
    holders: number;
    oneOfOnes: number;
    fog: {
        balance: number;
        perDay: number;
        training: number;
        badges: { earned: number[]; streakDays: number; next: number | null; graceUntil: string | null };
    };
};

export const leerAvatares = () => pedir<Record<string, string>>('avatars');
export const leerAvatar = (wallet: string) =>
    pedir<{ tokenId: string | null }>(`avatar/${wallet}`).then((r) => r.tokenId);

export const leerPerfil = (id: string) => pedir<Perfil>(`holder/${id}`);

export async function guardarPerfil(token: string, datos: DatosPerfil & { nickname: string }) {
    const respuesta = await fetch(`${BACKEND_URL}/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(datos),
    }).catch(() => null);
    const json = await respuesta?.json().catch(() => ({}));
    if (!respuesta?.ok) throw new Error(json?.error || "Couldn't save your profile.");
    return json as { nickname: string | null; profile: DatosPerfil };
}

export const urlFicha = (id: number | string) => `/explore/${id}`;
export const urlHolder = (wallet: string) => `/holder/${wallet}`;
export const UNICO = '1/1';
