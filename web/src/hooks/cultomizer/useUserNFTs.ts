import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { erc721Abi } from "viem";
import { NFT_CONTRACT_ADDRESS, APECHAIN } from "@/lib/cultomizer/contracts";

export interface Nft {
  id: string;
  tokenId: string;
  name?: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface NftCheck {
  ok: boolean;
  tokenId: string;
  address?: string;
  owner?: string;
  balance?: number;
  isOwner?: boolean;
  error?: string;
}

/// Los NFTs de la coleccion que tiene la wallet conectada.
///
/// El balance se lee directo de la cadena con wagmi; la list de tokens sale de
/// /api/user/nfts, que barre la coleccion con multicall del lado del servidor.
///
/// Dos caminos que tenia la version anterior no estan mas, porque no podian
/// funcionar: pedir los tokens con `tokenOfOwnerByIndex` (el contrato no es
/// ERC721Enumerable, revierte) y la cascada de tres endpoints que hacian lo
/// mismo. Hoy es un solo pedido.
export function useUserNFTs() {
  const { address, isConnected } = useAccount();

  const [nfts, setNfts] = useState<Nft[]>([]);
  const [loading, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastWallet, setUltimaWallet] = useState<string | null>(null);

  // El chainId va fijo a proposito. Sin esto wagmi usa la red activa de la
  // wallet: una wallet de celular suele conectarse en Ethereum, donde este
  // contrato no existe, y balanceOf fallaba dejando la pantalla vacia.
  const {
    data: balanceData,
    error: balanceError,
    isLoading: balanceLoading,
  } = useReadContracts({
    contracts: [
      {
        address: NFT_CONTRACT_ADDRESS,
        abi: erc721Abi,
        functionName: "balanceOf",
        args: [address!],
        chainId: APECHAIN.id,
      },
    ],
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 30_000,
    },
  });

  const balance = balanceData ? Number(balanceData[0]?.result ?? 0) : 0;

  useEffect(() => {
    if (!isConnected || !address) {
      setNfts([]);
      setError(null);
      setCargando(false);
      return;
    }

    // Ya cargados para esta wallet: no se vuelve a pedir.
    if (lastWallet === address && nfts.length > 0) return;

    if (balanceError) {
      setError(`Error al verificar balance: ${balanceError.message}`);
      setCargando(false);
      return;
    }

    if (balanceLoading) return;

    if (balance === 0) {
      setNfts([]);
      setUltimaWallet(address);
      setCargando(false);
      return;
    }

    let cancelled = false;
    setCargando(true);
    setError(null);

    (async () => {
      try {
        const response = await fetch(`/api/user/nfts?address=${address}`);
        if (!response.ok)
          throw new Error(`El servidor respondio ${response.status}`);

        const data = await response.json();
        if (cancelled) return;

        const list: Nft[] = (data.nfts ?? []).map((nft: any) => ({
          id: String(nft.tokenId ?? nft.id),
          tokenId: String(nft.tokenId ?? nft.id),
          name: nft.name || `PrimaCult #${nft.tokenId ?? nft.id}`,
          imageUrl: nft.imageUrl || nft.image,
          metadata:
            typeof nft.metadata === "string"
              ? JSON.parse(nft.metadata)
              : nft.metadata,
        }));

        setNfts(list);
        setUltimaWallet(address);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "No se pudieron cargar los NFTs",
          );
        }
      } finally {
        if (!cancelled) setCargando(false);
      }
    })();

    // Si la wallet cambia mientras la consulta esta en vuelo, la response
    // vieja no tiene que pisar la nueva.
    return () => {
      cancelled = true;
    };
  }, [
    isConnected,
    address,
    balance,
    balanceLoading,
    balanceError,
    lastWallet,
    nfts.length,
  ]);

  const refreshNfts = useCallback(() => {
    setUltimaWallet(null);
    setNfts([]);
    setError(null);
  }, []);

  /// Comprueba contra la cadena si esta wallet es duena de un token puntual.
  const checkSpecificNFT = useCallback(
    async (tokenId: string): Promise<NftCheck> => {
      try {
        const response = await fetch(
          `/api/check-nft-ownership?tokenId=${tokenId}&address=${address}`,
        );
        const result = await response.json();

        if (!response.ok) {
          return {
            ok: false,
            tokenId,
            address,
            error: result?.error || "No se pudo verificar el NFT",
          };
        }

        return { ok: true, ...result };
      } catch {
        return {
          ok: false,
          tokenId,
          address,
          error: "Error de red al verificar el NFT",
        };
      }
    },
    [address],
  );

  return {
    nfts,
    isLoading: loading || balanceLoading,
    error,
    balance,
    refreshNfts,
    checkSpecificNFT,
    isConnected,
  };
}
