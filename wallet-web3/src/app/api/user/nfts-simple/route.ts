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

    // Rango específico basado en los token IDs conocidos
    // Empezar con un rango pequeño y expandir si es necesario
    const searchRanges = [
      { start: 1, end: 100 },      // Rango inicial
      { start: 101, end: 1000 },   // Rango medio
      { start: 1001, end: 10000 }  // Rango amplio
    ];

    const nfts = [];
    
    for (const range of searchRanges) {
      if (nfts.length >= nftCount) break;
      
      console.log(`🔍 Buscando en rango ${range.start}-${range.end}...`);
      
      // Verificar tokens en lotes de 10 para mejor rendimiento
      for (let start = range.start; start <= range.end && nfts.length < nftCount; start += 10) {
        const end = Math.min(start + 9, range.end);
        
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
