import { BACKEND_URL } from '@/lib/backend';

export type Metrica = { id: string; label: string; param?: string };

export type InsigniaAdmin = {
    id: string;
    name: string;
    description: string;
    image: string | null;
    kind: 'auto' | 'manual';
    metric: string;
    op: string;
    value: number;
    param: string;
    wallets: string[];
    holdersOnly: boolean;
    hidden: boolean;
    enabled: boolean;
};

export type Insignia = {
    id: string;
    name: string;
    description: string;
    image: string | null;
    earned: boolean;
    progress: { value: number; target: number } | null;
};

export type Tablero = { wallet: string; badges: Insignia[] };

export const imagenInsignia = (file: string) => `${BACKEND_URL}/badges/images/${file}`;

export async function leerTablero(id: string): Promise<Tablero> {
    const r = await fetch(`${BACKEND_URL}/badges/${encodeURIComponent(id)}`);
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || "Couldn't load the badges.");
    return datos;
}
