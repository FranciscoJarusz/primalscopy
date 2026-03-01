import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { CONTRACTS, SUPPORTED_NETWORKS, switchToNetwork } from '../config/contracts';

export default function NetworkSwitcher() {
  const { address, isConnected } = useAccount();
  const [showWarning, setShowWarning] = useState(false);
  const [currentChainId, setCurrentChainId] = useState<number | null>(null);

  const targetChainId = CONTRACTS.PRIMACULT_NFT.chainId;
  
  // Detectar la red actual manualmente
  useEffect(() => {
    const detectNetwork = async () => {
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          const chainId = await (window as any).ethereum.request({ method: 'eth_chainId' });
          const numericChainId = parseInt(chainId, 16);
          setCurrentChainId(numericChainId);
          
          console.log('🔍 Red detectada:', {
            current: numericChainId,
            target: targetChainId,
            isConnected,
            shouldShowWarning: isConnected && numericChainId !== targetChainId
          });
          
          if (isConnected && numericChainId !== targetChainId) {
            setShowWarning(true);
          } else {
            setShowWarning(false);
          }
        } catch (error) {
          console.error('Error detecting network:', error);
        }
      }
    };

    if (isConnected) {
      detectNetwork();
    }
    
    // Escuchar cambios de red
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const handleChainChanged = (chainId: string) => {
        const numericChainId = parseInt(chainId, 16);
        setCurrentChainId(numericChainId);
        
        console.log('🔄 Red cambiada:', {
          newChainId: numericChainId,
          targetChainId,
          isConnected
        });
        
        if (isConnected && numericChainId !== targetChainId) {
          setShowWarning(true);
        } else {
          setShowWarning(false);
        }
      };

      (window as any).ethereum.on('chainChanged', handleChainChanged);
      
      return () => {
        (window as any).ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [isConnected, targetChainId]);

  const handleSwitchNetwork = async () => {
    try {
      console.log('🔄 Intentando cambiar a ApeChain...');
      await switchToNetwork(targetChainId);
    } catch (error) {
      console.error('Error switching network:', error);
    }
  };

  if (!showWarning) return null;

  return (
    <div className="fixed top-4 left-4 bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 max-w-sm backdrop-blur-sm z-50">
      <div className="flex items-center gap-3">
        <div className="text-yellow-400 text-xl">⚠️</div>
        <div>
          <div className="text-yellow-300 font-semibold">Red incorrecta</div>
          <div className="text-yellow-200 text-sm">
            Red actual: {currentChainId ? SUPPORTED_NETWORKS[currentChainId]?.name || `Chain ID ${currentChainId}` : 'Desconocida'}
          </div>
          <div className="text-yellow-200 text-sm">
            Necesitas cambiar a {SUPPORTED_NETWORKS[targetChainId].name}
          </div>
          <button
            onClick={handleSwitchNetwork}
            className="bg-yellow-600 hover:bg-yellow-700 px-3 py-1 rounded text-white text-xs mt-2 transition-all duration-200"
          >
            Cambiar a ApeChain
          </button>
        </div>
      </div>
    </div>
  );
}
