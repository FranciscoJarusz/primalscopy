import React from 'react';

interface WelcomeNFTsProps {
  nftsFound: number;
  address: string;
  onDismiss: () => void;
}

export default function WelcomeNFTs({ nftsFound, address, onDismiss }: WelcomeNFTsProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gradient-to-br from-blue-900/90 to-purple-900/90 border border-white/20 rounded-3xl p-8 max-w-md mx-4 backdrop-blur-sm">
        <div className="text-center">
          {/* Animación de celebración */}
          <div className="text-6xl mb-4 animate-bounce">🎉</div>
          
          <h2 className="text-3xl font-bold text-white mb-4">
            ¡NFTs Detectados!
          </h2>
          
          <p className="text-blue-200 text-lg mb-6">
            Se encontraron <span className="text-yellow-300 font-bold">{nftsFound}</span> NFT{nftsFound !== 1 ? 's' : ''} en tu wallet
          </p>
          
          <div className="bg-white/10 rounded-xl p-4 mb-6">
            <div className="text-sm text-white/60 mb-2">Wallet conectada:</div>
            <div className="font-mono text-blue-300">
              {address.slice(0, 6)}...{address.slice(-4)}
            </div>
          </div>
          
          <div className="text-white/70 text-sm mb-6">
            Ahora puedes seleccionar cualquier NFT para personalizarlo en el Wardrobe
          </div>
          
          <button
            onClick={onDismiss}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-3 px-8 rounded-xl transition-all duration-200 transform hover:scale-105"
          >
            ¡Empezar a Personalizar!
          </button>
        </div>
      </div>
    </div>
  );
}

