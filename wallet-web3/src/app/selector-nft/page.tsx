// src/app/selector-nft/page.tsx (Versión mejorada con detección automática)

'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useDisconnect } from 'wagmi';
import { useUserNFTs } from '../../hooks/useUserNFTs';
import { useAutoNFTDetection } from '../../hooks/useAutoNFTDetection';
import NFTDetectionStatus from '../../components/NFTDetectionStatus';
import WelcomeNFTs from '../../components/WelcomeNFTs';
import NetworkSwitcher from '../../components/NetworkSwitcher';

interface NftVerificationResult {
  ok: boolean;
  tokenId: string;
  address?: string;
  owner?: string;
  balance?: number;
  isOwner?: boolean;
  error?: string;
}

export default function SelectorPage() {
  const router = useRouter();
  const { disconnect } = useDisconnect();
  const [isHovered, setIsHovered] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'id' | 'name'>('id');
  const [verificationResult, setVerificationResult] = useState<NftVerificationResult | null>(null);

  const { address, status } = useAccount();
  const { nfts, isLoading, error, balance, refreshNfts, checkSpecificNFT, isConnected } = useUserNFTs();
  const { isFirstConnection, detectionComplete } = useAutoNFTDetection();
  const [showWelcome, setShowWelcome] = useState(false);
  const customizerBase = process.env.NEXT_PUBLIC_CUSTOMIZER_URL || 'http://localhost:3000';

  useEffect(() => {
    if (status !== 'disconnected') {
      return;
    }

    // Durante F5 o navegación hacia atrás puede haber un estado transient de desconexión.
    const timeoutId = setTimeout(() => {
      if (status === 'disconnected') {
        console.log("Usuario no conectado, redirigiendo al inicio...");
        router.push('/');
      }
    }, 1200);

    return () => clearTimeout(timeoutId);
  }, [status, router]);

  // Filtrar y ordenar NFTs
  const filteredAndSortedNfts = useMemo(() => {
    let filtered = nfts;

    // Filtrar por término de búsqueda
    if (searchTerm) {
      filtered = filtered.filter(nft =>
        nft.tokenId.includes(searchTerm) ||
        nft.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Ordenar
    filtered.sort((a, b) => {
      if (sortBy === 'id') {
        return parseInt(a.tokenId) - parseInt(b.tokenId);
      } else {
        return (a.name || '').localeCompare(b.name || '');
      }
    });

    return filtered;
  }, [nfts, searchTerm, sortBy]);

  const handleSelectNft = (tokenId: string) => {
    if (process.env.NODE_ENV === 'production' || customizerBase.includes(window.location.hostname)) {
      router.push(`/customizer?tokenId=${tokenId}`);
    } else {
      window.location.href = `${customizerBase}/customizer?tokenId=${tokenId}`;
    }
  };

  const handleDisconnect = () => {
    disconnect();
    router.push('/');
  };

  const handleRefresh = () => {
    setVerificationResult(null);
    refreshNfts();
  };

  // Mostrar bienvenida cuando se detecten NFTs por primera vez
  // DESHABILITADO: Modal de bienvenida eliminado
  // useEffect(() => {
  //   if (detectionComplete && nfts.length > 0 && !showWelcome) {
  //     setShowWelcome(true);
  //   }
  // }, [detectionComplete, nfts.length, showWelcome]);

  // Función para verificar NFT específico manualmente
  const handleCheckNFT = async (tokenId: string) => {
    if (address) {
      console.log(`🔍 Verificando NFT #${tokenId} manualmente...`);
      const result = await checkSpecificNFT(tokenId);
      if (result) {
        setVerificationResult(result);
      }
    }
  };

  const nftToVerify = nfts[0]?.tokenId || '56';

  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-2xl text-blue-200">Connecting wallet...</div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] text-white px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Componente de estado de detección */}
      <NFTDetectionStatus
        isLoading={isLoading}
        balance={balance}
        nftsFound={nfts.length}
        error={error}
        address={address}
      />

      {/* Modal de bienvenida - DESHABILITADO */}
      {/* {showWelcome && address && (
        <WelcomeNFTs
          nftsFound={nfts.length}
          address={address}
          onDismiss={() => setShowWelcome(false)}
        />
      )} */}

      {/* Network Switcher */}
      <NetworkSwitcher />



      <div className="max-w-6xl mx-auto min-h-[calc(100vh-8rem)] flex flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col justify-center gap-6">
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Select your NFT
            </h1>
            <p className="text-lg sm:text-xl text-blue-200 mt-2 max-w-2xl">
              Choose the character you want to modify in the Wardrobe
            </p>
            {isConnected && address && (
              <div className="text-sm text-white/60 mt-1">
                Wallet: {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 disabled:transform-none text-sm sm:text-base"
            >
              {isLoading ? '🔄' : '🔄'} Refresh
            </button>
            <button
              onClick={() => handleCheckNFT(nftToVerify)}
              className="bg-purple-600 hover:bg-purple-700 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 text-sm sm:text-base"
            >
              🔍 Verify NFT #{nftToVerify}
            </button>
            <button
              onClick={() => {
                router.push('/customizer?tokenId=1292');
              }}
              className="bg-green-600 hover:bg-green-700 px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 text-sm sm:text-base"
            >
              Try with NFT #1292
            </button>
            <button
              onClick={handleDisconnect}
              className="bg-red-600 hover:bg-red-700 px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 text-sm sm:text-base"
            >
              Disconnect
            </button>
          </div>

          {verificationResult && (
            <div className={`rounded-2xl border p-4 sm:p-5 max-w-xl ${verificationResult.ok ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-red-500/10 border-red-500/40'}`}>
              <div className={`font-semibold text-base sm:text-lg mb-2 ${verificationResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                {verificationResult.ok ? `NFT #${verificationResult.tokenId} verificado` : `No se pudo verificar el NFT #${verificationResult.tokenId}`}
              </div>
              {verificationResult.ok ? (
                <div className="space-y-1 text-sm sm:text-base text-white/85">
                  <div>Owner: {verificationResult.owner}</div>
                  <div>Your wallet: {verificationResult.address}</div>
                  <div>Are you the owner?: {verificationResult.isOwner ? 'YES' : 'NO'}</div>
                  <div>Total balance: {verificationResult.balance} NFTs</div>
                </div>
              ) : (
                <div className="text-sm sm:text-base text-red-200">{verificationResult.error || 'Error desconocido al verificar el NFT.'}</div>
              )}
            </div>
          )}
        </div>

        {/* Controles de búsqueda y filtros */}
        {!isLoading && !error && nfts.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6">
            <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
              <div className="flex-1 w-full">
                <input
                  type="text"
                  placeholder="Search by token ID or name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-blue-500 transition-all duration-200"
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 lg:flex-none">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'id' | 'name')}
                  className="min-w-[140px] bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all duration-200"
                >
                  <option value="id">Sort by ID</option>
                  <option value="name">Sort by Name</option>
                </select>
                <div className="text-sm text-white/60 whitespace-nowrap">
                  {filteredAndSortedNfts.length} of {nfts.length} NFTs
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Estado de carga y errores */}
        {isLoading && (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <div className="text-blue-200 text-xl">Detecting your NFTs...</div>
            <div className="text-white/60 text-sm mt-2">
              Detected balance: {balance} NFTs
            </div>
          </div>
        )}

        {error && (
          <div className="text-center py-16">
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-6 max-w-md mx-auto">
              <div className="text-red-400 text-lg mb-2">⚠️ Error</div>
              <div className="text-red-300 mb-4">{error}</div>
              <button
                onClick={handleRefresh}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-semibold transition-all duration-200"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* NFTs Grid */}
        {!isLoading && !error && (
          <>
            {nfts.length === 0 ? (
              <div className="flex flex-1 items-center justify-center py-10 text-center">
                <div className="bg-white/5 border border-white/10 rounded-xl p-8 max-w-md mx-auto">
                  <div className="text-6xl mb-4">🎭</div>
                  <div className="text-blue-200 text-xl mb-2">No NFTs found</div>
                  <div className="text-white/60 mb-4">This wallet has no NFTs from the Primal contract</div>
                  <div className="text-sm text-white/40">
                    Detected balance: {balance} NFTs
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <div className="inline-block bg-blue-500/20 border border-blue-500/50 rounded-full px-6 py-2">
                    <span className="text-blue-200 font-semibold">
                      {filteredAndSortedNfts.length} NFT{filteredAndSortedNfts.length !== 1 ? 's' : ''} found{filteredAndSortedNfts.length !== 1 ? 's' : ''}
                    </span>
                    {searchTerm && (
                      <span className="text-white/60 ml-2">
                        (filtered from {nfts.length})
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,220px))] justify-center gap-6">
                  {filteredAndSortedNfts.map((nft) => (
                    <div
                      key={nft.id}
                      className={`relative w-[220px] group cursor-pointer transition-all duration-300 transform hover:scale-105 ${isHovered === nft.id ? 'scale-105' : ''
                        }`}
                      onClick={() => handleSelectNft(nft.tokenId)}
                      onMouseEnter={() => setIsHovered(nft.id)}
                      onMouseLeave={() => setIsHovered(null)}
                    >
                      {/* Card principal */}
                      <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border border-white/20 rounded-2xl p-4 overflow-hidden">
                        {/* Imagen del NFT */}
                        <div className="aspect-square bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl mb-4 overflow-hidden relative">
                          {nft.imageUrl ? (
                            <img
                              src={nft.imageUrl}
                              alt={nft.name || `NFT #${nft.tokenId}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="text-6xl">🎭</div>
                            </div>
                          )}
                          {/* Overlay con número */}
                          <div className="absolute top-2 right-2 bg-black/60 text-white text-sm font-bold px-2 py-1 rounded-lg">
                            #{nft.tokenId}
                          </div>
                        </div>

                        {/* Información del NFT */}
                        <div className="text-center">
                          <h3 className="font-bold text-lg text-white mb-1">
                            {nft.name || `Primal #${nft.tokenId}`}
                          </h3>
                          <p className="text-blue-200 text-sm">Click to edit</p>
                        </div>
                      </div>

                      {/* Efecto de hover */}
                      {isHovered === nft.id && (
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl border-2 border-blue-400/50 pointer-events-none animate-pulse"></div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Mensaje si no hay resultados en la búsqueda */}
                {searchTerm && filteredAndSortedNfts.length === 0 && (
                  <div className="text-center py-8">
                    <div className="text-white/60">
                      No NFTs were found matching &quot;{searchTerm}&quot;
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
