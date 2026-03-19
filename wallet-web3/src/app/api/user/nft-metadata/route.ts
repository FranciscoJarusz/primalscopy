import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { CONTRACTS, SUPPORTED_NETWORKS } from '../../../../config/contracts';

const NFT_CONTRACT_ADDRESS = CONTRACTS.PRIMACULT_NFT.address as `0x${string}`;

const NFT_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
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
  transport: http(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');

    if (!tokenId) {
      return NextResponse.json({ error: 'tokenId es requerido' }, { status: 400 });
    }

    const rawTokenUri = await client.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)],
    });

    const tokenURI = normalizeIpfsUrl(rawTokenUri);
    let metadata: any = {};
    let imageUrl = '';

    if (tokenURI) {
      const metadataResponse = await fetch(tokenURI);
      if (metadataResponse.ok) {
        metadata = await metadataResponse.json();
        imageUrl = normalizeIpfsUrl(metadata?.image || '');
      }
    }

    return NextResponse.json({
      tokenId,
      tokenURI,
      imageUrl,
      metadata,
      name: metadata?.name || `PrimaCult #${tokenId}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'No se pudo obtener metadata del NFT',
        details: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
}
