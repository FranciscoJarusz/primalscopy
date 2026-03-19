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

const extractTokenId = (item: any): string | null => {
  const candidate = item?.result ?? item?.value ?? item;

  if (typeof candidate === 'bigint' || typeof candidate === 'number') {
    return String(candidate);
  }

  if (typeof candidate === 'string') {
    return candidate;
  }

  if (candidate && typeof candidate === 'object') {
    if (typeof candidate.hex === 'string') {
      return BigInt(candidate.hex).toString();
    }
    if (typeof candidate._hex === 'string') {
      return BigInt(candidate._hex).toString();
    }
  }

  return null;
};

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

  const loadNftMetadata = useCallback(async (tokenId: string) => {
    try {
      const response = await fetch(`/api/user/nft-metadata?tokenId=${tokenId}`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
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
      console.warn(`⚠️ Error al obtener token IDs por wagmi: ${tokenIdsError.message}`);
    }

    // Cargar NFTs directamente desde ApeChain
    if (balance > 0 && !balanceLoading && !tokenIdsLoading) {
      const processNfts = async () => {
        try {

          console.log(`🔄 Cargando NFTs para ${address}... (balance=${balance})`);
          
          // ESTRATEGIA: Usar el endpoint directamente, que es más confiable
          const apechainNFTs = await loadNFTsFromApeChain(address);
          
          if (apechainNFTs && apechainNFTs.length > 0) {
            console.log(`✅ NFTs obtenidos del endpoint: ${apechainNFTs.length}`, apechainNFTs);
            
            // Formatear NFTs
            const formattedNfts: Nft[] = apechainNFTs.map((nft: any) => ({
              id: nft.tokenId || nft.id,
              tokenId: String(nft.tokenId || nft.id),
              name: nft.name || `PrimaCult #${nft.tokenId || nft.id}`,
              imageUrl: nft.imageUrl || nft.image,
              metadata: nft.metadata ? (typeof nft.metadata === 'string' ? JSON.parse(nft.metadata) : nft.metadata) : undefined
            }));

            setNfts(formattedNfts);
            setLastFetchedAddress(address);
            console.log(`✅ ${formattedNfts.length} NFTs disponibles para ${address}`, formattedNfts);
          } else {
            console.warn(`⚠️ Endpoint sin NFTs, usando fallback de token IDs de wagmi`);

            const tokenIds = (tokenIdsData || [])
              .map((item: any) => extractTokenId(item))
              .filter((value: string | null): value is string => Boolean(value));

            const uniqueTokenIds = Array.from(new Set(tokenIds));

            if (uniqueTokenIds.length > 0) {
              const metadataResults = await Promise.all(uniqueTokenIds.map((tokenId) => loadNftMetadata(tokenId)));

              const fallbackNfts: Nft[] = uniqueTokenIds.map((tokenId, index) => {
                const metadataResult = metadataResults[index];
                return {
                  id: tokenId,
                  tokenId,
                  name: metadataResult?.name || `PrimaCult #${tokenId}`,
                  imageUrl: metadataResult?.imageUrl || '',
                  metadata: metadataResult?.metadata,
                };
              });

              setNfts(fallbackNfts);
              setLastFetchedAddress(address);
              console.log(`✅ NFTs cargados por fallback wagmi: ${fallbackNfts.length}`, fallbackNfts);
            } else {
              setNfts([]);
            }
          }
        } catch (error) {
          console.error('Error cargando NFTs:', error);
          setError('Error al cargar los NFTs');
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
    loadNFTsFromApeChain,
    loadNftMetadata
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
      const result = await response.json();

      if (!response.ok) {
        console.error(`Error verificando NFT #${tokenId}:`, result);
        return {
          ok: false,
          tokenId,
          address,
          error: result?.error || 'No se pudo verificar el NFT',
        };
      }

      console.log(`🔍 Verificación manual NFT #${tokenId}:`, result);
      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      console.error(`Error verificando NFT #${tokenId}:`, error);
    }
    return {
      ok: false,
      tokenId,
      address,
      error: 'Error de red al verificar el NFT',
    };
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


