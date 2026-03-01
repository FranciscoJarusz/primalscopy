import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';

// ABI simplificado para balanceOf y tokenOfOwnerByIndex
const PRIMACULT_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
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
    "name": "tokenURI",
    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  }
];

import { config } from '@/config/env';

const PRIMACULT_CONTRACT = config.PRIMACULT_CONTRACT_ADDRESS;
const RPC_URL = config.ETHEREUM_RPC_URL;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.walletAddress) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const walletAddress = session.user.walletAddress as string;

    // Obtener balance de NFTs del usuario
    const balanceResponse = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{
          to: PRIMACULT_CONTRACT,
          data: '0x70a08231' + '000000000000000000000000' + walletAddress.slice(2)
        }, 'latest'],
        id: 1
      })
    });

    if (!balanceResponse.ok) {
      throw new Error('Error al obtener balance de NFTs');
    }

    const balanceData = await balanceResponse.json();
    const balance = parseInt(balanceData.result, 16);

    if (balance === 0) {
      return NextResponse.json({ message: 'No tienes NFTs de PrimaCult', nfts: [] });
    }

    const userNFTs = [];

    // Obtener cada NFT del usuario
    for (let i = 0; i < balance; i++) {
      try {
        // Obtener tokenId
        const tokenIdResponse = await fetch(RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{
              to: PRIMACULT_CONTRACT,
              data: '0x2f745c59' + '000000000000000000000000' + walletAddress.slice(2) + i.toString(16).padStart(64, '0')
            }, 'latest'],
            id: 1
          })
        });

        if (!tokenIdResponse.ok) continue;

        const tokenIdData = await tokenIdResponse.json();
        const tokenId = parseInt(tokenIdData.result, 16).toString();

        // Obtener metadata del NFT
        const metadataResponse = await fetch(RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{
              to: PRIMACULT_CONTRACT,
              data: '0xc87b56dd' + tokenId.toString(16).padStart(64, '0')
            }, 'latest'],
            id: 1
          })
        });

        let metadata = null;
        let imageUrl = null;
        let traits = null;

        if (metadataResponse.ok) {
          const metadataData = await metadataResponse.json();
          if (metadataData.result && metadataData.result !== '0x') {
            try {
              // Decodificar metadata (puede estar en IPFS)
              const metadataHex = metadataData.result;
              const metadataString = Buffer.from(metadataHex.slice(2), 'hex').toString();
              metadata = metadataString;
              
              // Extraer imagen y traits si es posible
              const metadataObj = JSON.parse(metadataString);
              imageUrl = metadataObj.image || metadataObj.image_url;
              traits = JSON.stringify(metadataObj.attributes || []);
            } catch (e) {
              console.log('Error decodificando metadata:', e);
            }
          }
        }

        // Crear o actualizar NFT en la base de datos
        const nft = await prisma.nFT.upsert({
          where: { tokenId },
          update: {
            ownerAddress: walletAddress.toLowerCase(),
            userId: session.user.id,
            metadata: metadata || null,
            imageUrl: imageUrl || null,
            traits: traits || null,
          },
          create: {
            tokenId,
            contractAddress: PRIMACULT_CONTRACT,
            ownerAddress: walletAddress.toLowerCase(),
            userId: session.user.id,
            metadata: metadata || null,
            imageUrl: imageUrl || null,
            traits: traits || null,
          },
        });

        userNFTs.push(nft);
      } catch (error) {
        console.error(`Error procesando NFT ${i}:`, error);
        continue;
      }
    }

    return NextResponse.json({ 
      message: `Sincronizados ${userNFTs.length} NFTs`, 
      nfts: userNFTs 
    });

  } catch (error) {
    console.error('Error sincronizando NFTs:', error);
    return NextResponse.json({ 
      error: 'Error interno del servidor' 
    }, { status: 500 });
  }
}
