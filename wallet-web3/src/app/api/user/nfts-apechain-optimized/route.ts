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
    "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
    "name": "ownerOf",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

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

// Función para verificar si un token existe
async function tokenExists(tokenId: number): Promise<boolean> {
  try {
    await client.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)]
    });
    return true;
  } catch (error) {
    return false;
  }
}

// Función para encontrar el rango de token IDs que existen
async function findTokenRange(): Promise<{ min: number; max: number }> {
  let min = 1;
  let max = 10000; // Rango inicial
  
  // Encontrar el máximo token ID que existe
  while (max < 100000) { // Límite de seguridad
    const exists = await tokenExists(max);
    if (!exists) {
      break;
    }
    max *= 2;
  }
  
  // Búsqueda binaria para encontrar el máximo real
  let left = min;
  let right = max;
  let actualMax = min;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const exists = await tokenExists(mid);
    
    if (exists) {
      actualMax = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  return { min: 1, max: actualMax };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    console.log('🔍 Obteniendo NFTs de ApeChain (Optimizado):', {
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

    // Encontrar el rango de token IDs
    console.log('🔍 Encontrando rango de token IDs...');
    const { min, max } = await findTokenRange();
    console.log(`📊 Rango de token IDs: ${min} - ${max}`);

    // Buscar NFTs del usuario en el rango encontrado
    const nfts = [];
    const batchSize = 50; // Procesar en lotes para mejor rendimiento
    
    for (let start = min; start <= max && nfts.length < nftCount; start += batchSize) {
      const end = Math.min(start + batchSize - 1, max);
      console.log(`🔍 Verificando tokens ${start}-${end}...`);
      
      // Crear promesas para verificar múltiples tokens en paralelo
      const promises = [];
      for (let tokenId = start; tokenId <= end; tokenId++) {
        promises.push(
          client.readContract({
            address: NFT_CONTRACT_ADDRESS,
            abi: NFT_ABI,
            functionName: 'ownerOf',
            args: [BigInt(tokenId)]
          }).then(owner => ({ tokenId, owner }))
          .catch(() => ({ tokenId, owner: null }))
        );
      }
      
      const results = await Promise.all(promises);
      
      // Procesar tokens que pertenecen al usuario
      for (const { tokenId, owner } of results) {
        if (owner && owner.toLowerCase() === address.toLowerCase()) {
          const tokenIdStr = tokenId.toString();
          console.log(`✅ NFT encontrado: #${tokenIdStr}`);

          // Obtener metadatos del NFT
          let tokenURI = '';
          let metadata: any = {};
          let imageUrl = '';

          try {
            tokenURI = await client.readContract({
              address: NFT_CONTRACT_ADDRESS,
              abi: NFT_ABI,
              functionName: 'tokenURI',
              args: [BigInt(tokenId)]
            });

            if (tokenURI) {
              try {
                const metadataResponse = await fetch(tokenURI);
                if (metadataResponse.ok) {
                  metadata = await metadataResponse.json();
                  imageUrl = metadata.image || '';
                }
              } catch (error) {
                console.warn(`No se pudieron obtener los metadatos para el token ${tokenIdStr}:`, error);
              }
            }
          } catch (error) {
            console.warn(`No se pudo obtener tokenURI para el token ${tokenIdStr}:`, error);
          }

          nfts.push({
            id: tokenIdStr,
            tokenId: tokenIdStr,
            contractAddress: NFT_CONTRACT_ADDRESS,
            ownerAddress: address,
            metadata: JSON.stringify(metadata),
            imageUrl,
            traits: metadata.attributes || [],
            name: metadata.name || `PrimaCult #${tokenIdStr}`,
            description: metadata.description || '',
            tokenURI
          });

          // Si ya encontramos todos los NFTs, podemos parar
          if (nfts.length >= nftCount) {
            break;
          }
        }
      }
    }

    console.log(`✅ NFTs obtenidos: ${nfts.length} NFTs para ${address}`);

    return NextResponse.json({
      nfts,
      balance: nftCount,
      address,
      contractAddress: NFT_CONTRACT_ADDRESS,
      chainId: CONTRACTS.PRIMACULT_NFT.chainId,
      tokenRange: { min, max },
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
