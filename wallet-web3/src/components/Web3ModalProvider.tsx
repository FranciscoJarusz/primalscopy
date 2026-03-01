"use client";
import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react';
import { WagmiProvider } from 'wagmi';
import { mainnet } from 'viem/chains';
import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apechain = {
  id: 33139,
  name: 'ApeChain',
  nativeCurrency: { 
    name: 'ApeCoin', 
    symbol: 'APE', 
    decimals: 18 
  },
  rpcUrls: {
    default: { 
      http: ['https://rpc.apechain.com'] 
    }
  },
  blockExplorers: {
    default: { 
      name: 'ApeScan', 
      url: 'https://apescan.io' 
    }
  }
} as const;
const queryClient = new QueryClient();
const projectId = '0f9ff0f0497c73187c253e88cf8680c9';


const metadata = { name: 'Prima Cult', description: 'Prima Cult Wardrobe', url: 'https://tu-sitio-web.com', icons: ['/logo.png'] };
const chains = [apechain, mainnet] as const;
const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata });
createWeb3Modal({ wagmiConfig, projectId, chains });

export default function Web3ModalProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig} reconnectOnMount={false}> {/* reconnectOnMount en false */}
        {children}
      </WagmiProvider>
    </QueryClientProvider>
  );
}


