import type { APIRoute } from 'astro';
import { client, json, errorJson } from '@/lib/cultomizer/client';
import {
    NFT_CONTRACT_ADDRESS,
    NFT_ABI,
    APECHAIN,
    normalizeIpfs,
} from '@/lib/cultomizer/contracts';
import { backendAbsoluto } from '@/lib/backend';

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

/// Que tokens de la coleccion son de esta wallet. El contrato no implementa
/// ERC721Enumerable: lo sabe el backend, que lleva los dueños al dia con las
/// transferencias de la cadena (ver backend/lib/transferIndex.js).
async function findTokensOwnedBy(backend: string, owner: string): Promise<bigint[]> {
    const respuesta = await fetch(`${backend}/explore/owner/${owner}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(60_000),
    });
    if (!respuesta.ok) throw new Error(`El backend respondio ${respuesta.status}`);
    const { tokenIds } = (await respuesta.json()) as { tokenIds: string[] };
    return tokenIds.map((id) => BigInt(id));
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

export const GET: APIRoute = async ({ url }) => {
    const address = url.searchParams.get('address');
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return json({ error: 'Address is required' }, 400);
    }

    const startedAt = Date.now();

    try {
        const tokenIds = await findTokensOwnedBy(backendAbsoluto(url), address);
        const count = tokenIds.length;

        if (count === 0) {
            return json({
                nfts: [],
                balance: 0,
                address,
                contractAddress: NFT_CONTRACT_ADDRESS,
                chainId: APECHAIN.id,
            });
        }

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
