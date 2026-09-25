// Constantes y ayudas compartidas por las pantallas del LAB.

export const BACKEND_URL =
    import.meta.env.PUBLIC_BACKEND_URL || 'http://localhost:3001/api';
export const BACKEND_BASE_URL =
    import.meta.env.PUBLIC_BACKEND_BASE_URL ||
    BACKEND_URL.replace(/\/api\/?$/, '');

// De atras hacia adelante, igual que el backend.
export const LAYER_ORDER = [
    'Background',
    'Fur',
    'Tunic',
    'Face',
    'Eyes',
    'Hat',
    'Effect',
];

export const porcentaje = (p: number) =>
    p >= 0.1 ? `${Math.round(p * 100)}%` : `${(p * 100).toFixed(1)}%`;

export const imagenPublica = (id: string) =>
    `https://ipfs.primalcult.xyz/images/${id}.gif`;

export const urlDeRoll = (tokenId: string) => `/lab/roll?tokenId=${tokenId}`;
