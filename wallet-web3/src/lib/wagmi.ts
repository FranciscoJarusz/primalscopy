import { defaultWagmiConfig } from '@web3modal/wagmi/react';
import { mainnet, sepolia } from 'wagmi/chains';
import { CONTRACTS, SUPPORTED_NETWORKS } from '../config/contracts';

export const projectId = '0f9ff0f0497c73187c253e88cf8680c9';

// Definir ApeChain
const apechain = {
  id: CONTRACTS.PRIMACULT_NFT.chainId,
  name: SUPPORTED_NETWORKS[CONTRACTS.PRIMACULT_NFT.chainId].name,
  network: 'apechain',
  nativeCurrency: {
    name: SUPPORTED_NETWORKS[CONTRACTS.PRIMACULT_NFT.chainId].currency,
    symbol: SUPPORTED_NETWORKS[CONTRACTS.PRIMACULT_NFT.chainId].currency,
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [SUPPORTED_NETWORKS[CONTRACTS.PRIMACULT_NFT.chainId].rpcUrl],
    },
    public: {
      http: [SUPPORTED_NETWORKS[CONTRACTS.PRIMACULT_NFT.chainId].rpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: 'ApeChain Explorer',
      url: SUPPORTED_NETWORKS[CONTRACTS.PRIMACULT_NFT.chainId].explorer,
    },
  },
} as const;

// Configurar los chains (incluyendo ApeChain)
const chains = [mainnet, sepolia, apechain] as const;

// Crear la configuración de Wagmi
export const config = defaultWagmiConfig({ 
  chains, 
  projectId,
  metadata: {
    name: 'PrimaCult Wardrobe',
    description: 'Personaliza tus NFTs de PrimaCult',
    url: 'https://primacult.com',
    icons: ['https://primacult.com/icon.png']
  }
});

// La inicialización de Web3Modal está en lib/web3modal-init.ts para cargarse antes de los hooks
