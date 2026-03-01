'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useAccount, useDisconnect } from 'wagmi';

interface NFT {
  id: string;
  tokenId: string;
  contractAddress: string;
  ownerAddress: string;
  metadata?: string;
  imageUrl?: string;
  traits?: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const router = useRouter();

  const [userNFTs, setUserNFTs] = useState<NFT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirigir si no está autenticado
  useEffect(() => {
    if (status === 'loading') return;

    if (!session || !isConnected) {
      router.push('/');
      return;
    }
  }, [session, status, isConnected, router]);

  // Cargar NFTs del usuario
  useEffect(() => {
    if (!session) return;

    const fetchUserNFTs = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/user/nfts');

        if (!response.ok) {
          throw new Error('Error al cargar NFTs');
        }

        const data = await response.json();
        setUserNFTs(data.nfts || []);
      } catch (err) {
        console.error('Error cargando NFTs:', err);
        setError('Error al cargar tus NFTs');
      } finally {
        setLoading(false);
      }
    };

    fetchUserNFTs();
  }, [session]);

  // Función para desconectar completamente
  const handleDisconnect = async () => {
    await signOut();
    disconnect();
    router.push('/');
  };

  // Función para ir al customizador
  const goToCustomizer = (nftId: string) => {
    router.push(`/customizer/${nftId}`);
  };

  // Función para acortar dirección
  const shortenAddress = (addr: string) => `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] flex items-center justify-center">
        <div className="text-white text-2xl">Cargando...</div>
      </div>
    );
  }

  if (!session || !isConnected) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746]">
      {/* Header */}
      <header className="bg-[#1322D3]/80 backdrop-blur-sm p-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <img src="/logo.png" alt="PrimaCult Logo" className="w-12 h-12" />
            <h1 className="text-3xl font-bold text-white">PrimaCult Dashboard</h1>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-white">
              <p className="text-sm text-blue-200">Wallet Conectada</p>
              <p className="font-mono">{address ? shortenAddress(address) : ''}</p>
            </div>
            <button
              onClick={handleDisconnect}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Desconectar
            </button>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-4">
            Mis NFTs
          </h2>
          <p className="text-blue-200 text-lg">
            Selecciona un NFT para personalizarlo en el Wardrobe
          </p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-200 p-4 rounded-xl mb-6">
            {error}
          </div>
        )}

        {userNFTs.length === 0 ? (
          <div className="bg-[#1322D3]/50 p-8 rounded-2xl text-center">
            <h3 className="text-2xl font-bold text-white mb-4">
              No tienes NFTs aún
            </h3>
            <p className="text-blue-200 mb-6">
              Una vez que adquieras NFTs de PrimaCult, aparecerán aquí para que puedas personalizarlos.
            </p>
            <button
              onClick={() => router.push('/')}
              className="bg-white text-blue-600 px-6 py-3 rounded-xl font-semibold hover:bg-gray-100 transition-colors"
            >
              Volver al Inicio
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {userNFTs.map((nft) => (
              <div
                key={nft.id}
                className="bg-[#1322D3]/50 p-6 rounded-2xl hover:bg-[#1322D3]/70 transition-all duration-300 cursor-pointer transform hover:scale-105"
                onClick={() => goToCustomizer(nft.tokenId)}
              >
                <div className="aspect-square bg-gray-800 rounded-xl mb-4 flex items-center justify-center">
                  {nft.imageUrl ? (
                    <img
                      src={nft.imageUrl}
                      alt={`NFT #${nft.tokenId}`}
                      className="w-full h-full object-cover rounded-xl"
                    />
                  ) : (
                    <div className="text-gray-400 text-4xl">#{nft.tokenId}</div>
                  )}
                </div>

                <div className="text-center">
                  <h3 className="text-xl font-bold text-white mb-2">
                    PrimaCult #{nft.tokenId}
                  </h3>
                  <p className="text-blue-200 text-sm mb-4">
                    Token ID: {nft.tokenId}
                  </p>

                  <button className="w-full bg-white text-blue-600 py-2 px-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
                    Personalizar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
