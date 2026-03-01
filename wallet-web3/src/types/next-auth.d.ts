// Tipos simples para la aplicación sin NextAuth
export interface NFT {
  id: string;
  tokenId: string;
  contractAddress: string;
  ownerAddress: string;
  metadata?: string;
  imageUrl?: string;
  traits?: string;
}

export interface TraitOption {
  name: string;
  imageUrl: string;
}

export interface TraitCategory {
  currentValue: string;
  variants: TraitOption[];
}
