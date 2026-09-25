// Lo que devuelve el backend del LAB (/api/lab).

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

export type LabStatus = {
    tokenId: string;
    eligible: boolean;
    reason?: string;
    rollableCategories: string[];
    maxKeep: number;
    testMode: boolean;
    available: boolean;
    traits?: Traits;
    image?: string | null;
    localImage?: string | null;
    probabilities?: Record<string, Record<string, number>>;
    pending?: PendingRoll | null;
};

export type Probabilidades = Record<string, Record<string, number>>;
