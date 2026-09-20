import { ethers } from "ethers";

/// Todo lo que la pagina necesita saber del contrato vive aca: direcciones,
/// ABI y tipos. Cuando el hub se despliegue en ApeChain, se cambia RPC y HUB y
/// el resto de la pagina no se entera.

export const RPC = "http://localhost:8545";

// Direcciones que imprimio script/DesplegarLocal.s.sol
export const HUB = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
export const VRNG = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const RAFFLE =
  "(address nft, uint256 tokenId, uint256 ticketPrice, uint32 ticketGoal, uint32 ticketsSold, address creator, uint64 deadline, uint8 estado, address ganador, uint256 aRepartir, bool nftRetirado, uint64 sorteoPedidoEn, bytes32 pedidoActual)";

export const ABI_HUB = [
  "function nextRaffleId() view returns (uint256)",
  `function verRaffle(uint256) view returns (${RAFFLE})`,
  "function ticketsOf(uint256, address) view returns (uint256)",
  "function saldos(address) view returns (uint256)",
  "function boletasVendidas(uint256) view returns (uint256)",
  "function buyTickets(uint256 raffleId, uint256 cantidad) payable",
  "function forzarSorteo(uint256 raffleId) payable",
  "function retirarNFT(uint256 raffleId)",
  "function reclamarReembolso(uint256 raffleId)",
  "function retirar()",
];

// Solo existe en local: en ApeChain el numero lo manda la cadena sola.
export const ABI_VRNG = [
  "function responder(bytes32 requestId, bytes32 randomValue)",
  "function ultimoRequestId() view returns (bytes32)",
];

export const SELLING = 0;
export const DRAWING = 1;
export const CLOSED = 2;
export const EXPIRED = 3;

/// Tope por wallet que aplica el contrato (MAX_TICKETS_PER_WALLET).
export const MAX_TICKETS = 5;

// batchMaxCount: 1 a proposito. Por defecto ethers junta varias llamadas en una
// sola request, y con el header y el contenido leyendo a la vez (son dos islas)
// se perdia una respuesta del lote y la pagina quedaba cargando para siempre.
// Una request por llamada: contra una cadena local no cuesta nada.
export const provider = new ethers.JsonRpcProvider(RPC, undefined, {
  batchMaxCount: 1,
});

export type Raffle = {
  nft: string;
  tokenId: bigint;
  ticketPrice: bigint;
  ticketGoal: bigint;
  ticketsSold: bigint;
  creator: string;
  deadline: bigint;
  estado: bigint;
  ganador: string;
  aRepartir: bigint;
  nftRetirado: boolean;
  sorteoPedidoEn: bigint;
  pedidoActual: string;
};

/// Un raffle mas lo que le toca a quien esta mirando la pagina.
export type Item = { id: number; r: Raffle; mios: number };

export type Actions = {
  comprar: (id: number, cant: number, precio: bigint) => Promise<void>;
  forzar: (id: number) => Promise<void>;
  retirarNFT: (id: number) => Promise<void>;
  reembolso: (id: number) => Promise<void>;
  sortear: (id: number) => Promise<void>;
};
