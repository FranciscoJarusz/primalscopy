// Los roles de soft staking de Discord, por cantidad de Primals. Cada rol
// arranca en `desde` y llega hasta uno antes del siguiente.
export type Rol = {
    slug: string;
    nombre: string;
    desde: number;
    color: string;
    // El texto sobre el color: oscuro cuando el color es claro.
    textoOscuro?: boolean;
};

export const ROLES: Rol[] = [
    { slug: 'primal', nombre: 'Primal', desde: 1, color: '#5b6cff' },
    { slug: 'sentinel', nombre: 'Sentinel', desde: 2, color: '#f2e24b', textoOscuro: true },
    { slug: 'believer', nombre: 'Believer', desde: 5, color: '#ec4f8c' },
    { slug: 'vanguard', nombre: 'Vanguard', desde: 10, color: '#ff4b4b' },
    { slug: 'hoarder', nombre: 'Hoarder', desde: 20, color: '#3fbf5f', textoOscuro: true },
    { slug: 'relicwarden', nombre: 'Relicwarden', desde: 30, color: '#a646ff' },
    { slug: 'eminence', nombre: 'Eminence', desde: 50, color: '#33d6e6', textoOscuro: true },
    { slug: 'paragon', nombre: 'Paragon', desde: 80, color: '#e254e6' },
    { slug: 'archon', nombre: 'Archon', desde: 100, color: '#4f7bff' },
    { slug: 'plerom', nombre: 'Plerom', desde: 200, color: '#8fe3bf', textoOscuro: true },
];

export function rolDe(cantidad: number): Rol {
    let rol = ROLES[0];
    for (const r of ROLES) if (cantidad >= r.desde) rol = r;
    return rol;
}

export function rangoDe(indice: number) {
    const { desde } = ROLES[indice];
    const siguiente = ROLES[indice + 1];
    if (!siguiente) return `${desde}+ NFTs`;
    const hasta = siguiente.desde - 1;
    return desde === hasta
        ? `${desde} NFT${desde === 1 ? '' : 's'}`
        : `${desde}-${hasta} NFTs`;
}
