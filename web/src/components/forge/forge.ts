// Constantes y ayudas compartidas por las pantallas del Forge.
import { NFT_CONTRACT_ADDRESS } from '@/lib/cultomizer/contracts';
export { BACKEND_URL, BACKEND_BASE_URL } from '@/lib/backend';

export { LAYER_ORDER } from '@/lib/capas';

export const porcentaje = (p: number) =>
    p >= 0.1 ? `${Math.round(p * 100)}%` : `${(p * 100).toFixed(1)}%`;

export const imagenPublica = (id: string) =>
    `https://ipfs.primalcult.xyz/images/${id}.gif`;

export const urlDeRoll = (tokenId: string) => `/forge/roll?tokenId=${tokenId}`;

// La pagina del Primal en OpenSea. La direccion va en minusculas, como la usa
// OpenSea en sus links.
export const urlOpenSea = (tokenId: string) =>
    `https://opensea.io/item/ape_chain/${NFT_CONTRACT_ADDRESS.toLowerCase()}/${tokenId}`;
