import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

// NFTs simulados para pruebas
const mockNFTs = [
  {
    id: '1',
    tokenId: '123',
    contractAddress: '0x1234567890123456789012345678901234567890',
    ownerAddress: '0x1234567890123456789012345678901234567890',
    metadata: JSON.stringify({
      name: 'PrimaCult #123',
      description: 'Un NFT de prueba',
      image: 'https://via.placeholder.com/400x400/1322D3/FFFFFF?text=PrimaCult+123',
      attributes: [
        { trait_type: 'Background', value: 'Blue' },
        { trait_type: 'Fur', value: 'White' },
        { trait_type: 'Eyes', value: 'Happy' }
      ]
    }),
    imageUrl: 'https://via.placeholder.com/400x400/1322D3/FFFFFF?text=PrimaCult+123',
    traits: JSON.stringify([
      { trait_type: 'Background', value: 'Blue' },
      { trait_type: 'Fur', value: 'White' },
      { trait_type: 'Eyes', value: 'Happy' }
    ])
  },
  {
    id: '2',
    tokenId: '456',
    contractAddress: '0x1234567890123456789012345678901234567890',
    ownerAddress: '0x1234567890123456789012345678901234567890',
    metadata: JSON.stringify({
      name: 'PrimaCult #456',
      description: 'Otro NFT de prueba',
      image: 'https://via.placeholder.com/400x400/FF6B6B/FFFFFF?text=PrimaCult+456',
      attributes: [
        { trait_type: 'Background', value: 'Red' },
        { trait_type: 'Fur', value: 'Black' },
        { trait_type: 'Eyes', value: 'Laser' }
      ]
    }),
    imageUrl: 'https://via.placeholder.com/400x400/FF6B6B/FFFFFF?text=PrimaCult+456',
    traits: JSON.stringify([
      { trait_type: 'Background', value: 'Red' },
      { trait_type: 'Fur', value: 'Black' },
      { trait_type: 'Eyes', value: 'Laser' }
    ])
  },
  {
    id: '3',
    tokenId: '789',
    contractAddress: '0x1234567890123456789012345678901234567890',
    ownerAddress: '0x1234567890123456789012345678901234567890',
    metadata: JSON.stringify({
      name: 'PrimaCult #789',
      description: 'Tercer NFT de prueba',
      image: 'https://via.placeholder.com/400x400/4ECDC4/FFFFFF?text=PrimaCult+789',
      attributes: [
        { trait_type: 'Background', value: 'Green' },
        { trait_type: 'Fur', value: 'Golden' },
        { trait_type: 'Eyes', value: 'Diamond' }
      ]
    }),
    imageUrl: 'https://via.placeholder.com/400x400/4ECDC4/FFFFFF?text=PrimaCult+789',
    traits: JSON.stringify([
      { trait_type: 'Background', value: 'Green' },
      { trait_type: 'Fur', value: 'Golden' },
      { trait_type: 'Eyes', value: 'Diamond' }
    ])
  }
];

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.walletAddress) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Por ahora retornamos NFTs simulados
    // Más adelante se conectará con la base de datos real
    return NextResponse.json({ nfts: mockNFTs });
  } catch (error) {
    console.error('Error obteniendo NFTs:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.walletAddress) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { tokenId, contractAddress, metadata, imageUrl, traits } = await request.json();
    const walletAddress = session.user.walletAddress as string;

    // Por ahora solo simulamos la creación/actualización
    // Más adelante se guardará en la base de datos real
    const newNFT = {
      id: Date.now().toString(),
      tokenId,
      contractAddress,
      ownerAddress: walletAddress.toLowerCase(),
      metadata: metadata || null,
      imageUrl: imageUrl || null,
      traits: traits || null,
    };

    return NextResponse.json({ nft: newNFT, message: 'NFT creado/actualizado correctamente' });
  } catch (error) {
    console.error('Error creando/actualizando NFT:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
