import type { APIRoute } from 'astro';
import { client, json, errorJson } from '@/lib/cultomizer/client';
import {
    NFT_CONTRACT_ADDRESS,
    NFT_ABI,
    APECHAIN,
    normalizeIpfs,
} from '@/lib/cultomizer/contracts';

export const prerender = false;

// Cuantos tokens entran en cada multicall. 200 va comodo en un request.
const BATCH_SIZE = 200;

// La coleccion tiene 2712 piezas; el margen cubre cualquier id fuera de rango.
const LAST_TOKEN = 4000;

// La metadata de un NFT no cambia, asi que alcanza con bajarla una vez por
// proceso. La segunda visita de cualquier usuario ya la encuentra cacheada.
const metadataCache = new Map<string, Record<string, unknown>>();

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
    const allIds = Array.from({ length: LAST_TOKEN }, (_, i) => BigInt(i + 1));

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

            const cached = metadataCache.get(url);
            if (cached) {
                out.set(tokenId, cached);
                return;
            }

            try {
                const response = await fetch(url, {
                    signal: AbortSignal.timeout(10_000),
                });
                if (!response.ok) return;
                const metadata = (await response.json()) as Record<
                    string,
                    unknown
                >;
                metadataCache.set(url, metadata);
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
        return json({ error: 'Address es requerido' }, 400);
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
        return errorJson('No se pudieron obtener los NFTs', error);
    }
};
