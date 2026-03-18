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

export default function SelectorPage() {
  const router = useRouter();
  const { disconnect } = useDisconnect();
  const [isHovered, setIsHovered] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'id' | 'name'>('id');

  const { address, status } = useAccount();
  const { nfts, isLoading, error, balance, refreshNfts, checkSpecificNFT, isConnected } = useUserNFTs();
  const { isFirstConnection, detectionComplete } = useAutoNFTDetection();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (status === 'disconnected') {
      console.log("Usuario no conectado, redirigiendo al inicio...");
      router.push('/');
    }
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
    
    const base = process.env.NEXT_PUBLIC_CUSTOMIZER_URL || 'http://localhost:3002';

    if (process.env.NODE_ENV === 'production' || base.includes(window.location.hostname)) {
      router.push(`/customizer?tokenId=${tokenId}`);
    } else {
      window.location.href = `${base}/customizer?tokenId=${tokenId}`;
    }
  };

  const handleDisconnect = () => {
    disconnect();
    router.push('/');
  };

  const handleRefresh = () => {
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
        alert(`Resultado de verificación NFT #${tokenId}:\n\nPropietario: ${result.owner}\nTu dirección: ${result.address}\n¿Eres propietario?: ${result.isOwner ? 'SÍ' : 'NO'}\nBalance total: ${result.balance} NFTs`);
      }
    }
  };

  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-2xl text-blue-200">Conectando wallet...</div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] text-white p-8">
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



      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Selecciona tu NFT
            </h1>
            <p className="text-xl text-blue-200 mt-2">
              Elige el personaje que quieres modificar en el Wardrobe
            </p>
            {isConnected && address && (
              <div className="text-sm text-white/60 mt-1">
                Wallet: {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 px-4 py-3 rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 disabled:transform-none"
            >
              {isLoading ? '🔄' : '🔄'} Refrescar
            </button>
            <button
              onClick={() => handleCheckNFT('56')}
              className="bg-purple-600 hover:bg-purple-700 px-4 py-3 rounded-xl font-semibold transition-all duration-200 transform hover:scale-105"
            >
              🔍 Verificar NFT #56
            </button>
            <button
              onClick={() => {
                const base = process.env.NEXT_PUBLIC_CUSTOMIZER_URL || 'http://localhost:3002';
                if (typeof window !== 'undefined') {
                  window.location.href = `${base}/?tokenId=1292`;
                } else {
                  router.push('/customizer?tokenId=1292');
                }
              }}
              className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl font-semibold transition-all duration-200 transform hover:scale-105"
            >
              Probar con NFT #1292
            </button>
            <button
              onClick={handleDisconnect}
              className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-xl font-semibold transition-all duration-200 transform hover:scale-105"
            >
              Desconectar
            </button>
          </div>
        </div>

        {/* Controles de búsqueda y filtros */}
        {!isLoading && !error && nfts.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8">
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Buscar por ID o nombre..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-4">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'id' | 'name')}
                  className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="id">Ordenar por ID</option>
                  <option value="name">Ordenar por Nombre</option>
                </select>
                <div className="text-sm text-white/60">
                  {filteredAndSortedNfts.length} de {nfts.length} NFTs
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Estado de carga y errores */}
        {isLoading && (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <div className="text-blue-200 text-xl">Detectando tus NFTs...</div>
            <div className="text-white/60 text-sm mt-2">
              Balance detectado: {balance} NFTs
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
                Intentar de nuevo
              </button>
            </div>
          </div>
        )}

        {/* NFTs Grid */}
        {!isLoading && !error && (
          <>
            {nfts.length === 0 ? (
              <div className="text-center py-16">
                <div className="bg-white/5 border border-white/10 rounded-xl p-8 max-w-md mx-auto">
                  <div className="text-6xl mb-4">🎭</div>
                  <div className="text-blue-200 text-xl mb-2">No se encontraron NFTs</div>
                  <div className="text-white/60 mb-4">Esta wallet no tiene NFTs del contrato Primal</div>
                  <div className="text-sm text-white/40">
                    Balance detectado: {balance} NFTs
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <div className="inline-block bg-blue-500/20 border border-blue-500/50 rounded-full px-6 py-2">
                    <span className="text-blue-200 font-semibold">
                      {filteredAndSortedNfts.length} NFT{filteredAndSortedNfts.length !== 1 ? 's' : ''} encontrado{filteredAndSortedNfts.length !== 1 ? 's' : ''}
                    </span>
                    {searchTerm && (
                      <span className="text-white/60 ml-2">
                        (filtrado de {nfts.length})
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {filteredAndSortedNfts.map((nft) => (
                    <div
                      key={nft.id}
                      className={`relative group cursor-pointer transition-all duration-300 transform hover:scale-105 ${isHovered === nft.id ? 'scale-105' : ''
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
                          <p className="text-blue-200 text-sm">Click para editar</p>
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
                      No se encontraron NFTs que coincidan con &quot;{searchTerm}&quot;
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
