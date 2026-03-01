'use client';

import { createWeb3Modal } from '@web3modal/wagmi/react';
import { config as wagmiConfig, projectId } from './wagmi';
import { mainnet, sepolia } from 'wagmi/chains';

// Inicializa Web3Modal lo antes posible en el árbol cliente
if (typeof window !== 'undefined' && projectId && !(window as any).__W3M_INITIALIZED__) {
  createWeb3Modal({
    wagmiConfig,
    projectId,
    enableAnalytics: false,
    chains: [mainnet, sepolia]
  });
  (window as any).__W3M_INITIALIZED__ = true;
}




