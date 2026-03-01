import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, getContract } from 'viem';
import { CONTRACTS, SUPPORTED_NETWORKS } from '../../../config/contracts';

const NFT_CONTRACT_ADDRESS = CONTRACTS.PRIMACULT_NFT.address as `0x${string}`;

// ABI para verificar propiedad
const NFT_ABI = [
  {
    "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
    "name": "ownerOf",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
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
  }
] as const;

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
    const tokenId = searchParams.get('tokenId');
    const address = searchParams.get('address');

    console.log('🔍 Verificando NFT ownership:', {
      tokenId,
      address,
      contractAddress: NFT_CONTRACT_ADDRESS,
      chainId: CONTRACTS.PRIMACULT_NFT.chainId,
      rpcUrl: process.env.ETHEREUM_RPC_URL
    });

    if (!tokenId || !address) {
      return NextResponse.json(
        { error: 'Token ID y address son requeridos' },
        { status: 400 }
      );
    }

    // Verificar owner del token usando el cliente directamente
    const owner = await client.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)]
    });

    // Verificar balance de la dirección
    const balance = await client.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`]
    });

    // Si tiene NFTs, intentar obtener el token ID usando tokenOfOwnerByIndex
    let ownedTokenId = null;
    if (Number(balance) > 0) {
      try {
        ownedTokenId = await client.readContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: NFT_ABI,
          functionName: 'tokenOfOwnerByIndex',
          args: [address as `0x${string}`, BigInt(0)] // Index 0 para el primer NFT
        });
        console.log('🔍 Token ID owned by address:', ownedTokenId?.toString());
      } catch (error) {
        console.log('🔍 Error getting tokenOfOwnerByIndex:', error);
      }
    }

    const isOwner = owner.toLowerCase() === address.toLowerCase();

    return NextResponse.json({
      tokenId,
      address,
      owner: owner,
      balance: Number(balance),
      isOwner,
      contractAddress: NFT_CONTRACT_ADDRESS,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error al verificar propiedad del NFT:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
