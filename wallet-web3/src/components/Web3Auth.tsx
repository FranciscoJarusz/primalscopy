// src/components/Web3Auth.tsx

'use client';

import React, { useEffect, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWeb3Modal } from '@web3modal/wagmi/react';
import { useAccount, useDisconnect } from 'wagmi';

export default function Web3Auth() {
  const router = useRouter();
  const { open } = useWeb3Modal();
  const { disconnect } = useDisconnect();
  const { isConnected, isConnecting, address } = useAccount();

  useLayoutEffect(() => {
    // La pantalla principal es el único punto donde se cierra completamente la sesión.
    disconnect();
  }, [disconnect]);

  // EFECTO DE REDIRECCIÓN AUTOMÁTICA
  // Se ejecuta cuando el estado de `isConnected` cambia.
  useEffect(() => {
    if (isConnected && address) {
      console.log("Wallet conectada. Redirigiendo al selector de NFTs...");
      router.push('/selector-nft');
    }
  }, [isConnected, address, router]);

  return (
    <main className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] flex items-center justify-center p-4">
      <div className="relative">
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 z-10">
          <div className="w-24 h-24 bg-[#000000] rounded-full flex items-center justify-center">
            <img src="/logo.png" alt="PrimaCult Logo" className="w-20 h-20 object-contain"/>
          </div>
        </div>
        
        <div className="flex flex-col gap-6 bg-[#1322D3] p-12 rounded-3xl shadow-2xl text-center max-w-2xl w-full">
          <h1 className="text-4xl font-bold text-white ">Prima Cult</h1>
          <p className="text-white text-0.5xl ">Wardrobe <span className="text-sky-300">(BETA)</span></p>
          <p className="text-white font-bold text-2xl">Log In</p>
          <p className="text-blue-200 text-md">You must connect your wallet to continue</p>
          
          <button
            onClick={() => open()}
            disabled={isConnecting}
            className="bg-white hover:scale-105 text-blue-600 font-bold py-4 px-12 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        </div>
      </div>
    </main>
  );
}