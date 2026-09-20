// La coleccion y la red donde vive. Lo unico que el Cultomizer necesita saber
// de la cadena.
//
// La version anterior de este archivo traia tambien Ethereum mainnet y Goerli,
// con una API key de Infura escrita en el codigo. Nada de eso se usaba: todas
// las consultas leen siempre la entrada de ApeChain. Por eso no se copiaron.

export const NFT_CONTRACT_ADDRESS = (import.meta.env.PRIMACULT_CONTRACT_ADDRESS ||
  "0xe277a7643562775c4f4257e23b068ba8f45608b4") as `0x${string}`;

export const APECHAIN = {
  id: 33139,
  nombre: "ApeChain",
  rpcUrl: import.meta.env.APECHAIN_RPC_URL || "https://rpc.apechain.com",
  explorador: "https://apescan.io",
  moneda: "APE",
} as const;

/// Lo minimo del ERC721 que hace falta para listar y verificar propiedad.
export const NFT_ABI = [
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/// Las imagenes de la coleccion viven en IPFS; los gateways devuelven la URL en
/// formatos distintos y hay que normalizarla antes de usarla en un <img>.
export function normalizeIpfs(url: string): string {
  if (!url) return "";
  if (url.startsWith("ipfs://ipfs/")) {
    return `https://ipfs.io/ipfs/${url.replace("ipfs://ipfs/", "")}`;
  }
  if (url.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${url.replace("ipfs://", "")}`;
  }
  return url;
}
