// Constantes y ayudas compartidas por las pantallas del Forge.
import { NFT_CONTRACT_ADDRESS } from '@/lib/cultomizer/contracts';

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

export const urlDeRoll = (tokenId: string) => `/forge/roll?tokenId=${tokenId}`;

// La pagina del Primal en OpenSea. La direccion va en minusculas, como la usa
// OpenSea en sus links.
export const urlOpenSea = (tokenId: string) =>
    `https://opensea.io/item/ape_chain/${NFT_CONTRACT_ADDRESS.toLowerCase()}/${tokenId}`;
