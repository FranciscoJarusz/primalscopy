// Cuantos Primals hay, para las rutas de /api que recorren la coleccion. Sale
// de la cadena (totalSupply del contrato) y no de un numero fijo: el dueño
// puede subir el supply. Solo del lado del servidor.
import { parseAbi } from 'viem';
import { client } from '@/lib/cultomizer/client';
import { NFT_CONTRACT_ADDRESS } from '@/lib/cultomizer/contracts';

// Lo que se usa si la cadena no contesta.
export const SUPPLY_RESPALDO = 2712;
// Al recorrer ids se leen algunos de mas: si se quema un token, totalSupply
// baja pero los ids altos siguen existiendo. Los que no existen se ignoran.
export const MARGEN_IDS = 100;

const ABI = parseAbi(['function totalSupply() view returns (uint256)']);
const VIGENCIA_MS = 10 * 60 * 1000;
let actual = { valor: SUPPLY_RESPALDO, leido: 0 };

export async function totalSupply(): Promise<number> {
    if (Date.now() - actual.leido < VIGENCIA_MS) return actual.valor;
    try {
        const n = Number(
            await client.readContract({
                address: NFT_CONTRACT_ADDRESS,
                abi: ABI,
                functionName: 'totalSupply',
            })
        );
        if (Number.isInteger(n) && n > 0) actual = { valor: n, leido: Date.now() };
    } catch {
        // Queda el ultimo valor conocido.
    }
    return actual.valor;
}
