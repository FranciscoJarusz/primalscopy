// src/context/Web3ModalProvider.tsx
"use client";

import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react';
import { WagmiProvider } from 'wagmi';
import { polygon, mainnet, arbitrum } from 'viem/chains'; // Importa las cadenas que necesites
import { ReactNode } from 'react';

// 1. Obtén tu projectId en https://cloud.walletconnect.com
const projectId = 'TU_PROJECT_ID_DE_WALLETCONNECT';

// 2. Crea los metadatos de tu dApp
const metadata = {
  name: 'Mi dApp de NFTs',
  description: 'Una aplicación para mostrar mis NFTs',
  url: 'https://mi-dapp.com', // Reemplaza con la URL de tu dApp
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

// 3. Define las cadenas (chains) que soportará tu dApp
const chains = [mainnet, polygon, arbitrum] as const;

// 4. Crea la configuración de Wagmi
const wagmiConfig = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
  // Opcional: habilita la reconexión automática
  // enableCoinbase: true, 
  // enableInjected: true,
  // enableEIP6963: true,
});

// 5. Crea el Modal
createWeb3Modal({
  wagmiConfig: wagmiConfig,
  projectId,
  chains,
  themeMode: 'light', // Puedes elegir 'light' o 'dark'
});

export function Web3ModalProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      {children}
    </WagmiProvider>
  );
}