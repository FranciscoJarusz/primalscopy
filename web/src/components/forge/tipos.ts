// Lo que devuelve el backend del Forge (/api/forge).

export type Traits = Record<string, string>;
export type Layer = { name: string; imageUrl: string };
export type RollOption = { changes: Traits; layers: Record<string, Layer> };

export type PendingRoll = {
    rollId: string;
    keep: string[];
    before: Traits;
    options: RollOption[];
    createdAt: string;
};

// Como se paga un roll. `priceWei` viene como texto: no entra en un number.
export type PaymentInfo =
    | { required: false }
    | {
          required: true;
          chainId: number;
          treasury: `0x${string}`;
          priceWei: string;
          price: string;
          confirmations: number;
      };

export type ForgeStatus = {
    tokenId: string;
    eligible: boolean;
    reason?: string;
    rollableCategories: string[];
    maxKeep: number;
    testMode: boolean;
    available: boolean;
    payment: PaymentInfo;
    traits?: Traits;
    image?: string | null;
    localImage?: string | null;
    probabilities?: Record<string, Record<string, number>>;
    collectionShare?: Record<string, Record<string, number>>;
    pending?: PendingRoll | null;
};

export type Probabilidades = Record<string, Record<string, number>>;
