import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
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

// Cliente para ApeChain
const client = createPublicClient({
  chain: {
    id: CONTRACTS.PRIMACULT_NFT.chainId,
    name: SUPPORTED_NETWORKS[CONTRACTS.PRIMACULT_NFT.chainId].name,
    network: 'apechain',
    nativeCurrency: {
      name: SUPPORTED_NETWORKS[CONTRACTS.PRIMACULT_NFT.chainId].currency,
      symbol: SUPPORTED_NETWORKS[CONTRACTS.PRIMACULT_NFT.chainId].currency,
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [SUPPORTED_NETWORKS[CONTRACTS.PRIMACULT_NFT.chainId].rpcUrl],
      },
      public: {
        http: [SUPPORTED_NETWORKS[CONTRACTS.PRIMACULT_NFT.chainId].rpcUrl],
      },
    },
    blockExplorers: {
      default: {
        name: 'ApeChain Explorer',
        url: SUPPORTED_NETWORKS[CONTRACTS.PRIMACULT_NFT.chainId].explorer,
      },
    },
  },
  transport: http()
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    console.log('🔍 Obteniendo NFTs de ApeChain (Simple):', {
      address,
      contractAddress: NFT_CONTRACT_ADDRESS,
      chainId: CONTRACTS.PRIMACULT_NFT.chainId,
      rpcUrl: 'https://rpc.apechain.com'
    });

    if (!address) {
      return NextResponse.json(
        { error: 'Address es requerido' },
        { status: 400 }
      );
    }

    // Verificar balance de NFTs
    const balance = await client.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`]
    });

    const nftCount = Number(balance);
    console.log(`📊 Balance de NFTs: ${nftCount}`);

    if (nftCount === 0) {
      return NextResponse.json({
        nfts: [],
        balance: 0,
        address,
        contractAddress: NFT_CONTRACT_ADDRESS,
        chainId: CONTRACTS.PRIMACULT_NFT.chainId
      });
    }

    const nfts = [];
    const discoveredTokenIds = new Set<bigint>();

    // Obtener IDs reales del dueño usando el enumerable del ERC721
    for (let i = 0; i < nftCount; i++) {
      let tokenId: bigint | null = null;

      try {
        tokenId = await client.readContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: NFT_ABI,
          functionName: 'tokenOfOwnerByIndex',
          args: [address as `0x${string}`, BigInt(i)]
        });
      } catch (error) {
        console.warn(`No se pudo obtener tokenOfOwnerByIndex(${i}):`, error);
        continue;
      }

      if (tokenId === null) continue;
      discoveredTokenIds.add(tokenId);

      if (discoveredTokenIds.size >= nftCount) {
        break;
      }
    }

    // Fallback final: escanear ownerOf en un rango acotado
    if (discoveredTokenIds.size === 0 && nftCount > 0) {
      console.log('🔄 Fallback: escaneo ownerOf en rango 1-4000');

      const maxTokenToScan = 4000;
      const batchSize = 50;

      for (let start = 1; start <= maxTokenToScan && discoveredTokenIds.size < nftCount; start += batchSize) {
        const end = Math.min(start + batchSize - 1, maxTokenToScan);

        const checks = [];
        for (let tokenId = start; tokenId <= end; tokenId++) {
          checks.push(
            client.readContract({
              address: NFT_CONTRACT_ADDRESS,
              abi: NFT_ABI,
              functionName: 'ownerOf',
              args: [BigInt(tokenId)]
            })
              .then((owner) => ({ tokenId, owner }))
              .catch(() => null)
          );
        }

        const results = await Promise.all(checks);
        for (const result of results) {
          if (!result) continue;
          if (result.owner.toLowerCase() === address.toLowerCase()) {
            discoveredTokenIds.add(BigInt(result.tokenId));
          }
          if (discoveredTokenIds.size >= nftCount) break;
        }
      }
    }

    for (const tokenId of discoveredTokenIds) {
      try {
        const owner = await client.readContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: NFT_ABI,
          functionName: 'ownerOf',
          args: [tokenId]
        });

        if (owner.toLowerCase() !== address.toLowerCase()) {
          continue;
        }
      } catch {
        continue;
      }

      const tokenIdStr = tokenId.toString();
      console.log(`✅ NFT encontrado: #${tokenIdStr}`);

      let tokenURI = '';
      let metadata: any = {};
      let imageUrl = '';

      try {
        const rawTokenUri = await client.readContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: NFT_ABI,
          functionName: 'tokenURI',
          args: [tokenId]
        });

        tokenURI = normalizeIpfsUrl(rawTokenUri);

        if (tokenURI) {
          try {
            const metadataResponse = await fetch(tokenURI);
            if (metadataResponse.ok) {
              metadata = await metadataResponse.json();
              imageUrl = normalizeIpfsUrl(metadata?.image || '');
            }
          } catch (error) {
            console.warn(`No se pudieron obtener metadatos del token ${tokenIdStr}:`, error);
          }
        }
      } catch (error) {
        console.warn(`No se pudo obtener tokenURI del token ${tokenIdStr}:`, error);
      }

      nfts.push({
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
      });
    }

    console.log(`✅ NFTs obtenidos: ${nfts.length} NFTs para ${address}`);

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
