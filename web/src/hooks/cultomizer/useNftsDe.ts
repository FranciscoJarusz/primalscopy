import { useCallback, useEffect, useState } from 'react';
import type { Nft } from './useUserNFTs';

export function useNftsDe(address: string | undefined) {
    const [nfts, setNfts] = useState<Nft[]>([]);
    const [isLoading, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [vuelta, setVuelta] = useState(0);

    useEffect(() => {
        setNfts([]);
        setError(null);
        if (!address) return;
        let cancelado = false;
        setCargando(true);
        fetch(`/api/user/nfts?address=${address}`)
            .then(async (r) => {
                if (!r.ok) throw new Error(`The server answered ${r.status}`);
                const data = await r.json();
                if (cancelado) return;
                setNfts(
                    (data.nfts ?? []).map((nft: any) => ({
                        id: String(nft.tokenId ?? nft.id),
                        tokenId: String(nft.tokenId ?? nft.id),
                        name: nft.name || `PrimaCult #${nft.tokenId ?? nft.id}`,
                        imageUrl: nft.imageUrl || nft.image,
                        metadata: typeof nft.metadata === 'string' ? JSON.parse(nft.metadata) : nft.metadata,
                    }))
                );
            })
            .catch((e) => !cancelado && setError(e instanceof Error ? e.message : "Couldn't load your Primals"))
            .finally(() => !cancelado && setCargando(false));
        return () => {
            cancelado = true;
        };
    }, [address, vuelta]);

    const refreshNfts = useCallback(() => setVuelta((v) => v + 1), []);
    return { nfts, isLoading, error, refreshNfts };
}
