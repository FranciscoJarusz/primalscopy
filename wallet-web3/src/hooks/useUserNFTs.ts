import { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { erc721Abi } from 'viem';
import { CONTRACTS } from '../config/contracts';

const NFT_CONTRACT_ADDRESS = CONTRACTS.PRIMACULT_NFT.address as `0x${string}`; // Contrato Primal Cult en ApeChain 

interface Nft { 
  id: string; 
  tokenId: string; 
  imageUrl?: string;
  name?: string;
  metadata?: any;
}

export const useUserNFTs = () => {
  const { address, isConnected } = useAccount();
  const [nfts, setNfts] = useState<Nft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAddress, setLastFetchedAddress] = useState<string | null>(null);

  // Verificar balance de NFTs
  const { data: balanceData, error: balanceError, isLoading: balanceLoading } = useReadContracts({
    contracts: [{ 
      address: NFT_CONTRACT_ADDRESS, 
      abi: erc721Abi, 
      functionName: 'balanceOf', 
      args: [address!] 
    }],
    query: { 
      enabled: isConnected && !!address,
      refetchInterval: 30000, // Refrescar cada 30 segundos
    },
  });
  
  const balance = balanceData ? Number(balanceData[0].result) : 0;
  
  // Crear contratos para obtener token IDs
  const tokenContracts = Array.from({ length: balance }).map((_, i) => ({
    address: NFT_CONTRACT_ADDRESS, 
    abi: erc721Abi, 
    functionName: 'tokenOfOwnerByIndex', 
    args: [address!, BigInt(i)]
  }));
  
  // Obtener token IDs
  const { 
    data: tokenIdsData, 
    error: tokenIdsError, 
    isLoading: tokenIdsLoading 
  } = useReadContracts({
    contracts: tokenContracts, 
    query: { 
      enabled: balance > 0 && isConnected && !!address,
      refetchInterval: 30000, // Refrescar cada 30 segundos
    },
  });

  // Función para cargar NFTs directamente desde ApeChain
  const loadNFTsFromApeChain = useCallback(async (userAddress: string) => {
    try {
      // Intentar primero con la API simple (más confiable)
      let response = await fetch(`/api/user/nfts-simple?address=${userAddress}`);
      
      // Si falla, usar la API optimizada como fallback
      if (!response.ok) {
        console.log('🔄 API simple falló, usando API optimizada...');
        response = await fetch(`/api/user/nfts-apechain-optimized?address=${userAddress}`);
      }
      
      // Si también falla, usar la API básica como último recurso
      if (!response.ok) {
        console.log('🔄 API optimizada falló, usando API básica...');
        response = await fetch(`/api/user/nfts-apechain?address=${userAddress}`);
      }
      
      if (response.ok) {
        const data = await response.json();
        return data.nfts || [];
      }
    } catch (error) {
      console.warn(`No se pudieron cargar NFTs desde ApeChain:`, error);
    }
    return [];
  }, []);

  // Efecto principal para manejar la carga de NFTs
  useEffect(() => {
    if (!isConnected || !address) {
      setNfts([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    // Si ya cargamos NFTs para esta dirección, no recargar
    if (lastFetchedAddress === address && nfts.length > 0) {
      return;
    }

    setIsLoading(true);
    setError(null);

    // Log detallado para debugging
    console.log('🔍 Iniciando detección de NFTs:', {
      address,
      isConnected,
      contractAddress: NFT_CONTRACT_ADDRESS,
      balance,
      balanceLoading,
      tokenIdsLoading,
      balanceError: balanceError?.message,
      tokenIdsError: tokenIdsError?.message,
      chainId: CONTRACTS.PRIMACULT_NFT.chainId,
      rpcUrl: 'https://rpc.apechain.com',
      timestamp: new Date().toISOString()
    });

    // Logs de depuración mejorados
    console.log('🔍 Detección de NFTs:', {
      address,
      isConnected,
      contractAddress: NFT_CONTRACT_ADDRESS,
      balance,
      balanceLoading,
      tokenIdsLoading,
      balanceError: balanceError?.message,
      tokenIdsError: tokenIdsError?.message
    });

    // Manejar errores
    if (balanceError) {
      setError(`Error al verificar balance: ${balanceError.message}`);
      setIsLoading(false);
      return;
    }

    if (tokenIdsError) {
      setError(`Error al obtener token IDs: ${tokenIdsError.message}`);
      setIsLoading(false);
      return;
    }

    // Cargar NFTs directamente desde ApeChain
    if (balance > 0 && !balanceLoading && !tokenIdsLoading) {
      const processNfts = async () => {
        try {
          console.log(`🔄 Cargando NFTs desde ApeChain para ${address}...`);
          const apechainNFTs = await loadNFTsFromApeChain(address);
          
          const formattedNfts: Nft[] = apechainNFTs.map((nft: any) => ({
            id: nft.tokenId,
            tokenId: nft.tokenId,
            name: nft.name || `PrimaCult #${nft.tokenId}`,
            imageUrl: nft.imageUrl,
            metadata: nft.metadata ? JSON.parse(nft.metadata) : undefined
          }));

          setNfts(formattedNfts);
          setLastFetchedAddress(address);
          
          console.log(`✅ NFTs cargados desde ApeChain: ${formattedNfts.length} NFTs para ${address}`);
        } catch (error) {
          console.error('Error cargando NFTs desde ApeChain:', error);
          setError('Error al cargar los NFTs desde ApeChain');
        } finally {
          setIsLoading(false);
        }
      };

      processNfts();
    } else if (!balanceLoading && !tokenIdsLoading) {
      // Si no hay NFTs o terminó la carga
      setIsLoading(false);
      if (balance === 0) {
        setNfts([]);
        console.log(`ℹ️ No se encontraron NFTs para la dirección ${address}`);
      }
    }
  }, [
    isConnected, 
    address, 
    balance, 
    tokenIdsData, 
    balanceLoading, 
    tokenIdsLoading, 
    balanceError, 
    tokenIdsError,
    lastFetchedAddress,
    nfts.length,
    loadNFTsFromApeChain
  ]);

  // Función para refrescar manualmente
  const refreshNfts = useCallback(() => {
    setLastFetchedAddress(null);
    setNfts([]);
    setError(null);
  }, []);

  // Función para verificar manualmente un NFT específico
  const checkSpecificNFT = useCallback(async (tokenId: string) => {
    try {
      const response = await fetch(`/api/check-nft-ownership?tokenId=${tokenId}&address=${address}`);
      if (response.ok) {
        const result = await response.json();
        console.log(`🔍 Verificación manual NFT #${tokenId}:`, result);
        return result;
      }
    } catch (error) {
      console.error(`Error verificando NFT #${tokenId}:`, error);
    }
    return null;
  }, [address]);

  return { 
    nfts, 
    isLoading: isLoading || balanceLoading || tokenIdsLoading, 
    error,
    balance,
    refreshNfts,
    checkSpecificNFT,
    isConnected 
  };
};


