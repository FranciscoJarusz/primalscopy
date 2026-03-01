// Configuración de contratos de PrimaCult
export const CONTRACTS = {
  // Contrato principal de NFTs de PrimaCult
  PRIMACULT_NFT: {
    address: process.env.PRIMACULT_CONTRACT_ADDRESS || '0xe277a7643562775c4f4257e23b068ba8f45608b4',
    name: 'PrimaCult NFT',
    symbol: 'PRIMACULT',
    chainId: 33139, // ApeChain Mainnet
  },
  
  // Contrato de traits personalizables (si existe)
  TRAITS_CONTRACT: {
    address: '0xe277A7643562775C4f4257E23B068ba8F45608b4', // Reemplazar con la dirección real
    name: 'PrimaCult Traits',
    symbol: 'TRAITS',
    chainId: 137,
  }
};

// Redes soportadas
export const SUPPORTED_NETWORKS: Record<number, {
  name: string;
  rpcUrl: string;
  explorer: string;
  currency: string;
}> = {
  1: {
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://mainnet.infura.io/v3/92255810b7114da29bbd515558294bd0',
    explorer: 'https://etherscan.io',
    currency: 'ETH'
  },
  5: {
    name: 'Goerli Testnet',
    rpcUrl: 'https://goerli.infura.io/v3/92255810b7114da29bbd515558294bd0',
    explorer: 'https://goerli.etherscan.io',
    currency: 'ETH'
  },
  33139: {
    name: 'ApeChain',
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://rpc.apechain.com',
    explorer: 'https://apescan.io',
    currency: 'APE'
  }
};

// Función para obtener la red actual
export const getCurrentNetwork = () => {
  if (typeof window !== 'undefined' && (window as any).ethereum) {
    return (window as any).ethereum.networkVersion;
  }
  return null;
};

// Función para verificar si la red está soportada
export const isNetworkSupported = (chainId: string | number) => {
  return Object.keys(SUPPORTED_NETWORKS).includes(chainId.toString());
};

// Función para cambiar a una red soportada
export const switchToNetwork = async (chainId: string | number) => {
  if (typeof window !== 'undefined' && (window as any).ethereum) {
    try {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${Number(chainId).toString(16)}` }],
      });
    } catch (switchError: any) {
      // Si la red no está agregada, intentar agregarla
      if (switchError.code === 4902) {
        const network = SUPPORTED_NETWORKS[chainId as keyof typeof SUPPORTED_NETWORKS];
        if (network) {
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${Number(chainId).toString(16)}`,
              chainName: network.name,
              nativeCurrency: {
                name: network.currency,
                symbol: network.currency,
                decimals: 18
              },
              rpcUrls: [network.rpcUrl],
              blockExplorerUrls: [network.explorer]
            }],
          });
        }
      }
    }
  }
};

