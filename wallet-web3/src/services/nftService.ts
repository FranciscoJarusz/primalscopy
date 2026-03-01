import { CONTRACTS } from '../config/contracts';

export interface NFT {
  id: string;
  tokenId: string;
  contractAddress: string;
  ownerAddress: string;
  metadata?: string;
  imageUrl?: string;
  traits?: any[];
  name?: string;
  description?: string;
}

export class NFTService {
  private static readonly PRIMACULT_CONTRACT_ADDRESS = CONTRACTS.PRIMACULT_NFT.address;
  
  // Obtener NFTs de PrimaCult de la wallet del usuario
  static async getUserNFTs(userAddress: string): Promise<NFT[]> {
    try {
      // Verificar que tenemos acceso a ethereum
      if (typeof window === 'undefined' || !(window as any).ethereum) {
        throw new Error('MetaMask no está disponible');
      }

      const ethereum = (window as any).ethereum;
      
      // Verificar que estamos en la red correcta
      const currentNetwork = await ethereum.request({ method: 'eth_chainId' });
      const expectedChainId = `0x${CONTRACTS.PRIMACULT_NFT.chainId.toString(16)}`;
      
      if (currentNetwork !== expectedChainId) {
        throw new Error(`Red incorrecta. Esperada: ${CONTRACTS.PRIMACULT_NFT.chainId}, Actual: ${parseInt(currentNetwork, 16)}`);
      }
      
      // Obtener el balance de NFTs del usuario
      const balance = await ethereum.request({
        method: 'eth_call',
        params: [{
          to: this.PRIMACULT_CONTRACT_ADDRESS,
          data: '0x18160ddd' // balanceOf() function selector
        }, 'latest']
      });

      const nftCount = parseInt(balance, 16);
      const userNFTs: NFT[] = [];

      // Obtener cada NFT individual
      for (let i = 0; i < nftCount; i++) {
        try {
          // Obtener el token ID del índice i
          const tokenIdResponse = await ethereum.request({
            method: 'eth_call',
            params: [{
              to: this.PRIMACULT_CONTRACT_ADDRESS,
              data: `0x4f6ccce7${i.toString(16).padStart(64, '0')}` // tokenOfOwnerByIndex(index)
            }, 'latest']
          });

          const tokenId = parseInt(tokenIdResponse, 16).toString();
          
          // Obtener el token URI
          const tokenURIResponse = await ethereum.request({
            method: 'eth_call',
            params: [{
              to: this.PRIMACULT_CONTRACT_ADDRESS,
              data: `0xc87b56dd${parseInt(tokenId).toString(16).padStart(64, '0')}` // tokenURI(tokenId)
            }, 'latest']
          });

          // Decodificar el token URI
          const tokenURI = this.decodeString(tokenURIResponse);
          
          // Obtener los metadatos del NFT
          let metadata: any = {};
          let imageUrl = '';
          
          if (tokenURI) {
            try {
              const metadataResponse = await fetch(tokenURI);
              metadata = await metadataResponse.json();
              imageUrl = metadata.image || '';
            } catch (error) {
              console.warn(`No se pudieron obtener los metadatos para el token ${tokenId}:`, error);
            }
          }

          userNFTs.push({
            id: tokenId,
            tokenId,
            contractAddress: this.PRIMACULT_CONTRACT_ADDRESS,
            ownerAddress: userAddress,
            metadata: JSON.stringify(metadata),
            imageUrl,
            traits: metadata.attributes || [],
            name: metadata.name || `PrimaCult #${tokenId}`,
            description: metadata.description || ''
          });

        } catch (error) {
          console.warn(`Error obteniendo el NFT en el índice ${i}:`, error);
        }
      }

      return userNFTs;

    } catch (error) {
      console.error('Error obteniendo NFTs del usuario:', error);
      throw error;
    }
  }

  // Función auxiliar para decodificar strings de Ethereum
  private static decodeString(hexString: string): string {
    if (!hexString || hexString === '0x') return '';
    
    // Remover el prefijo 0x si existe
    const hex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
    
    // Los primeros 64 caracteres (32 bytes) contienen la longitud del string
    const lengthHex = hex.slice(0, 64);
    const length = parseInt(lengthHex, 16);
    
    // El resto contiene el string en hex
    const stringHex = hex.slice(64, 64 + length * 2);
    
    // Convertir hex a string
    let result = '';
    for (let i = 0; i < stringHex.length; i += 2) {
      result += String.fromCharCode(parseInt(stringHex.substr(i, 2), 16));
    }
    
    return result;
  }

  // Función para obtener NFTs simulados (fallback)
  static getMockNFTs(): NFT[] {
    return [
      {
        id: '1',
        tokenId: '123',
        contractAddress: CONTRACTS.PRIMACULT_NFT.address,
        ownerAddress: '0x1234567890123456789012345678901234567890',
        imageUrl: 'https://via.placeholder.com/400x400/1322D3/FFFFFF?text=PrimaCult+123',
        traits: [
          { trait_type: 'Background', value: 'Blue' },
          { trait_type: 'Fur', value: 'White' },
          { trait_type: 'Eyes', value: 'Happy' }
        ]
      },
      {
        id: '2',
        tokenId: '456',
        contractAddress: CONTRACTS.PRIMACULT_NFT.address,
        ownerAddress: '0x1234567890123456789012345678901234567890',
        imageUrl: 'https://via.placeholder.com/400x400/FF6B6B/FFFFFF?text=PrimaCult+456',
        traits: [
          { trait_type: 'Background', value: 'Red' },
          { trait_type: 'Fur', value: 'Black' },
          { trait_type: 'Eyes', value: 'Laser' }
        ]
      },
      {
        id: '3',
        tokenId: '789',
        contractAddress: CONTRACTS.PRIMACULT_NFT.address,
        ownerAddress: '0x1234567890123456789012345678901234567890',
        imageUrl: 'https://via.placeholder.com/400x400/4ECDC4/FFFFFF?text=PrimaCult+789',
        traits: [
          { trait_type: 'Background', value: 'Green' },
          { trait_type: 'Fur', value: 'Golden' },
          { trait_type: 'Eyes', value: 'Diamond' }
        ]
      }
    ];
  }

  // Función para verificar si un NFT pertenece al usuario
  static async verifyNFTOwnership(tokenId: string, userAddress: string): Promise<boolean> {
    try {
      if (typeof window === 'undefined' || !(window as any).ethereum) {
        return false;
      }

      const ethereum = (window as any).ethereum;
      
      // Obtener el propietario del NFT
      const ownerResponse = await ethereum.request({
        method: 'eth_call',
        params: [{
          to: this.PRIMACULT_CONTRACT_ADDRESS,
          data: `0x6352211e${parseInt(tokenId).toString(16).padStart(64, '0')}` // ownerOf(tokenId)
        }, 'latest']
      });

      const owner = `0x${ownerResponse.slice(26)}`; // Remover padding y convertir a dirección
      return owner.toLowerCase() === userAddress.toLowerCase();

    } catch (error) {
      console.error('Error verificando propiedad del NFT:', error);
      return false;
    }
  }
}

