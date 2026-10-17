import type { APIRoute } from 'astro';
import { client, json, errorJson } from '@/lib/cultomizer/client';
import {
    NFT_CONTRACT_ADDRESS,
    NFT_ABI,
    APECHAIN,
    normalizeIpfs,
} from '@/lib/cultomizer/contracts';
import { MARGEN_IDS, totalSupply } from '@/lib/cultomizer/supply';

export const prerender = false;

// Cuantos tokens entran en cada multicall. 200 va comodo en un request.
const BATCH_SIZE = 200;


// La metadata NO se guarda entre visitas: el Cultomizer y el Forge la
// reescriben en la misma URL, y una copia vieja en una instancia de Vercel
// mostraba el NFT de antes del cambio en el selector.

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
}

/// Busca que tokens de la coleccion son de esta wallet.
///
/// El contrato NO implementa ERC721Enumerable — `tokenOfOwnerByIndex` revierte,
/// esta comprobado contra la cadena. Por eso se va directo al barrido de
/// `ownerOf`, sin intentar primero el camino enumerable que siempre falla.
/// Con multicall, barrer 4000 tokens son ~20 requests, no 4000.
async function findTokensOwnedBy(
    owner: `0x${string}`,
    expected: number
): Promise<bigint[]> {
    const found: bigint[] = [];
    // Hasta el supply de la cadena y un poco mas (ver lib/cultomizer/supply).
    const ultimo = (await totalSupply()) + MARGEN_IDS;
    const allIds = Array.from({ length: ultimo }, (_, i) => BigInt(i + 1));

    for (const batch of chunk(allIds, BATCH_SIZE)) {
        const results = await client.multicall({
            contracts: batch.map((tokenId) => ({
                address: NFT_CONTRACT_ADDRESS,
                abi: NFT_ABI,
                functionName: 'ownerOf' as const,
                args: [tokenId] as const,
            })),
            allowFailure: true,
        });

        results.forEach((r, i) => {
            if (r.status !== 'success') return;
            if (String(r.result).toLowerCase() === owner.toLowerCase()) {
                found.push(batch[i]!);
            }
        });

        // Ya tenemos todos los que la wallet declara tener: no sigue barriendo.
        if (found.length >= expected) break;
    }

    return found;
}

async function readTokenUris(tokenIds: bigint[]): Promise<Map<string, string>> {
    const uris = new Map<string, string>();

    for (const batch of chunk(tokenIds, BATCH_SIZE)) {
        const results = await client.multicall({
            contracts: batch.map((tokenId) => ({
                address: NFT_CONTRACT_ADDRESS,
                abi: NFT_ABI,
                functionName: 'tokenURI' as const,
                args: [tokenId] as const,
            })),
            allowFailure: true,
        });

        results.forEach((r, i) => {
            if (r.status === 'success') {
                uris.set(batch[i]!.toString(), normalizeIpfs(String(r.result)));
            }
        });
    }

    return uris;
}

/// Baja la metadata de todos los tokens en paralelo. Un gateway de IPFS colgado
/// no puede frenar toda la response, asi que cada una falla por su cuenta.
async function fetchMetadata(
    uris: Map<string, string>
): Promise<Map<string, Record<string, unknown>>> {
    const out = new Map<string, Record<string, unknown>>();

    await Promise.all(
        [...uris.entries()].map(async ([tokenId, url]) => {
            if (!url) return;

            try {
                const response = await fetch(url, {
                    cache: 'no-store',
                    signal: AbortSignal.timeout(10_000),
                });
                if (!response.ok) return;
                const metadata = (await response.json()) as Record<
                    string,
                    unknown
                >;
                out.set(tokenId, metadata);
            } catch {
                // Sin metadata el NFT igual se muestra, con su nombre por defecto.
            }
        })
    );

    return out;
}

/// Los NFTs de la coleccion que tiene una wallet, con su metadata.
///
/// Reemplaza a las tres rutas que habia antes (nfts-simple, nfts-apechain y
/// nfts-apechain-optimized), que hacian lo mismo con estrategias distintas y
/// se llamaban en cascada. Las otras dos barrian la coleccion de a un token por
/// request: por eso la carga tardaba ~18 segundos.
export const GET: APIRoute = async ({ url }) => {
    const address = url.searchParams.get('address');
    if (!address) {
        return json({ error: 'Address is required' }, 400);
    }

    const owner = address as `0x${string}`;
    const startedAt = Date.now();

    try {
        const balance = await client.readContract({
            address: NFT_CONTRACT_ADDRESS,
            abi: NFT_ABI,
            functionName: 'balanceOf',
            args: [owner],
        });

        const count = Number(balance);

        if (count === 0) {
            return json({
                nfts: [],
                balance: 0,
                address,
                contractAddress: NFT_CONTRACT_ADDRESS,
                chainId: APECHAIN.id,
            });
        }

        const tokenIds = await findTokensOwnedBy(owner, count);
        const uris = await readTokenUris(tokenIds);
        const metadataByToken = await fetchMetadata(uris);

        const nfts = tokenIds.map((tokenId) => {
            const id = tokenId.toString();
            const tokenURI = uris.get(id) || '';
            const metadata = metadataByToken.get(id) || {};

            return {
                id,
                tokenId: id,
                contractAddress: NFT_CONTRACT_ADDRESS,
                ownerAddress: address,
                metadata: JSON.stringify(metadata),
                imageUrl: normalizeIpfs(String(metadata?.image ?? '')),
                traits: metadata?.attributes ?? [],
                name: metadata?.name || `PrimaCult #${id}`,
                description: metadata?.description ?? '',
                tokenURI,
            };
        });

        console.log(
            `${nfts.length} NFTs de ${address} en ${Date.now() - startedAt}ms`
        );

        return json({
            nfts,
            balance: count,
            address,
            contractAddress: NFT_CONTRACT_ADDRESS,
            chainId: APECHAIN.id,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        return errorJson("Couldn't load the NFTs", error);
    }
};
