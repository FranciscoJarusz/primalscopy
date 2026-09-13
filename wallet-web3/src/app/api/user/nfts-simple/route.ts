import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { apeChain } from 'viem/chains';
import { CONTRACTS, SUPPORTED_NETWORKS } from '../../../../config/contracts';

const NFT_CONTRACT_ADDRESS = CONTRACTS.PRIMACULT_NFT.address as `0x${string}`;

// ABI para el contrato ERC721
const NFT_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
    "name": "tokenURI",
    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "owner", "type": "address"},
      {"internalType": "uint256", "name": "index", "type": "uint256"}
    ],
    "name": "tokenOfOwnerByIndex",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
    "name": "ownerOf",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// Cuantos tokens se agrupan por multicall. 200 entra comodo en un request y
// mantiene el payload de respuesta manejable.
const MULTICALL_BATCH_SIZE = 200;
// Descargas de metadata en paralelo. El tokenURI apunta al gateway propio
// (ipfs.primalcult.xyz), que aguanta bien esta tanda; contra un gateway publico
// habria que bajarlo.
const METADATA_CONCURRENCY = 25;
const METADATA_TIMEOUT_MS = 8000;
// Solo para el fallback por escaneo, cuando el contrato no expone el enumerable.
const MAX_TOKEN_TO_SCAN = 4000;

const normalizeIpfsUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('ipfs://ipfs/')) {
    return `https://ipfs.io/ipfs/${url.replace('ipfs://ipfs/', '')}`;
  }
  if (url.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${url.replace('ipfs://', '')}`;
  }
  return url;
};

// Se usa la definicion de apeChain de viem porque trae la direccion de
// Multicall3, que es lo que permite colapsar N lecturas en un solo request.
// El RPC se toma de la config propia para poder apuntarlo a un nodo dedicado.
const client = createPublicClient({
  chain: apeChain,
  transport: http(SUPPORTED_NETWORKS[CONTRACTS.PRIMACULT_NFT.chainId].rpcUrl, {
    batch: true
  })
});

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// Lee tokenOfOwnerByIndex(owner, i) para todos los indices de una, en tandas de
// multicall. Antes era un await secuencial por indice.
async function readOwnedTokenIds(owner: `0x${string}`, total: number): Promise<bigint[]> {
  const indexes = Array.from({ length: total }, (_, i) => BigInt(i));
  const tokenIds: bigint[] = [];

  for (const batch of chunk(indexes, MULTICALL_BATCH_SIZE)) {
    const results = await client.multicall({
      contracts: batch.map(index => ({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_ABI,
        functionName: 'tokenOfOwnerByIndex' as const,
        args: [owner, index] as const
      })),
      allowFailure: true
    });

    for (const result of results) {
      if (result.status === 'success' && typeof result.result === 'bigint') {
        tokenIds.push(result.result);
      }
    }
  }

  return tokenIds;
}

// Fallback para contratos sin ERC721Enumerable: barre ownerOf en un rango.
// Sigue siendo caro, pero con multicall pasa de miles de requests a decenas.
async function scanTokenIdsByOwner(owner: `0x${string}`, expected: number): Promise<bigint[]> {
  const found: bigint[] = [];
  const allIds = Array.from({ length: MAX_TOKEN_TO_SCAN }, (_, i) => BigInt(i + 1));

  for (const batch of chunk(allIds, MULTICALL_BATCH_SIZE)) {
    const results = await client.multicall({
      contracts: batch.map(tokenId => ({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_ABI,
        functionName: 'ownerOf' as const,
        args: [tokenId] as const
      })),
      allowFailure: true
    });

    results.forEach((result, i) => {
      if (result.status !== 'success') return;
      if (String(result.result).toLowerCase() === owner.toLowerCase()) {
        found.push(batch[i]);
      }
    });

    if (found.length >= expected) break;
  }

  return found;
}

async function readTokenUris(tokenIds: bigint[]): Promise<Map<string, string>> {
  const uris = new Map<string, string>();

  for (const batch of chunk(tokenIds, MULTICALL_BATCH_SIZE)) {
    const results = await client.multicall({
      contracts: batch.map(tokenId => ({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_ABI,
        functionName: 'tokenURI' as const,
        args: [tokenId] as const
      })),
      allowFailure: true
    });

    results.forEach((result, i) => {
      if (result.status === 'success') {
        uris.set(batch[i].toString(), normalizeIpfsUrl(String(result.result)));
      }
    });
  }

  return uris;
}

// La metadata de un NFT es inmutable, asi que alcanza con bajarla una vez por
// instancia. En Vercel el modulo sobrevive entre invocaciones tibias, con lo
// cual la segunda visita de cualquier usuario ya la encuentra cacheada.
const metadataCache = new Map<string, Record<string, unknown>>();

// Un gateway de IPFS colgado no puede frenar toda la respuesta.
async function fetchMetadata(url: string): Promise<Record<string, unknown>> {
  if (!url) return {};

  const cached = metadataCache.get(url);
  if (cached) return cached;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(METADATA_TIMEOUT_MS) });
    if (!response.ok) return {};
    const metadata = await response.json();
    metadataCache.set(url, metadata);
    return metadata;
  } catch {
    return {};
  }
}

async function fetchAllMetadata(uris: Map<string, string>): Promise<Map<string, Record<string, unknown>>> {
  const entries = [...uris.entries()];
  const out = new Map<string, Record<string, unknown>>();

  for (const batch of chunk(entries, METADATA_CONCURRENCY)) {
    const settled = await Promise.all(batch.map(([tokenId, url]) =>
      fetchMetadata(url).then(metadata => [tokenId, metadata] as const)
    ));
    for (const [tokenId, metadata] of settled) {
      out.set(tokenId, metadata);
    }
  }

  return out;
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { error: 'Address es requerido' },
        { status: 400 }
      );
    }

    const owner = address as `0x${string}`;

    const balance = await client.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: 'balanceOf',
      args: [owner]
    });

    const nftCount = Number(balance);

    if (nftCount === 0) {
      return NextResponse.json({
        nfts: [],
        balance: 0,
        address,
        contractAddress: NFT_CONTRACT_ADDRESS,
        chainId: CONTRACTS.PRIMACULT_NFT.chainId
      });
    }

    // tokenOfOwnerByIndex ya devuelve, por definicion, tokens de este owner:
    // no hace falta volver a verificarlos con ownerOf.
    let tokenIds = await readOwnedTokenIds(owner, nftCount);

    if (tokenIds.length === 0) {
      console.log('🔄 Sin enumerable, cayendo al escaneo de ownerOf');
      tokenIds = await scanTokenIdsByOwner(owner, nftCount);
    }

    const uniqueTokenIds = [...new Set(tokenIds.map(id => id.toString()))]
      .map(id => BigInt(id));

    const uris = await readTokenUris(uniqueTokenIds);
    const metadataByToken = await fetchAllMetadata(uris);

    const nfts = uniqueTokenIds.map(tokenId => {
      const tokenIdStr = tokenId.toString();
      const tokenURI = uris.get(tokenIdStr) || '';
      const metadata = metadataByToken.get(tokenIdStr) || {};
      const imageUrl = normalizeIpfsUrl(String(metadata?.image || ''));

      return {
        id: tokenIdStr,
        tokenId: tokenIdStr,
        contractAddress: NFT_CONTRACT_ADDRESS,
        ownerAddress: address,
        metadata: JSON.stringify(metadata),
        imageUrl,
        traits: metadata?.attributes || [],
        name: metadata?.name || `PrimaCult #${tokenIdStr}`,
        description: metadata?.description || '',
        tokenURI
      };
    });

    console.log(`✅ ${nfts.length} NFTs de ${address} en ${Date.now() - startedAt}ms`);

    return NextResponse.json({
      nfts,
      balance: nftCount,
      address,
      contractAddress: NFT_CONTRACT_ADDRESS,
      chainId: CONTRACTS.PRIMACULT_NFT.chainId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error obteniendo NFTs de ApeChain:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
