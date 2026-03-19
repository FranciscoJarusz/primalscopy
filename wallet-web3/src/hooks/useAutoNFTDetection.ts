import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useUserNFTs } from './useUserNFTs';

interface AutoDetectionState {
  hasDetected: boolean;
  isFirstConnection: boolean;
  detectionComplete: boolean;
}

export const useAutoNFTDetection = () => {
  const { address, isConnected } = useAccount();
  const { nfts, isLoading, error, balance } = useUserNFTs();
  const [detectionState, setDetectionState] = useState<AutoDetectionState>({
    hasDetected: false,
    isFirstConnection: false,
    detectionComplete: false
  });

  useEffect(() => {
    // Cuando el usuario se conecta por primera vez
    if (isConnected && address && !detectionState.hasDetected) {
      setDetectionState(prev => ({
        ...prev,
        hasDetected: true,
        isFirstConnection: true
      }));
      
      console.log('🔍 Starting automatic NFT detection for:', address);
    }

    // Cuando la detección se completa
    if (detectionState.hasDetected && !isLoading && !error) {
      setDetectionState(prev => ({
        ...prev,
        detectionComplete: true,
        isFirstConnection: false
      }));
      
      console.log(`✅ Detection complete: ${nfts.length} NFTs found`);
    }

    // Resetear cuando se desconecta
    if (!isConnected) {
      setDetectionState({
        hasDetected: false,
        isFirstConnection: false,
        detectionComplete: false
      });
    }
  }, [isConnected, address, isLoading, error, nfts.length, detectionState.hasDetected]);

  return {
    ...detectionState,
    nfts,
    isLoading,
    error,
    balance,
    isConnected
  };
};

