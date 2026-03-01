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
    "inputs": [{"internalType": "address", "name": "owner", "type": "address"}, {"internalType": "uint256", "name": "index", "type": "uint256"}],
    "name": "tokenOfOwnerByIndex",
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

    console.log('🔍 Obteniendo NFTs de ApeChain:', {
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

    // Como el contrato no implementa tokenOfOwnerByIndex, vamos a usar un enfoque diferente
    // Vamos a intentar obtener NFTs usando un rango de token IDs comunes
    const nfts = [];
    
    // Rango común de token IDs para PrimaCult (ajustar según sea necesario)
    const commonTokenIds = Array.from({ length: 10000 }, (_, i) => i + 1);
    
    console.log(`🔍 Buscando NFTs en rango de token IDs...`);
    
    // Verificar cada token ID para ver si pertenece al usuario
    for (const tokenId of commonTokenIds) {
      try {
        // Verificar si el usuario es propietario de este token
        const owner = await client.readContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: NFT_ABI,
          functionName: 'ownerOf',
          args: [BigInt(tokenId)]
        });

        // Si el propietario coincide con la dirección del usuario
        if (owner.toLowerCase() === address.toLowerCase()) {
          const tokenIdStr = tokenId.toString();
          console.log(`✅ NFT encontrado: #${tokenIdStr}`);

          // Obtener el token URI
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

            // Obtener los metadatos del NFT
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

          // Si ya encontramos todos los NFTs (según el balance), podemos parar
          if (nfts.length >= nftCount) {
            break;
          }
        }
      } catch (error) {
        // Si el token no existe o hay error, continuar con el siguiente
        continue;
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
