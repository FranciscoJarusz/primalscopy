// El color del nombre de un trait segun que parte de la coleccion lo tiene,
// como en OpenSea. Los cortes reparten los ~90 traits en 8/15/30/24/13.
import type { Probabilidades } from './tipos';

export type Tier = { nombre: string; color: string };

const TIERS: { desde: number; tier: Tier }[] = [
    { desde: 0.15, tier: { nombre: 'Common', color: 'text-white' } },
    { desde: 0.08, tier: { nombre: 'Uncommon', color: 'text-sky-300' } },
    { desde: 0.04, tier: { nombre: 'Rare', color: 'text-violet-400' } },
    { desde: 0.02, tier: { nombre: 'Very Rare', color: 'text-red-400' } },
    { desde: 0, tier: { nombre: 'Super Rare', color: 'text-amber-400' } },
];

export const tierDe = (share: number) =>
    TIERS.find((t) => share >= t.desde)!.tier;

// null si el backend no mando la rareza de ese trait.
export function rarezaDe(
    shares: Probabilidades | undefined,
    category: string,
    value: string | undefined
) {
    const share = value ? shares?.[category]?.[value] : undefined;
    return share === undefined ? null : { share, ...tierDe(share) };
}
