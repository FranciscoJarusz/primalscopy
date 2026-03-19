import React, { useEffect, useState } from 'react';

interface NFTDetectionStatusProps {
  isLoading: boolean;
  balance: number;
  nftsFound: number;
  error: string | null;
  address?: string;
}

export default function NFTDetectionStatus({ 
  isLoading, 
  balance, 
  nftsFound, 
  error, 
  address 
}: NFTDetectionStatusProps) {
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (isLoading || error || nftsFound <= 0) {
      setShowSuccess(false);
      return;
    }

    setShowSuccess(true);
    const timeoutId = setTimeout(() => {
      setShowSuccess(false);
    }, 4000);

    return () => clearTimeout(timeoutId);
  }, [isLoading, error, nftsFound, address]);

  if (error) {
    return (
      <div className="fixed top-4 right-4 bg-red-500/20 border border-red-500/50 rounded-xl p-4 max-w-sm backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="text-red-400 text-xl">⚠️</div>
          <div>
            <div className="text-red-300 font-semibold">Detection Error</div>
            <div className="text-red-200 text-sm">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="fixed top-4 right-4 bg-blue-500/20 border border-blue-500/50 rounded-xl p-4 max-w-sm backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
          <div>
            <div className="text-blue-300 font-semibold">Detecting NFTs...</div>
            <div className="text-blue-200 text-sm">
              Balance: {balance} NFTs
            </div>
            {address && (
              <div className="text-blue-100 text-xs mt-1">
                {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (nftsFound > 0 && showSuccess) {
    return (
      <div className="fixed top-4 right-4 bg-green-500/20 border border-green-500/50 rounded-xl p-4 max-w-sm backdrop-blur-sm animate-in slide-in-from-right duration-300">
        <div className="flex items-center gap-3">
          <div className="text-green-400 text-xl">✅</div>
          <div>
            <div className="text-green-300 font-semibold">NFTs detected</div>
            <div className="text-green-200 text-sm">
              {nftsFound} NFT{nftsFound !== 1 ? 's' : ''} found
            </div>
            {address && (
              <div className="text-green-100 text-xs mt-1">
                {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (balance === 0) {
    return (
      <div className="fixed top-4 right-4 bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 max-w-sm backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="text-yellow-400 text-xl">ℹ️</div>
          <div>
            <div className="text-yellow-300 font-semibold">No NFTs</div>
            <div className="text-yellow-200 text-sm">
              No NFTs found in this wallet
            </div>
            {address && (
              <div className="text-yellow-100 text-xs mt-1">
                {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

